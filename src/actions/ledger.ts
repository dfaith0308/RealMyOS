'use server'

import { createSupabaseServer } from '@/lib/supabase-server'
import { getSettings } from '@/actions/settings'
import { DEFAULT_SETTINGS } from '@/constants/settings'
import { calcScore, calcAction, calcOrderCycle, calcCustomerStatus } from '@/lib/customer-logic'
import type { ActionMessage } from '@/lib/customer-logic'
import type { ActionResult } from '@/types/order'

// ============================================================
// 거래처별 원장
// ============================================================

export interface LedgerRow {
  id: string
  date: string
  created_at: string
  type: 'order' | 'payment'
  order_number?: string
  summary?: string
  total_supply_price?: number
  total_vat_amount?: number
  total_amount?: number
  payment_method?: string
  payment_amount?: number
  memo?: string
  running_balance: number
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

  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, opening_balance')
    .eq('id', customer_id)
    .is('deleted_at', null)
    .single()
  if (!customer) return { success: false, error: '거래처를 찾을 수 없습니다.' }

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, order_date, created_at, total_amount, total_supply_price, total_vat_amount, memo, order_lines(product_name, quantity)')
    .eq('customer_id', customer_id)
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .order('order_date', { ascending: true })
    .order('created_at', { ascending: true })

  const { data: payments } = await supabase
    .from('payments')
    .select('id, payment_date, created_at, amount, payment_method, memo')
    .eq('customer_id', customer_id)
    .eq('status', 'confirmed')
    .order('payment_date', { ascending: true })
    .order('created_at', { ascending: true })

  type RawOrder   = NonNullable<typeof orders>[number]
  type RawPayment = NonNullable<typeof payments>[number]

  const merged: Array<{ kind: 'order'; data: RawOrder } | { kind: 'payment'; data: RawPayment }> = [
    ...(orders ?? []).map((o) => ({ kind: 'order' as const, data: o })),
    ...(payments ?? []).map((p) => ({ kind: 'payment' as const, data: p })),
  ].sort((a, b) => {
    const da = a.kind === 'order' ? a.data.order_date : a.data.payment_date
    const db = b.kind === 'order' ? b.data.order_date : b.data.payment_date
    if (da !== db) return da.localeCompare(db)
    return a.data.created_at.localeCompare(b.data.created_at)
  })

  let running = customer.opening_balance ?? 0
  const rows: LedgerRow[] = merged.map((item) => {
    if (item.kind === 'order') {
      const o = item.data
      running += o.total_amount
      const lines = (o.order_lines ?? []) as Array<{ product_name: string; quantity: number }>
      const summary = lines.length === 0 ? '-'
        : lines.length === 1 ? `${lines[0].product_name} ${lines[0].quantity}개`
        : `${lines[0].product_name} 외 ${lines.length - 1}건`
      return {
        id: o.id, date: o.order_date, created_at: o.created_at, type: 'order',
        order_number: o.order_number, summary,
        total_supply_price: o.total_supply_price, total_vat_amount: o.total_vat_amount,
        total_amount: o.total_amount, memo: o.memo ?? undefined, running_balance: running,
      }
    } else {
      const p = item.data
      running -= p.amount
      return {
        id: p.id, date: p.payment_date, created_at: p.created_at, type: 'payment',
        payment_method: p.payment_method, payment_amount: p.amount,
        memo: p.memo ?? undefined, running_balance: running,
      }
    }
  })

  const totalOrders   = (orders ?? []).reduce((s, o) => s + o.total_amount, 0)
  const totalPayments = (payments ?? []).reduce((s, p) => s + p.amount, 0)

  return {
    success: true,
    data: {
      rows,
      summary: {
        customer_id: customer.id, customer_name: customer.name,
        opening_balance: customer.opening_balance ?? 0,
        total_orders: totalOrders, total_payments: totalPayments,
        current_balance: (customer.opening_balance ?? 0) + totalOrders - totalPayments,
      },
    },
  }
}

// ============================================================
// 거래처 목록
// ============================================================

export type CustomerStatus = 'danger' | 'warning' | 'new' | 'normal'

export interface CustomerWithBalance {
  id: string
  name: string
  phone: string | null
  payment_terms_days: number
  current_balance: number
  overdue_amount: number
  last_order_date: string | null
  last_order_amount: number | null
  days_since_order: number | null
  order_cycle_days: number | null
  monthly_revenue: number
  last_contacted_at: string | null
  days_since_contact: number | null
  status: CustomerStatus
}

