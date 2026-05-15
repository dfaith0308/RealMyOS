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
  /** `reversal_of_id` 기준 — append-only reversal 이벤트 */
  is_reversal: boolean
  reversal_reason: string | null
  reversal_of_id: string | null
}

export type StorefrontRevenueKPI = {
  /** 순매출 (gross − reversal), KST payment_date 기준 */
  today_revenue: number
  month_revenue: number
  total_revenue: number
  unpaid_amount: number
  /** 누계 순매출과 동일 (net, RULE-02 실시간) */
  confirmed_payments_total: number
  recent_payments: StorefrontRecentPaymentRow[]
  today_gross_revenue: number
  today_reversal_amount: number
  month_gross_revenue: number
  month_reversal_amount: number
  total_gross_revenue: number
  total_reversal_amount: number
  /** `total_revenue` − `supplier_payable_total` (운영 KPI, P0) */
  platform_margin: number
  supplier_payable_total: number
  /** 조회된 reversal row 건수(상한 `PAY_FETCH_LIMIT`와 동일 범위) */
  reversal_count: number
  rfq_today_revenue: number
  rfq_month_revenue: number
  rfq_total_revenue: number
  combined_today_revenue: number
  combined_month_revenue: number
  combined_total_revenue: number
}

type PayAggRow = {
  id: string
  amount: number | null
  payment_date: string | null
  status: string | null
  direction: string | null
  commerce_order_id: string | null
  payee_tenant_id: string | null
  payer_tenant_id: string | null
  created_at: string | null
  payment_method: string | null
  reversal_of_id: string | null
  reversal_reason: string | null
}

function sumAmountInRange(
  rows: PayAggRow[],
  pick: (paymentDate: string | null | undefined) => boolean,
): number {
  let s = 0
  for (const r of rows) {
    if (!pick(r.payment_date)) continue
    const a = r.amount
    if (typeof a === 'number' && Number.isFinite(a)) s += a
  }
  return s
}

function storefrontInboundSelect(supabase: any) {
  return supabase
    .from('payments')
    .select(
      'id, amount, payment_date, status, direction, commerce_order_id, payee_tenant_id, payer_tenant_id, created_at, payment_method, reversal_of_id, reversal_reason',
    )
    .not('commerce_order_id', 'is', null)
    .eq('direction', 'inbound')
    .eq('payee_tenant_id', PLATFORM_OWNER_TENANT)
}

/**
 * Storefront(`commerce_order_id` 연결) 매출·미수·최근 입금 KPI.
 * Gross = 원본 입금(`status=confirmed`·`reversal_of_id` null); reversal = `reversal_of_id` not null (amount는 양수, 집계 시 차감).
 * REFUND-LIFECYCLE-P1-001: 주문이 refunded(또는 payment_status=refunded)이면서 원본 입금에 대한 reversal 자식이 없을 때만 gross 원본 제외(케이스 B). cancelled 경로에서 reversal이 이미 있는 경우(케이스 A)는 gross 유지·net에서 reversal 차감 유지.
 * RFQ `orders` 집계는 `getPlatformRevenue`를 수정하지 않고 동일 월 경계·금액 규칙으로 복제 조회만 수행.
 */
