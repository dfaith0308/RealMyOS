'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { getSettings } from '@/actions/settings'
import { DEFAULT_SETTINGS } from '@/constants/settings'
import { calcActionScore, calcAction, calcOrderCycle, calcCustomerStatus, calcNextActionDate } from '@/lib/customer-logic'
import { getPendingCollectionMap } from '@/actions/collection'
import type { ActionMessage } from '@/lib/customer-logic'
import type { ActionResult } from '@/types/order'
import { serializeSafe } from '@/lib/serialize-safe'
import { getAdminSettingNumber } from '@/actions/admin/policy-console'
import {
  effectiveOrderAmount,
  getAccountsReceivable,
  getOverdueReceivable,
  getCustomerDeposit,
} from '@/lib/ledger-calc'
import { fetchInboundSupersededOriginalPaymentIds } from '@/lib/inbound-payment-superseded'

// ============================================================
// 원장 허브용 셀렉트 데이터 (RULE-01)
// ============================================================

export interface LedgerCustomerOption {
  id:   string
  name: string
  phone: string | null
  representative_name: string | null
}

export async function getLedgerCustomers(): Promise<ActionResult<LedgerCustomerOption[]>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, representative_name')
    .eq('tenant_id', ctx.tenant_id)
    .eq('is_buyer', true)
    .is('deleted_at', null)
    .order('name')
    .limit(1000)

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: (data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone ?? null,
      representative_name: c.representative_name ?? null,
    })),
  }
}

export async function getLedgerSuppliers(): Promise<ActionResult<string[]>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('purchases')
    .select('counterparty_name')
    .eq('tenant_id', ctx.tenant_id)
    .order('counterparty_name', { ascending: true })
    .limit(2000)

  if (error) return { success: false, error: error.message }
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of data ?? []) {
    const name = (row.counterparty_name ?? '').trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return { success: true, data: out }
}

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
  /** @deprecated 미수금(AR). getAccountsReceivable 결과와 동일 */
  current_balance: number
}

export interface TaxSummary {
  taxable_paid: number
  card_paid: number
  invoice_amount: number
}

export interface CustomerLedgerOptions {
  from?:           string
  to?:             string
  payment_method?: string
}