export async function getCustomersWithBalance(): Promise<ActionResult<CustomerWithBalance[]>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const settingsResult = await getSettings()
  const cfg = settingsResult.success && settingsResult.data ? settingsResult.data : DEFAULT_SETTINGS

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, phone, opening_balance, payment_terms_days')
    .eq('is_buyer', true)
    .is('deleted_at', null)
    .order('name')

  if (!customers?.length) return { success: true, data: [] }
  const ids = customers.map((c) => c.id)

  // confirmed 주문만 — draft/cancelled 제외
  const { data: allOrders } = await supabase
    .from('orders')
    .select('customer_id, total_amount, order_date')
    .in('customer_id', ids)
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .order('order_date', { ascending: false })

  // confirmed 수금
  const { data: paymentRows } = await supabase
    .from('payments')
    .select('customer_id, amount')
    .in('customer_id', ids)
    .eq('status', 'confirmed')

  // 전화 로그 (call / call_attempt만 — payment 제외)
  const { data: contactRows } = await supabase
    .from('contact_logs')
    .select('customer_id, contacted_at')
    .in('customer_id', ids)
    .in('contact_method', ['call', 'call_attempt'])
    .order('contacted_at', { ascending: false })

  // ── 집계 맵 구성 ─────────────────────────────────────────

  const termsMap = new Map(customers.map((c) => [c.id, c.payment_terms_days ?? 0]))
  const openingMap = new Map(customers.map((c) => [c.id, c.opening_balance ?? 0]))

  // 거래처별 주문 리스트 (이미 내림차순 정렬)
  const ordersByCustomer = new Map<string, Array<{ total_amount: number; order_date: string }>>()
  for (const o of allOrders ?? []) {
    const list = ordersByCustomer.get(o.customer_id) ?? []
    list.push(o)
    ordersByCustomer.set(o.customer_id, list)
  }

  const paymentMap = new Map<string, number>()
  for (const p of paymentRows ?? []) {
    paymentMap.set(p.customer_id, (paymentMap.get(p.customer_id) ?? 0) + p.amount)
  }

  const lastContactMap = new Map<string, string>()
  for (const cl of contactRows ?? []) {
    if (!lastContactMap.has(cl.customer_id)) lastContactMap.set(cl.customer_id, cl.contacted_at)
  }

  const today     = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr  = today.toISOString().slice(0, 10)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)

  const result: CustomerWithBalance[] = customers.map((c) => {
    const orders  = ordersByCustomer.get(c.id) ?? []
    const terms   = termsMap.get(c.id) ?? 0
    const opening = openingMap.get(c.id) ?? 0
    const paid    = paymentMap.get(c.id) ?? 0

    const totalOrdersAmt = orders.reduce((s, o) => s + o.total_amount, 0)
    const current_balance = opening + totalOrdersAmt - paid

    // 연체금: due_date < today인 confirmed 주문 합계 - 수금
    let overdueSum = 0
    for (const o of orders) {
      const due = new Date(o.order_date)
      due.setDate(due.getDate() + terms)
      if (due.toISOString().slice(0, 10) < todayStr) overdueSum += o.total_amount
    }
    const overdue_amount = Math.max(0, overdueSum - paid)

    // 마지막 주문
    const last_order_date   = orders[0]?.order_date ?? null
    const last_order_amount = orders[0]?.total_amount ?? null
    const days_since_order  = last_order_date
      ? Math.floor((today.getTime() - new Date(last_order_date).getTime()) / 86400000)
      : null

    // 주문주기: 최근 5건 날짜 기준, confirmed만
    const recentDates  = orders.slice(0, 5).map((o) => o.order_date)
    const order_cycle_days = calcOrderCycle(recentDates)

    // 이번달 매출
    const monthly_revenue = orders
      .filter((o) => o.order_date >= monthStart)
      .reduce((s, o) => s + o.total_amount, 0)

    // 전화 연락
    const last_contacted_at  = lastContactMap.get(c.id) ?? null
    const days_since_contact = last_contacted_at
      ? Math.floor((today.getTime() - new Date(last_contacted_at).getTime()) / 86400000)
      : null

    // 신규 여부
    const is_new = last_order_date !== null
      ? days_since_order !== null && days_since_order <= cfg.new_customer_days
      : false

    // 상태 계산 (연체금 + 주문주기 기반 — 미수금 기준 사용 안 함)
    const status = calcCustomerStatus({
      overdue_amount,
      days_since_order,
      order_cycle_days,
      is_new,
      overdue_warning_amount:   cfg.overdue_warning_amount,
      overdue_danger_amount:    cfg.overdue_danger_amount,
      warning_cycle_multiplier: cfg.warning_cycle_multiplier,
      danger_cycle_multiplier:  cfg.danger_cycle_multiplier,
      warning_days:             cfg.warning_days,
      danger_days:              cfg.danger_days,
    })

    return {
      id: c.id, name: c.name, phone: c.phone,
      payment_terms_days: c.payment_terms_days,
      current_balance, overdue_amount,
      last_order_date, last_order_amount, days_since_order,
      order_cycle_days, monthly_revenue,
      last_contacted_at, days_since_contact,
      status,
    }
  })

  const statusOrder: Record<CustomerStatus, number> = { danger: 0, warning: 1, new: 2, normal: 3 }
  result.sort((a, b) => statusOrder[a.status] - statusOrder[b.status])

  return { success: true, data: result }
}

// ============================================================
// CustomerWithScore
// ============================================================

export type { ActionMessage }

export interface CustomerWithScore extends CustomerWithBalance {
  score: number
  action: ActionMessage
}

export async function getCustomersWithScore(): Promise<ActionResult<CustomerWithScore[]>> {
  const base = await getCustomersWithBalance()
  if (!base.success || !base.data) return base as ActionResult<CustomerWithScore[]>

  const settingsResult = await getSettings()
  const cfg = settingsResult.success && settingsResult.data ? settingsResult.data : DEFAULT_SETTINGS

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
      c.last_order_date,
      c.overdue_amount,
    ),
  }))

  const statusOrder: Record<CustomerStatus, number> = { danger: 0, warning: 1, new: 2, normal: 3 }
  result.sort((a, b) => {
    const sd = statusOrder[a.status] - statusOrder[b.status]
    return sd !== 0 ? sd : b.score - a.score
  })

  return { success: true, data: result }
}