export async function getStorefrontRevenueKPI(): Promise<ActionResult<StorefrontRevenueKPI>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }
  if (!requireAdminRole(ctx.role)) return { success: false, error: '권한 없음' }

  const today = kstTodayDateString()
  const { start: monthStart, end: monthEnd } = monthRangeKstDateStrings()

  const inToday = (d: string | null | undefined) => d === today
  const inMonth = (d: string | null | undefined) => Boolean(d && d >= monthStart && d <= monthEnd)
  const allTime = () => true

  const [grossRes, revRes, payablesRes, unpaidRes, recentRes] = await Promise.all([
    storefrontInboundSelect(supabase).eq('status', 'confirmed').is('reversal_of_id', null).limit(PAY_FETCH_LIMIT),
    storefrontInboundSelect(supabase).not('reversal_of_id', 'is', null).limit(PAY_FETCH_LIMIT),
    supabase.from('supplier_payables').select('payable_amount, status').in('status', ['unpaid', 'paid']).limit(PAY_FETCH_LIMIT),
    supabase.from('commerce_orders').select('total_amount').eq('payment_status', 'unpaid').limit(PAY_FETCH_LIMIT),
    storefrontInboundSelect(supabase)
      .or('reversal_of_id.not.is.null,and(status.eq.confirmed,reversal_of_id.is.null)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (grossRes.error) return { success: false, error: grossRes.error.message }
  if (revRes.error) return { success: false, error: revRes.error.message }
  if (payablesRes.error) return { success: false, error: payablesRes.error.message }
  if (unpaidRes.error) return { success: false, error: unpaidRes.error.message }
  if (recentRes.error) return { success: false, error: recentRes.error.message }

  let grossRows = (grossRes.data ?? []) as PayAggRow[]

  const grossCommerceIds = [
    ...new Set(
      grossRows
        .map((r) => r.commerce_order_id)
        .filter((id): id is string => Boolean(id && String(id).trim())),
    ),
  ]
  if (grossCommerceIds.length) {
    const { data: coRows, error: coErr } = await supabase
      .from('commerce_orders')
      .select('id, status, payment_status')
      .in('id', grossCommerceIds)

    if (!coErr && coRows?.length) {
      const refundedOrderIds = new Set(
        (coRows as { id: string; status?: string | null; payment_status?: string | null }[])
          .filter(
            (o) =>
              String(o.status ?? '') === 'refunded' ||
              String(o.payment_status ?? '') === 'refunded',
          )
          .map((o) => String(o.id)),
      )

      if (refundedOrderIds.size) {
        const candidatePaymentIds = grossRows
          .filter((r) => refundedOrderIds.has(String(r.commerce_order_id ?? '')))
          .map((r) => String(r.id))

        if (candidatePaymentIds.length) {
          const { data: revLinks } = await supabase
            .from('payments')
            .select('reversal_of_id')
            .in('reversal_of_id', candidatePaymentIds)
            .not('reversal_of_id', 'is', null)
            .limit(PAY_FETCH_LIMIT)

          const withReversal = new Set(
            (revLinks ?? []).map((x: { reversal_of_id: string }) => String(x.reversal_of_id)),
          )

          grossRows = grossRows.filter((r) => {
            const cid = String(r.commerce_order_id ?? '')
            if (!refundedOrderIds.has(cid)) return true
            return withReversal.has(String(r.id))
          })
        }
      }
    }
  }

  const revRows = (revRes.data ?? []) as PayAggRow[]

  const today_gross_revenue = sumAmountInRange(grossRows, inToday)
  const month_gross_revenue = sumAmountInRange(grossRows, inMonth)
  const total_gross_revenue = sumAmountInRange(grossRows, allTime)

  const today_reversal_amount = sumAmountInRange(revRows, inToday)
  const month_reversal_amount = sumAmountInRange(revRows, inMonth)
  const total_reversal_amount = sumAmountInRange(revRows, allTime)

  const today_revenue = today_gross_revenue - today_reversal_amount
  const month_revenue = month_gross_revenue - month_reversal_amount
  const total_revenue = total_gross_revenue - total_reversal_amount
  const confirmed_payments_total = total_revenue

  let unpaid_amount = 0
  for (const r of (unpaidRes.data ?? []) as { total_amount?: number }[]) {
    const t = r.total_amount
    if (typeof t === 'number' && Number.isFinite(t)) unpaid_amount += t
  }

  let supplier_payable_total = 0
  for (const r of (payablesRes.data ?? []) as { payable_amount?: number; status?: string }[]) {
    const st = r.status
    if (st !== 'unpaid' && st !== 'paid') continue
    const a = r.payable_amount
    if (typeof a === 'number' && Number.isFinite(a)) supplier_payable_total += a
  }

  const platform_margin = total_revenue - supplier_payable_total
  const reversal_count = revRows.length

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

  const payRows = (recentRes.data ?? []) as PayAggRow[]

  const coIds = [...new Set(payRows.map((p) => p.commerce_order_id).filter(Boolean))] as string[]
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
    const cid = String(p.commerce_order_id ?? '')
    const co = orderMap.get(cid)
    const tid = co?.tenant_id ?? (p.payer_tenant_id as string) ?? ''
    const revId = p.reversal_of_id != null ? String(p.reversal_of_id) : null
    return {
      payment_id: p.id,
      commerce_order_id: cid,
      order_number: co?.order_number ?? null,
      tenant_id: tid,
      tenant_name: tid ? tenantNameMap.get(tid) ?? null : null,
      amount: typeof p.amount === 'number' && Number.isFinite(p.amount) ? p.amount : 0,
      payment_method: String(p.payment_method ?? ''),
      status: String(p.status ?? ''),
      payment_date: p.payment_date ?? null,
      is_reversal: revId != null && revId.length > 0,
      reversal_reason: p.reversal_reason != null ? String(p.reversal_reason) : null,
      reversal_of_id: revId,
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
      today_gross_revenue,
      today_reversal_amount,
      month_gross_revenue,
      month_reversal_amount,
      total_gross_revenue,
      total_reversal_amount,
      platform_margin,
      supplier_payable_total,
      reversal_count,
      rfq_today_revenue,
      rfq_month_revenue,
      rfq_total_revenue,
      combined_today_revenue: rfq_today_revenue + today_revenue,
      combined_month_revenue: rfq_month_revenue + month_revenue,
      combined_total_revenue: rfq_total_revenue + total_revenue,
    },
  }
}