export async function getCustomerLedger(
  customer_id: string,
  options?: CustomerLedgerOptions,
): Promise<ActionResult<{ rows: LedgerRow[]; summary: LedgerSummary; tax_summary: TaxSummary }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, opening_balance')
    .eq('id', customer_id)
    .eq('tenant_id', ctx.tenant_id)
    .is('deleted_at', null)
    .single()
  if (!customer) return { success: false, error: '거래처를 찾을 수 없습니다.' }

  let ordersQuery = supabase
    .from('orders')
    .select('id, order_number, order_date, created_at, total_amount, discount_amount, point_used, final_amount, total_supply_price, total_vat_amount, memo, order_lines(product_name, quantity)')
    .eq('customer_id', customer_id)
    // 전환: seller_tenant_id 우선 (legacy tenant_id 병행)
    .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .order('order_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (options?.from) ordersQuery = ordersQuery.gte('order_date', options.from)
  if (options?.to)   ordersQuery = ordersQuery.lte('order_date', options.to)

  const payeeScope = `payee_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`
  const supersededInbound = await fetchInboundSupersededOriginalPaymentIds(supabase, payeeScope)

  let paymentsQuery = supabase
    .from('payments')
    .select('id, payment_date, created_at, amount, payment_method, memo')
    .eq('customer_id', customer_id)
    // 전환: payee_tenant_id 우선 (legacy tenant_id 병행)
    .or(payeeScope)
    .eq('direction', 'inbound')
    .eq('status', 'confirmed')
    .is('reversal_of_id', null)
    .order('payment_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (supersededInbound.length) {
    paymentsQuery = paymentsQuery.not('id', 'in', `(${supersededInbound.join(',')})`)
  }

  if (options?.from)           paymentsQuery = paymentsQuery.gte('payment_date', options.from)
  if (options?.to)             paymentsQuery = paymentsQuery.lte('payment_date', options.to)
  if (options?.payment_method) paymentsQuery = paymentsQuery.eq('payment_method', options.payment_method)

  const [{ data: orders }, { data: payments }] = await Promise.all([ordersQuery, paymentsQuery])

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
      const orderAmt = effectiveOrderAmount(o as { final_amount?: number | null; total_amount: number })
      running += orderAmt
      const lines = (o.order_lines ?? []) as Array<{ product_name: string; quantity: number }>
      const summary = lines.length === 0 ? '-'
        : lines.length === 1 ? `${lines[0].product_name} ${lines[0].quantity}개`
        : `${lines[0].product_name} 외 ${lines.length - 1}건`
      return {
        id: o.id, date: o.order_date, created_at: o.created_at, type: 'order',
        order_number: o.order_number, summary,
        total_supply_price: o.total_supply_price, total_vat_amount: o.total_vat_amount,
        total_amount: orderAmt, memo: o.memo ?? undefined, running_balance: running,
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

  const totalOrders   = (orders ?? []).reduce((s, o) => s + effectiveOrderAmount(o as { final_amount?: number | null; total_amount: number }), 0)
  const totalPayments = (payments ?? []).reduce((s, p) => s + p.amount, 0)
  const current_balance = getAccountsReceivable(customer.opening_balance ?? 0, totalOrders, totalPayments, 0)

  const tax_summary: TaxSummary = (() => {
    // MVP: 수금 기준 세금계산서 대상 금액 집계 (RULE-02: 런타임 계산만, DB 저장 금지)
    let taxable_paid = 0
    let card_paid = 0
    for (const p of payments ?? []) {
      const method = (p as { payment_method?: string | null }).payment_method ?? null
      const amount = Number((p as { amount?: number | null }).amount ?? 0)
      if (!amount) continue

      if (method === 'cash' || method === 'transfer') taxable_paid += amount
      else if (method === 'card') card_paid += amount
    }
    return {
      taxable_paid,
      card_paid,
      invoice_amount: taxable_paid,
    }
  })()

  return {
    success: true,
    data: {
      rows,
      summary: {
        customer_id: customer.id, customer_name: customer.name,
        opening_balance: customer.opening_balance ?? 0,
        total_orders: totalOrders, total_payments: totalPayments,
        current_balance,
      },
      tax_summary,
    },
  }
}

// ============================================================
// 거래처 목록
// ============================================================

export type CustomerStatus = 'danger' | 'warning' | 'new' | 'normal' | 'scheduled'

export interface CustomerWithBalance {
  id: string
  name: string
  phone: string | null
  payment_terms_days: number
  // ── 잔액 ───────────────────────────────────────────────────
  /** @deprecated 신규 로직·UI는 receivable_amount 사용 */
  current_balance: number
  receivable_amount: number    // getAccountsReceivable (미수금)
  deposit_amount: number       // customer_deposits.balance
  overdue_amount: number       // getOverdueReceivable
  // ── 주문 ───────────────────────────────────────────────────
  last_order_date: string | null
  last_order_amount: number | null
  days_since_order: number | null
  order_cycle_days: number | null
  monthly_revenue: number
  avg_monthly_revenue: number
  target_monthly_revenue: number
  revenue_gap: number
  // ── 연락 ───────────────────────────────────────────────────
  last_contacted_at: string | null
  days_since_contact: number | null
  // ── 수금 ───────────────────────────────────────────────────
  last_payment_date: string | null
  days_since_payment: number | null
  // ── 전환율 지표 (7일) ───────────────────────────────────────
  call_attempts_7d: number
  connected_7d: number
  payments_7d: number
  call_connect_rate: number | null
  connect_to_payment_rate: number | null
  // ── 상태 ───────────────────────────────────────────────────
  status: CustomerStatus
}

// ============================================================
// 일별 현금흐름 (최근 7일)
// ============================================================

export interface DailyCashflow {
  date: string         // YYYY-MM-DD
  revenue: number      // confirmed 주문 합계
  collected: number    // 수금 합계
  net: number          // collected - revenue (양수 = 흑자)
}

export async function getDailyCashflow(): Promise<ActionResult<DailyCashflow[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const payeeScope = `payee_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`
  const supersededInbound = await fetchInboundSupersededOriginalPaymentIds(supabase, payeeScope)

  let paymentsQuery = supabase
    .from('payments')
    .select('payment_date, amount')
    .or(payeeScope)
    .eq('direction', 'inbound')
    .eq('status', 'confirmed')
    .is('reversal_of_id', null)
    .gte('payment_date', since7d)
  if (supersededInbound.length) {
    paymentsQuery = paymentsQuery.not('id', 'in', `(${supersededInbound.join(',')})`)
  }

  const [{ data: orders }, { data: payments }] = await Promise.all([
    supabase.from('orders')
      .select('order_date, total_amount, discount_amount, point_used, final_amount')
      // 전환: seller_tenant_id 우선 (legacy tenant_id 병행)
      .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
      .eq('status', 'confirmed')
      .is('deleted_at', null)
      .gte('order_date', since7d),
    paymentsQuery,
  ])

  const revenueByDate  = new Map<string, number>()
  const collectedByDate = new Map<string, number>()
  for (const o of orders ?? []) {
    revenueByDate.set(
      o.order_date,
      (revenueByDate.get(o.order_date) ?? 0) + effectiveOrderAmount(o as { final_amount?: number | null; total_amount: number }),
    )
  }
  for (const p of payments ?? []) collectedByDate.set(p.payment_date, (collectedByDate.get(p.payment_date) ?? 0) + p.amount)

  const today = new Date()
  const result: DailyCashflow[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const date = d.toISOString().slice(0, 10)
    const revenue   = revenueByDate.get(date)  ?? 0
    const collected = collectedByDate.get(date) ?? 0
    result.push({ date, revenue, collected, net: collected - revenue })
  }
  return { success: true, data: result }
}

export async function getCustomersWithBalance(): Promise<ActionResult<CustomerWithBalance[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const settingsResult = await getSettings()
  const cfg = settingsResult.success && settingsResult.data ? settingsResult.data : DEFAULT_SETTINGS

  const orderCycleCount = await getAdminSettingNumber('order_cycle_calculation_count', { min: 2, max: 90 })

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, phone, opening_balance, payment_terms_days, target_monthly_revenue')
    .eq('tenant_id', ctx.tenant_id)
    .eq('is_buyer', true)
    .is('deleted_at', null)
    .order('name')

  if (!customers?.length) return { success: true, data: [] }
  const ids = customers.map((c) => c.id)

  const payeeScope = `payee_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`
  const supersededInbound = await fetchInboundSupersededOriginalPaymentIds(supabase, payeeScope)

  let paymentRowsQuery = supabase
    .from('payments')
    .select('customer_id, amount, payment_date')
    .in('customer_id', ids)
    .or(payeeScope)
    .eq('direction', 'inbound')
    .eq('status', 'confirmed')
    .is('reversal_of_id', null)
  if (supersededInbound.length) {
    paymentRowsQuery = paymentRowsQuery.not('id', 'in', `(${supersededInbound.join(',')})`)
  }

  const collectionResult = await getPendingCollectionMap(ctx.tenant_id, supabase).catch(e => {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return { enabled: false, data: {} as Record<string, import('@/actions/collection').CollectionSchedule | null>, error: msg }
  })
  const collectionMap = collectionResult.data ?? {}

    const [{ data: allOrders }, { data: paymentRows }, { data: contactRows }, { data: actionRows7d }, { data: depositRows }] =
    await Promise.all([
      supabase.from('orders')
        .select('customer_id, final_amount, total_amount, discount_amount, point_used, order_date')
        .in('customer_id', ids)
        // 전환: seller_tenant_id 우선 (legacy tenant_id 병행)
        .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
        .eq('status', 'confirmed')
        .is('deleted_at', null)
        .order('order_date', { ascending: false }),

      paymentRowsQuery,

      supabase.from('contact_logs')
        .select('customer_id, contacted_at, contact_method, outcome')
        .in('customer_id', ids)
        .in('contact_method', ['call'])
        .order('contacted_at', { ascending: false }),

      supabase.from('action_logs')
        .select('customer_id, action_type, result_type, created_at')
        .in('customer_id', ids)
        .eq('action_type', 'call')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),

      supabase.from('customer_deposits')
        .select('customer_id, balance')
        .eq('tenant_id', ctx.tenant_id)
        .in('customer_id', ids),
    ])

  // ── 집계 맵 ──────────────────────────────────────────────

  const WINDOW_7D   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const termsMap    = new Map(customers.map((c) => [c.id, c.payment_terms_days ?? 0]))
  const openingMap  = new Map(customers.map((c) => [c.id, c.opening_balance ?? 0]))

  const ordersByCustomer = new Map<string, Array<{ final_amount: number; total_amount: number; order_date: string }>>()
  for (const o of allOrders ?? []) {
    const list = ordersByCustomer.get(o.customer_id) ?? []
    list.push(o)
    ordersByCustomer.set(o.customer_id, list)
  }

  const paymentMap  = new Map<string, number>()
  const lastPaymentMap = new Map<string, string>()
  for (const p of paymentRows ?? []) {
    paymentMap.set(p.customer_id, (paymentMap.get(p.customer_id) ?? 0) + p.amount)
    const d = (p as any).payment_date as string | undefined
    if (d) {
      const prev = lastPaymentMap.get(p.customer_id) ?? null
      if (!prev || d > prev) lastPaymentMap.set(p.customer_id, d)
    }
  }

  const depositByCustomer = new Map<string, number>()
  for (const row of depositRows ?? [] as Array<{ customer_id: string; balance?: number | null }>) {
    depositByCustomer.set(row.customer_id, getCustomerDeposit(row.balance))
  }

  const lastContactMap = new Map<string, string>()
  for (const cl of contactRows ?? [])
    if (!lastContactMap.has(cl.customer_id)) lastContactMap.set(cl.customer_id, cl.contacted_at)

  const callAttempts7d = new Map<string, number>()
  const connected7d    = new Map<string, number>()
  for (const cl of contactRows ?? []) {
    if (cl.contacted_at < WINDOW_7D) continue
    if (cl.contact_method === 'call')
      callAttempts7d.set(cl.customer_id, (callAttempts7d.get(cl.customer_id) ?? 0) + 1)
    if (cl.outcome === 'connected')
      connected7d.set(cl.customer_id, (connected7d.get(cl.customer_id) ?? 0) + 1)
  }
  const payments7d = new Map<string, number>()
  for (const al of actionRows7d ?? [])
    if (al.result_type === 'payment_completed')
      payments7d.set(al.customer_id, (payments7d.get(al.customer_id) ?? 0) + 1)

  // KST 기준 오늘 날짜 (Vercel 서버는 UTC)
  const nowKST     = new Date(Date.now() + 9 * 3600000)
  const todayStr   = nowKST.toISOString().slice(0, 10)
  const monthStart = `${nowKST.getUTCFullYear()}-${String(nowKST.getUTCMonth() + 1).padStart(2, '0')}-01`
  // days_since 계산용 (UTC midnight)
  const today      = new Date(todayStr + 'T00:00:00Z')

  const result: CustomerWithBalance[] = customers.map((c) => {
    const orders  = ordersByCustomer.get(c.id) ?? []
    const terms   = termsMap.get(c.id) ?? 0
    const opening = openingMap.get(c.id) ?? 0
    const paid    = paymentMap.get(c.id) ?? 0

    const totalFinal      = orders.reduce((s, o) => s + effectiveOrderAmount(o as any), 0)
    const totalOrdersAmt  = orders.reduce((s, o) => s + o.total_amount, 0)  // 매출 집계용
    const receivable_amount = getAccountsReceivable(opening, totalFinal, paid, 0)
    const current_balance   = receivable_amount
    const deposit_amount    = depositByCustomer.get(c.id) ?? 0
    const overdue_amount    = getOverdueReceivable(orders, terms, paid, todayStr)

    const last_order_date   = orders[0]?.order_date ?? null
    const last_order_amount = orders[0]?.total_amount ?? null
    const days_since_order  = last_order_date
      ? Math.floor((today.getTime() - new Date(last_order_date).getTime()) / 86400000)
      : null

    const recentDates      = orders.slice(0, orderCycleCount).map((o) => o.order_date)
    const order_cycle_days = calcOrderCycle(recentDates)

    const monthly_revenue = orders
      .filter((o) => o.order_date >= monthStart)
      .reduce((s, o) => s + o.total_amount, 0)

    // 평균 월매출: 월별 합산 후 3으로 나눔
    const monthlyTotals = new Map<string, number>()
    const threeMonthAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1).toISOString().slice(0, 10)
    for (const o of orders.filter((o) => o.order_date >= threeMonthAgo)) {
      const ym = o.order_date.slice(0, 7)
      monthlyTotals.set(ym, (monthlyTotals.get(ym) ?? 0) + o.total_amount)
    }
    const m1 = monthlyTotals.get(new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 7)) ?? 0
    const m2 = monthlyTotals.get(new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString().slice(0, 7)) ?? 0
    const m3 = monthlyTotals.get(new Date(today.getFullYear(), today.getMonth() - 3, 1).toISOString().slice(0, 7)) ?? 0
    const avg_monthly_revenue = Math.round((m1 + m2 + m3) / 3)

    const target_monthly_revenue = (c as any).target_monthly_revenue ?? cfg.default_target_monthly_revenue ?? 0
    const revenue_gap = monthly_revenue - target_monthly_revenue

    const last_contacted_at  = lastContactMap.get(c.id) ?? null
    const days_since_contact = last_contacted_at
      ? Math.floor((today.getTime() - new Date(last_contacted_at).getTime()) / 86400000)
      : null

    const last_payment_date = lastPaymentMap.get(c.id) ?? null
    const days_since_payment = last_payment_date
      ? Math.floor(
          (today.getTime() - new Date(last_payment_date + 'T00:00:00Z').getTime()) / 86400000,
        )
      : null

    const is_new = last_order_date !== null
      ? days_since_order !== null && days_since_order <= cfg.new_customer_days
      : false

    let status = calcCustomerStatus({
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

    // 수금 예정 — pending schedule 있고 예정일이 오늘 이후이면 scheduled
    const pendingSchedule = collectionMap?.[c.id] ?? null
    if (pendingSchedule && (status === 'danger' || status === 'warning')) {
      const todayKST = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
      if (pendingSchedule.scheduled_date >= todayKST) {
        status = 'scheduled'
      }
      // 예정일 경과 → 원래 danger/warning 유지
    }

    const call_attempts_7d = callAttempts7d.get(c.id) ?? 0
    const connected_7d     = connected7d.get(c.id) ?? 0
    const payments_7d_val  = payments7d.get(c.id) ?? 0
    const call_connect_rate = call_attempts_7d >= 5
      ? connected_7d / call_attempts_7d : null
    const connect_to_payment_rate = connected_7d >= 3
      ? payments_7d_val / connected_7d : null

    return {
      id: c.id, name: c.name, phone: c.phone,
      payment_terms_days: c.payment_terms_days,
      current_balance, receivable_amount, overdue_amount, deposit_amount,
      last_order_date, last_order_amount, days_since_order,
      order_cycle_days, monthly_revenue, avg_monthly_revenue,
      target_monthly_revenue, revenue_gap,
      last_contacted_at, days_since_contact,
      last_payment_date, days_since_payment,
      call_attempts_7d, connected_7d,
      payments_7d: payments_7d_val,
      call_connect_rate, connect_to_payment_rate,
      status,
    }
  })

  const statusOrder: Record<CustomerStatus, number> = { danger: 0, warning: 1, scheduled: 2, new: 3, normal: 4 }
  result.sort((a, b) => statusOrder[a.status] - statusOrder[b.status])
  return { success: true, data: result }
}

