'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'

/** `commerce.ts` storefront P0 수금 row와 동일 sentinel */
const PLATFORM_OWNER_TENANT = '00000000-0000-0000-0000-000000000000'

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

function requireAdminRole(role: string | undefined): role is 'admin' {
  return role === 'admin'
}

/** `settlement-control.ts` `monthRangeUtcNow` 와 동일 (KST 달력 → UTC date 문자열 start/end) */
function monthRangeKstDateStrings() {
  const k = new Date(Date.now() + 9 * 3600000)
  const y = k.getUTCFullYear()
  const m = k.getUTCMonth()
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10)
  return { start, end }
}

function kstTodayDateString() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
}

type RfqOrderRow = { final_amount?: number | null; total_amount?: number | null; order_date?: string | null }

function orderAmount(o: RfqOrderRow) {
  const f = o.final_amount
  const t = o.total_amount
  if (typeof f === 'number' && Number.isFinite(f)) return f
  if (typeof t === 'number' && Number.isFinite(t)) return t
  return 0
}

const PAY_FETCH_LIMIT = 50_000
const ORDERS_FETCH_LIMIT = 50_000

export type StorefrontRecentPaymentRow = {
  commerce_order_id: string
  order_number: string | null
  tenant_id: string
  tenant_name: string | null
  amount: number
  payment_method: string
  status: string
  payment_date: string | null
  payment_id: string
}

export type StorefrontRevenueKPI = {
  today_revenue: number
  month_revenue: number
  total_revenue: number
  unpaid_amount: number
  confirmed_payments_total: number
  recent_payments: StorefrontRecentPaymentRow[]
  rfq_today_revenue: number
  rfq_month_revenue: number
  rfq_total_revenue: number
  combined_today_revenue: number
  combined_month_revenue: number
  combined_total_revenue: number
}

function sumPaymentAmounts(rows: { amount?: number | null }[] | null | undefined): number {
  let s = 0
  for (const r of rows ?? []) {
    const a = r.amount
    if (typeof a === 'number' && Number.isFinite(a)) s += a
  }
  return s
}

/**
 * Storefront(`commerce_order_id` 연결) 매출·미수·최근 입금 KPI.
 * RFQ `orders` 집계는 `getPlatformRevenue`와 동일 월 경계·금액 규칙을 **복제 조회**만 수행(해당 함수 미수정).
 */
