'use server'

import { createSupabaseServer } from '@/lib/supabase-server'
import { getSettings } from '@/actions/settings'
import { DEFAULT_SETTINGS } from '@/constants/settings'
import type { ActionResult } from '@/types/order'

// ============================================================
// 거래처별 원장 조회
// 주문 + 수금을 시간 순으로 합쳐서 누적잔액 계산
// ============================================================

export interface LedgerRow {
  id: string
  date: string
  created_at: string
  type: 'order' | 'payment'
  // 주문
  order_number?: string
  summary?: string          // "삼겹살 외 2건"
  total_supply_price?: number
  total_vat_amount?: number
  total_amount?: number
  // 수금
  payment_method?: string
  payment_amount?: number
  // 공통
  memo?: string
  running_balance: number   // 누적잔액 (계산값)
}

export interface LedgerSummary {
  customer_id: string
  customer_name: string
  opening_balance: number
  total_orders: number
  total_payments: number
  current_balance: number
}

export async function getCustomerLedger(
  customer_id: string,
): Promise<ActionResult<{ rows: LedgerRow[]; summary: LedgerSummary }>> {
  const supabase = await createSupabaseServer()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  // 1. 거래처 정보
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, opening_balance')
    .eq('id', customer_id)
    .is('deleted_at', null)
    .single()
  if (!customer) return { success: false, error: '거래처를 찾을 수 없습니다.' }

  // 2. 주문 조회 (confirmed만)
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id, order_number, order_date, created_at,
      total_amount, total_supply_price, total_vat_amount, memo,
      order_lines ( product_name, quantity )
    `)
    .eq('customer_id', customer_id)
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .order('order_date', { ascending: true })
    .order('created_at', { ascending: true })

  // 3. 수금 조회 (confirmed만)
  const { data: payments } = await supabase
    .from('payments')
    .select('id, payment_date, created_at, amount, payment_method, memo')
    .eq('customer_id', customer_id)
    .eq('status', 'confirmed')
    .order('payment_date', { ascending: true })
    .order('created_at', { ascending: true })

  // 4. 두 목록을 날짜+생성시간 기준으로 합치기
  type RawOrder = NonNullable<typeof orders>[number]
  type RawPayment = NonNullable<typeof payments>[number]

  const merged: Array<
    | { kind: 'order'; data: RawOrder }
    | { kind: 'payment'; data: RawPayment }
  > = [
    ...(orders ?? []).map((o) => ({ kind: 'order' as const, data: o })),
    ...(payments ?? []).map((p) => ({ kind: 'payment' as const, data: p })),
  ].sort((a, b) => {
    const dateA = a.kind === 'order' ? a.data.order_date : a.data.payment_date
    const dateB = b.kind === 'order' ? b.data.order_date : b.data.payment_date
    if (dateA !== dateB) return dateA.localeCompare(dateB)
    return a.data.created_at.localeCompare(b.data.created_at)
  })

  // 5. 누적잔액 계산
  let running = customer.opening_balance ?? 0
  const rows: LedgerRow[] = merged.map((item) => {
    if (item.kind === 'order') {
      const o = item.data
      running += o.total_amount
      const lines = (o.order_lines ?? []) as Array<{ product_name: string; quantity: number }>
      const summary = buildSummary(lines)
      return {
        id: o.id,
        date: o.order_date,
        created_at: o.created_at,
        type: 'order',
        order_number: o.order_number,
        summary,
        total_supply_price: o.total_supply_price,
        total_vat_amount: o.total_vat_amount,
        total_amount: o.total_amount,
        memo: o.memo ?? undefined,
        running_balance: running,
      }
    } else {
      const p = item.data
      running -= p.amount
      return {
        id: p.id,
        date: p.payment_date,
        created_at: p.created_at,
        type: 'payment',
        payment_method: p.payment_method,
        payment_amount: p.amount,
        memo: p.memo ?? undefined,
        running_balance: running,
      }
    }
  })

  const totalOrders = (orders ?? []).reduce((s, o) => s + o.total_amount, 0)
  const totalPayments = (payments ?? []).reduce((s, p) => s + p.amount, 0)

  return {
    success: true,
    data: {
      rows,
      summary: {
        customer_id: customer.id,
        customer_name: customer.name,
        opening_balance: customer.opening_balance ?? 0,
        total_orders: totalOrders,
        total_payments: totalPayments,
        current_balance: (customer.opening_balance ?? 0) + totalOrders - totalPayments,
      },
    },
  }
}

// 주문 라인 요약: "삼겹살 외 2건"
function buildSummary(
  lines: Array<{ product_name: string; quantity: number }>,
): string {
  if (!lines.length) return '-'
  const first = lines[0]
  const qty = first.quantity < 0 ? `${first.quantity}` : `${first.quantity}`
  if (lines.length === 1) return `${first.product_name} ${qty}개`
  return `${first.product_name} 외 ${lines.length - 1}건`
}

// ============================================================
// 거래처 목록 조회 (원장 페이지 진입용)
// ============================================================

export type CustomerStatus = 'danger' | 'warning' | 'new' | 'normal'

export interface CustomerWithBalance {
  id: string
  name: string
  phone: string | null
  payment_terms_days: number
  current_balance: number
  overdue_amount: number            // 연체금 = due_date 지난 주문 합계
  last_order_date: string | null    // 마지막 주문일
  days_since_order: number | null   // 마지막 주문일로부터 경과일
  last_contacted_at: string | null  // 마지막 연락 시각 (ISO string)
  days_since_contact: number | null // 마지막 연락으로부터 경과일
  status: CustomerStatus
}

// 상태 판단 — 기준값은 settings에서 주입 (하드코딩 금지)
function calcStatus(
  balance: number,
  daysSince: number | null,
  warningDays: number,
  dangerDays: number,
  overdueWarningAmount: number,
): CustomerStatus {
  if (daysSince === null) {
    return balance >= overdueWarningAmount ? 'danger' : 'new'
  }
  if (balance >= overdueWarningAmount && daysSince > dangerDays) return 'danger'
  if (balance >= overdueWarningAmount || daysSince > warningDays) return 'warning'
  return 'normal'
}

export async function getCustomersWithBalance(): Promise<
  ActionResult<CustomerWithBalance[]>
> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  // settings 먼저 조회 — 없으면 기능 동작 불가
  const settingsResult = await getSettings()
  const cfg = settingsResult.success && settingsResult.data
    ? settingsResult.data
    : DEFAULT_SETTINGS

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, phone, opening_balance, payment_terms_days')
    .eq('is_buyer', true)
    .is('deleted_at', null)
    .order('name')

  if (!customers) return { success: true, data: [] }

  const ids = customers.map((c) => c.id)

  // 주문 합계 + 마지막 주문일 + 연체금 계산용 개별 주문
  const { data: orderSums } = await supabase
    .from('orders')
    .select('customer_id, total_amount, order_date')
    .in('customer_id', ids)
    .eq('status', 'confirmed')
    .is('deleted_at', null)

  // 수금 합계
  const { data: paymentSums } = await supabase
    .from('payments')
    .select('customer_id, amount')
    .in('customer_id', ids)
    .eq('status', 'confirmed')

  // 마지막 전화 로그 (call / call_attempt만 — payment 제외)
  const { data: contactLogs } = await supabase
    .from('contact_logs')
    .select('customer_id, contacted_at')
    .in('customer_id', ids)
    .in('contact_method', ['call', 'call_attempt'])
    .order('contacted_at', { ascending: false })

  // 집계
  // customer별 payment_terms_days 맵
  const termsMap = new Map(customers.map((c) => [c.id, c.payment_terms_days ?? 0]))

  const orderMap = new Map<string, number>()
  const lastOrderMap = new Map<string, string>()
  const overdueMap = new Map<string, number>()   // 연체금 (due_date 지난 주문)

  const todayStr = new Date().toISOString().slice(0, 10)

  for (const o of orderSums ?? []) {
    orderMap.set(o.customer_id, (orderMap.get(o.customer_id) ?? 0) + o.total_amount)
    const prev = lastOrderMap.get(o.customer_id)
    if (!prev || o.order_date > prev) lastOrderMap.set(o.customer_id, o.order_date)

    // due_date = order_date + payment_terms_days
    const terms = termsMap.get(o.customer_id) ?? 0
    if (terms === 0) {
      // 즉시결제 → 주문일이 곧 due_date
      overdueMap.set(o.customer_id, (overdueMap.get(o.customer_id) ?? 0) + o.total_amount)
    } else {
      const due = new Date(o.order_date)
      due.setDate(due.getDate() + terms)
      const dueStr = due.toISOString().slice(0, 10)
      if (dueStr < todayStr) {
        overdueMap.set(o.customer_id, (overdueMap.get(o.customer_id) ?? 0) + o.total_amount)
      }
    }
  }
  const paymentMap = new Map<string, number>()
  for (const p of paymentSums ?? []) {
    paymentMap.set(p.customer_id, (paymentMap.get(p.customer_id) ?? 0) + p.amount)
  }

  const lastContactMap = new Map<string, string>()
  for (const cl of contactLogs ?? []) {
    if (!lastContactMap.has(cl.customer_id)) {
      lastContactMap.set(cl.customer_id, cl.contacted_at)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const result: CustomerWithBalance[] = customers.map((c) => {
    const balance =
      (c.opening_balance ?? 0) +
      (orderMap.get(c.id) ?? 0) -
      (paymentMap.get(c.id) ?? 0)
    const lastDate = lastOrderMap.get(c.id) ?? null
    const daysSince = lastDate
      ? Math.floor((today.getTime() - new Date(lastDate).getTime()) / 86400000)
      : null

    const lastContactedAt = lastContactMap.get(c.id) ?? null
    const daysSinceContact = lastContactedAt
      ? Math.floor((today.getTime() - new Date(lastContactedAt).getTime()) / 86400000)
      : null

    // 연체금 = 연체된 주문 합계 - 수금 합계 (0 미만이면 0)
    const rawOverdue = (overdueMap.get(c.id) ?? 0) - (paymentMap.get(c.id) ?? 0)
    const overdue_amount = Math.max(0, rawOverdue)

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      payment_terms_days: c.payment_terms_days,
      current_balance: balance,
      overdue_amount,
      last_order_date: lastDate,
      days_since_order: daysSince,
      last_contacted_at: lastContactedAt,
      days_since_contact: daysSinceContact,
      status: calcStatus(
        balance,
        daysSince,
        cfg.warning_days,
        cfg.danger_days,
        cfg.overdue_warning_amount,
      ),
    }
  })

  // 정렬: 위험 → 주의 → 신규 → 정상
  const order: Record<CustomerStatus, number> = { danger: 0, warning: 1, new: 2, normal: 3 }
  result.sort((a, b) => order[a.status] - order[b.status])

  return { success: true, data: result }
}

// ============================================================
// CustomerWithScore 타입 (async export 가능)
// 계산 함수는 lib/customer-logic.ts에 분리
// ============================================================

import { calcScore, calcAction } from '@/lib/customer-logic'
import type { ActionMessage } from '@/lib/customer-logic'

export type { ActionMessage }

export interface CustomerWithScore extends CustomerWithBalance {
  score: number
  action: ActionMessage
}

// ── 전체 목록 + score 조회 ─────────────────────────────────────

export async function getCustomersWithScore(): Promise<
  ActionResult<CustomerWithScore[]>
> {
  const base = await getCustomersWithBalance()
  if (!base.success || !base.data) return base as ActionResult<CustomerWithScore[]>

  // settings 조회 — calcAction에 기준값 주입
  const settingsResult = await getSettings()
  const cfg = settingsResult.success && settingsResult.data
    ? settingsResult.data
    : DEFAULT_SETTINGS

  const result: CustomerWithScore[] = base.data.map((c) => ({
    ...c,
    score: calcScore(c.current_balance, c.days_since_order),
    action: calcAction(
      c.status,
      c.current_balance,
      c.days_since_order,
      cfg.warning_days,
      cfg.danger_days,
      cfg.new_customer_days,
      c.last_order_date,      // firstOrderDate (isNew 판단용)
      c.overdue_amount,       // 연체금 기준
    ),
  }))

  // score 내림차순 정렬 (같은 상태 내에서도 긴급도 순)
  const statusOrder: Record<CustomerStatus, number> = { danger: 0, warning: 1, new: 2, normal: 3 }
  result.sort((a, b) => {
    const sd = statusOrder[a.status] - statusOrder[b.status]
    if (sd !== 0) return sd
    return b.score - a.score
  })

  return { success: true, data: result }
}