// ============================================================
// CustomerWithScore
// ============================================================

export type { ActionMessage }

export interface CustomerWithScore extends CustomerWithBalance {
  score: number
  action_score: number
  next_action_date: string | null
  action: ActionMessage
}

export async function getCustomersWithScore(): Promise<ActionResult<CustomerWithScore[]>> {
  const base = await getCustomersWithBalance()
  if (!base.success || !base.data) return base as ActionResult<CustomerWithScore[]>

  const settingsResult = await getSettings()
  const cfg = settingsResult.success && settingsResult.data ? settingsResult.data : DEFAULT_SETTINGS

  const result: CustomerWithScore[] = base.data.map((c) => {
    const is_new = c.last_order_date !== null
      ? (c.days_since_order ?? 999) <= cfg.new_customer_days
      : false

    const action_score = calcActionScore({
      overdue_amount:          c.overdue_amount,
      receivable_amount:       c.receivable_amount,
      days_since_order:        c.days_since_order,
      order_cycle_days:        c.order_cycle_days,
      days_since_contact:      c.days_since_contact,
      is_new,
      call_connect_rate:       c.call_connect_rate,
      connect_to_payment_rate: c.connect_to_payment_rate,
      call_attempts_7d:        c.call_attempts_7d,
      payments_7d:             c.payments_7d,
      revenue_gap:             c.revenue_gap,
    })

    return {
      ...c,
      score: action_score,
      action_score,
      next_action_date: calcNextActionDate(c.last_order_date, c.order_cycle_days),
      action: calcAction(
        c.status,
        c.current_balance,
        c.days_since_order,
        cfg.warning_days,
        cfg.danger_days,
        cfg.new_customer_days,
        c.last_order_date,
        c.overdue_amount,
        c.revenue_gap,
      ),
    }
  })

  result.sort((a, b) => b.action_score - a.action_score)
  return { success: true, data: result }
}