export async function getStorefrontRevenueKPI(): Promise<ActionResult<StorefrontRevenueKPI>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }
  if (!requireAdminRole(ctx.role)) return { success: false, error: '권한 없음' }

  const today = kstTodayDateString()
  const { start: monthStart, end: monthEnd } = monthRangeKstDateStrings()

  const paySelect = 'id, amount, payment_date, status, direction, commerce_order_id, payee_tenant_id, payer_tenant_id, created_at, payment_method'

  const base = () =>
    supabase
      .from('payments')
      .select(paySelect)
      .not('commerce_order_id', 'is', null)
      .eq('direction', 'inbound')
      .eq('payee_tenant_id', PLATFORM_OWNER_TENANT)
      .eq('status', 'confirmed')

  const recentBase = () =>
    supabase
      .from('payments')
      .select(paySelect)
      .not('commerce_order_id', 'is', null)
      .eq('direction', 'inbound')
      .eq('payee_tenant_id', PLATFORM_OWNER_TENANT)
      .neq('status', 'reversed')

  const [todayRes, monthRes, totalRes, unpaidRes, recentRes] = await Promise.all([
    base().eq('payment_date', today).limit(PAY_FETCH_LIMIT),
    base().gte('payment_date', monthStart).lte('payment_date', monthEnd).limit(PAY_FETCH_LIMIT),
    base().limit(PAY_FETCH_LIMIT),
    supabase.from('commerce_orders').select('total_amount').eq('payment_status', 'unpaid').limit(PAY_FETCH_LIMIT),
    recentBase().order('created_at', { ascending: false }).limit(10),
  ])

  if (todayRes.error) return { success: false, error: todayRes.error.message }
  if (monthRes.error) return { success: false, error: monthRes.error.message }
  if (totalRes.error) return { success: false, error: totalRes.error.message }
  if (unpaidRes.error) return { success: false, error: unpaidRes.error.message }
  if (recentRes.error) return { success: false, error: recentRes.error.message }

  const today_revenue = sumPaymentAmounts(todayRes.data as { amount?: number }[])
  const month_revenue = sumPaymentAmounts(monthRes.data as { amount?: number }[])
  const total_revenue = sumPaymentAmounts(totalRes.data as { amount?: number }[])
  const confirmed_payments_total = total_revenue

  let unpaid_amount = 0
  for (const r of (unpaidRes.data ?? []) as { total_amount?: number }[]) {
    const t = r.total_amount
    if (typeof t === 'number' && Number.isFinite(t)) unpaid_amount += t
  }

  const [rfqTodayRes, rfqMonthRes, rfqTotalRes] = await Promise.all([
    supabase
      .from('orders')
      .select('final_amount, total_amount, order_date')
      .eq('status', 'confirmed')
      .is('deleted_at', null)
      .eq('order_date', today)
      .limit(ORDERS_FETCH_LIMIT),
    supabase
      .from('orders')
      .select('final_amount, total_amount, order_date')
      .eq('status', 'confirmed')
      .is('deleted_at', null)
      .gte('order_date', monthStart)
      .lte('order_date', monthEnd)
      .limit(ORDERS_FETCH_LIMIT),
    supabase
      .from('orders')
      .select('final_amount, total_amount')
      .eq('status', 'confirmed')
      .is('deleted_at', null)
      .limit(ORDERS_FETCH_LIMIT),
  ])

  if (rfqTodayRes.error) return { success: false, error: rfqTodayRes.error.message }
  if (rfqMonthRes.error) return { success: false, error: rfqMonthRes.error.message }
  if (rfqTotalRes.error) return { success: false, error: rfqTotalRes.error.message }

  const rfq_today_revenue = (rfqTodayRes.data ?? []).reduce((s, o) => s + orderAmount(o as RfqOrderRow), 0)
  const rfq_month_revenue = (rfqMonthRes.data ?? []).reduce((s, o) => s + orderAmount(o as RfqOrderRow), 0)
  const rfq_total_revenue = (rfqTotalRes.data ?? []).reduce((s, o) => s + orderAmount(o as RfqOrderRow), 0)

  const payRows = (recentRes.data ?? []) as {
    id: string
    commerce_order_id: string
    amount: number | null
    payment_method: string | null
    status: string | null
    payment_date: string | null
    payer_tenant_id: string | null
  }[]

  const coIds = [...new Set(payRows.map((p) => p.commerce_order_id).filter(Boolean))]
  let orderMap = new Map<string, { order_number: string | null; tenant_id: string }>()
  if (coIds.length) {
    const { data: coRows, error: coErr } = await supabase
      .from('commerce_orders')
      .select('id, order_number, tenant_id')
      .in('id', coIds)
    if (coErr) return { success: false, error: coErr.message }
    for (const r of (coRows ?? []) as { id: string; order_number: string | null; tenant_id: string }[]) {
      orderMap.set(r.id, { order_number: r.order_number ?? null, tenant_id: r.tenant_id })
    }
  }

  const tenantIds = [...new Set([...orderMap.values()].map((o) => o.tenant_id).filter(Boolean))]
  const tenantNameMap = new Map<string, string | null>()
  if (tenantIds.length) {
    const { data: tnRows, error: tnErr } = await supabase.from('tenants').select('id, name').in('id', tenantIds).limit(500)
    if (tnErr) return { success: false, error: tnErr.message }
    for (const t of (tnRows ?? []) as { id: string; name: string | null }[]) {
      tenantNameMap.set(t.id, t.name ?? null)
    }
  }

  const recent_payments: StorefrontRecentPaymentRow[] = payRows.map((p) => {
    const co = orderMap.get(p.commerce_order_id)
    const tid = co?.tenant_id ?? (p.payer_tenant_id as string) ?? ''
    return {
      payment_id: p.id,
      commerce_order_id: p.commerce_order_id,
      order_number: co?.order_number ?? null,
      tenant_id: tid,
      tenant_name: tid ? tenantNameMap.get(tid) ?? null : null,
      amount: typeof p.amount === 'number' && Number.isFinite(p.amount) ? p.amount : 0,
      payment_method: String(p.payment_method ?? ''),
      status: String(p.status ?? ''),
      payment_date: p.payment_date ?? null,
    }
  })

  return {
    success: true,
    data: {
      today_revenue,
      month_revenue,
      total_revenue,
      unpaid_amount,
      confirmed_payments_total,
      recent_payments,
      rfq_today_revenue,
      rfq_month_revenue,
      rfq_total_revenue,
      combined_today_revenue: rfq_today_revenue + today_revenue,
      combined_month_revenue: rfq_month_revenue + month_revenue,
      combined_total_revenue: rfq_total_revenue + total_revenue,
    },
  }
}