// ============================================================
// customer_stats 기반 빠른 조회 (병렬 운영)
// getCustomersWithBalance 대비 쿼리 1회로 축소
// ============================================================

export interface CustomerWithStats extends CustomerWithScore {}

export async function getCustomersWithStats(): Promise<ActionResult<CustomerWithScore[]>> {
  try {
  const _fn0 = Date.now()
  const supabase = await createSupabaseServer()

  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const nowKST   = new Date(Date.now() + 9 * 3600000)
  const todayStr = nowKST.toISOString().slice(0, 10)

  const payeeScope = `payee_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`
  const supersededInbound = await fetchInboundSupersededOriginalPaymentIds(supabase, payeeScope)

  let paymentRowsQuery = supabase
    .from('payments')
    .select('customer_id, amount')
    .or(payeeScope)
    .eq('direction', 'inbound')
    .eq('status', 'confirmed')
    .is('reversal_of_id', null)
  if (supersededInbound.length) {
    paymentRowsQuery = paymentRowsQuery.not('id', 'in', `(${supersededInbound.join(',')})`)
  }

  // 4쿼리 병렬 — receivable 정확성을 위해 orders + payments 직접 조회
  const _q0 = Date.now()
  const [{ data: rows, error }, { data: statsRows }, { data: orderRows }, { data: paymentRows }, { data: depositRows }] = await Promise.all([
    supabase.from('customers')
      .select('id, name, phone, payment_terms_days, target_monthly_revenue, opening_balance')
      .eq('tenant_id', ctx.tenant_id).is('deleted_at', null).order('name'),
    supabase.from('customer_stats')
      // NOTE(FORENSIC-001): customer_stats.current_balance는 운영 검증에서 원장과 전부 불일치 → 사용 금지
      .select('customer_id, total_sales, last_payment_date')
      .eq('tenant_id', ctx.tenant_id),
    supabase.from('orders')
      .select('customer_id, final_amount, total_amount, discount_amount, point_used, order_date')
      // 전환: seller_tenant_id 우선 (legacy tenant_id 병행)
      .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
      .eq('status', 'confirmed').is('deleted_at', null),
    paymentRowsQuery,
    supabase.from('customer_deposits')
      .select('customer_id, balance')
      .eq('tenant_id', ctx.tenant_id),
  ])
  const settingsRows: any[] = []   // customer_settings 테이블 없음

  if (error) return { success: false, error: error.message }

  const statsMap    = new Map((statsRows    ?? []).map((s: any) => [s.customer_id, s]))
  const settingsMap = new Map((settingsRows ?? []).map((s: any) => [s.customer_id, s]))

  // final_amount = total_amount - discount_amount - point_used (앱 effectiveOrderAmount / DB generated)
  const orderFinalMap = new Map<string, number>()
  for (const o of orderRows ?? []) {
    orderFinalMap.set(o.customer_id, (orderFinalMap.get(o.customer_id) ?? 0) + effectiveOrderAmount(o as any))
  }
  const paidMap = new Map<string, number>()
  for (const p of paymentRows ?? []) {
    paidMap.set(p.customer_id, (paidMap.get(p.customer_id) ?? 0) + (p.amount ?? 0))
  }

  const ordersByCustomerStats = new Map<string, Array<{ order_date: string; final_amount?: number | null; total_amount: number; discount_amount?: number | null; point_used?: number | null }>>()
  for (const o of orderRows ?? [] as Array<{ customer_id: string; order_date: string; final_amount?: number | null; total_amount: number; discount_amount?: number | null; point_used?: number | null }>) {
    const list = ordersByCustomerStats.get(o.customer_id) ?? []
    list.push({
      order_date: o.order_date,
      final_amount: o.final_amount,
      total_amount: o.total_amount,
      discount_amount: o.discount_amount,
      point_used: o.point_used,
    })
    ordersByCustomerStats.set(o.customer_id, list)
  }

  const depositMapStats = new Map<string, number>()
  for (const row of depositRows ?? [] as Array<{ customer_id: string; balance?: number | null }>) {
    depositMapStats.set(row.customer_id, getCustomerDeposit(row.balance))
  }

  const _m0 = Date.now()
  const today = new Date(todayStr + 'T00:00:00Z')

  const result: CustomerWithStats[] = (rows ?? []).map((c: any) => {
    // null-safe stats / settings (stats 없는 거래처, settings 없는 거래처 모두 정상 처리)
    const stats = statsMap.get(c.id)    ?? {}
    const cfg   = settingsMap.get(c.id) ?? {}

    const opening           = c.opening_balance          ?? 0
    const total_sales       = Number((stats as any).total_sales ?? 0)
    const last_payment_date = (stats as any).last_payment_date ?? null

    const orderFinal    = orderFinalMap.get(c.id) ?? 0
    const paid          = paidMap.get(c.id)        ?? 0
    const receivable_amount = getAccountsReceivable(opening, orderFinal, paid, 0)
    const current_balance   = receivable_amount
    const deposit_amount    = depositMapStats.get(c.id) ?? 0
    const termsDays         = c.payment_terms_days ?? 0
    const custOrders        = ordersByCustomerStats.get(c.id) ?? []
    const overdue_amount    = getOverdueReceivable(custOrders, termsDays, paid, todayStr)

    const days_since_order  = last_payment_date
      ? Math.floor((today.getTime() - new Date(last_payment_date + 'T00:00:00Z').getTime()) / 86400000)
      : null
    const days_since_payment = days_since_order
    const days_since_contact: number | null = null
    const last_contacted_at: string | null  = null
    const order_cycle_days  = Number((cfg as any).order_cycle_days ?? 14)
    const new_customer_days = Number((cfg as any).new_customer_days ?? 30)

    // status — 모든 케이스 안전 처리
    const isNew     = days_since_order !== null && days_since_order <= new_customer_days
    const isDanger  = receivable_amount  > Number((cfg as any).overdue_danger_amount  ?? 500000)
    const isWarning = receivable_amount  > Number((cfg as any).overdue_warning_amount ?? 100000)
    let status: CustomerStatus =
      isNew ? 'new' : isDanger ? 'danger' : isWarning ? 'warning' : 'normal'

    // action_score — 모든 입력 null-safe (calcActionScore 내부도 방어됨)
    const action_score = calcActionScore({
      overdue_amount,
      receivable_amount,
      days_since_order,
      order_cycle_days,
      days_since_contact,
      is_new: isNew,
    })

    const anyCfg = cfg as any
    return {
      id: c.id, name: c.name, phone: c.phone,
      payment_terms_days:     c.payment_terms_days ?? 0,
      current_balance, receivable_amount, deposit_amount, overdue_amount,
      last_order_date:        last_payment_date,
      last_order_amount:      null,
      days_since_order,       order_cycle_days,
      monthly_revenue:        0,
      avg_monthly_revenue:    Math.round(total_sales / 3),
      target_monthly_revenue: Number(c.target_monthly_revenue ?? 0),
      revenue_gap:            Number(c.target_monthly_revenue ?? 0) - Math.round(total_sales / 3),
      last_contacted_at,      days_since_contact,
      last_payment_date,
      days_since_payment,
      call_attempts_7d:       0,
      connected_7d:           0,
      payments_7d:            0,
      call_connect_rate:      null,
      connect_to_payment_rate: null,
      payment_terms:          anyCfg.payment_terms          ?? 'monthly_end',
      payment_day:            anyCfg.payment_day            ?? null,
      overdue_warning_amount: anyCfg.overdue_warning_amount ?? 100000,
      overdue_danger_amount:  anyCfg.overdue_danger_amount  ?? 500000,
      status, action_score, score: action_score,
      next_action_date: calcNextActionDate(last_payment_date, order_cycle_days),
      action: calcAction(status, current_balance, days_since_order, 14, 30, new_customer_days, null, overdue_amount, 0),
    }
  })

  return serializeSafe({ success: true as const, data: result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return { success: false as const, error: msg }
  }
}