'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { getSettings } from '@/actions/settings'
import { DEFAULT_SETTINGS } from '@/constants/settings'
import type { ActionResult } from '@/types/order'
import {
  aggregateByDate,
  aggregateByProduct,
  aggregateByCustomer,
  buildOverviewSummary,
  prevPeriodRange,
  isSalesOrder,
  type AnalyticsOrder,
  type DateBucket,
  type ProductRow,
  type CustomerRow,
  type OverviewSummary,
} from '@/lib/analytics-calc'

// ============================================================
// 공통 — confirmed orders + order_lines 스냅샷 fetch (RULE-01, RULE-03)
// ============================================================

const ORDER_SELECT = `
  id, order_date, order_type, total_amount, final_amount,
  customer_id, customer_name, customers(name),
  order_lines(product_name, quantity, unit_price, cost_price, line_total)
`

async function fetchOrdersInRange(
  tid: string,
  from: string,
  to: string,
): Promise<AnalyticsOrder[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .or(`seller_tenant_id.eq.${tid},tenant_id.eq.${tid}`)
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .gte('order_date', from)
    .lte('order_date', to)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as AnalyticsOrder[]
}

// ============================================================
// 탭 1 — 매출현황
// ============================================================

export interface OverviewResult {
  summary:  OverviewSummary
  by_date:  DateBucket[]
  from:     string
  to:       string
}

export async function getAnalyticsOverview(
  from: string,
  to:   string,
): Promise<ActionResult<OverviewResult>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  try {
    const prev = prevPeriodRange(from, to)
    const [orders, prevOrders] = await Promise.all([
      fetchOrdersInRange(ctx.tenant_id, from, to),
      fetchOrdersInRange(ctx.tenant_id, prev.from, prev.to),
    ])
    const summary = buildOverviewSummary(orders, prevOrders)
    const by_date = aggregateByDate(orders)
    return { success: true, data: { summary, by_date, from, to } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'fetch failed' }
  }
}

// ============================================================
// 탭 2 — 마진분석 (상품별)
// ============================================================

export interface MarginResult {
  rows:                ProductRow[]
  top5_revenue_share:  number
}

export async function getMarginByProduct(
  from: string,
  to:   string,
): Promise<ActionResult<MarginResult>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  try {
    const orders = await fetchOrdersInRange(ctx.tenant_id, from, to)
    const rows   = aggregateByProduct(orders)

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
    const top5Revenue  = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
                                  .reduce((s, r) => s + r.revenue, 0)
    const top5_revenue_share = totalRevenue !== 0 ? (top5Revenue / totalRevenue) * 100 : 0

    return { success: true, data: { rows, top5_revenue_share } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'fetch failed' }
  }
}

// ============================================================
// 탭 3 — 거래처분석
// ============================================================

export interface CustomerAnalyticsKpi {
  avg_collection_days:  number | null
  receivable_ratio:     number | null
  repeat_purchase_rate: number | null
}

export interface CustomerAnalyticsResult {
  rows:           CustomerRow[]
  top3_share:     number
  kpi:            CustomerAnalyticsKpi
}

export async function getMarginByCustomer(
  from: string,
  to:   string,
): Promise<ActionResult<CustomerAnalyticsResult>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  try {
    const tid  = ctx.tenant_id
    const prev = prevPeriodRange(from, to)
    const [orders, prevOrders] = await Promise.all([
      fetchOrdersInRange(tid, from, to),
      fetchOrdersInRange(tid, prev.from, prev.to),
    ])
    const rows = aggregateByCustomer(orders, prevOrders)

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
    const top3Revenue  = rows.slice(0, 3).reduce((s, r) => s + r.revenue, 0)
    const top3_share   = totalRevenue !== 0 ? (top3Revenue / totalRevenue) * 100 : 0

    // KPI: 평균결제기간(근사) / 미수금 비율 / 반복구매율
    // RULE-02: DB 캐시 없이 메모리 계산
    const [{ data: payments }, { data: customers }] = await Promise.all([
      supabase
        .from('payments')
        .select('customer_id, payment_date, amount')
        .or(`payee_tenant_id.eq.${tid},tenant_id.eq.${tid}`)
        .eq('direction', 'inbound')
        .eq('status', 'confirmed')
        .gte('payment_date', from)
        .lte('payment_date', to),
      supabase
        .from('customers')
        .select('id')
        .eq('tenant_id', tid)
        .eq('is_buyer', true)
        .is('deleted_at', null),
    ])

    // 평균결제기간(정확) — collection_allocations 기반
    // (없으면 기존 근사치로 fallback)
    const { data: allocAvg } = await supabase
      .from('collection_allocations')
      .select(`
        allocated_amount,
        payments!inner(status, direction, payment_date),
        orders!inner(order_date)
      `)
      .eq('tenant_id', tid)
      .eq('payments.status', 'confirmed')
      .eq('payments.direction', 'inbound')

    let avg_collection_days: number | null = null
    if (allocAvg && allocAvg.length > 0) {
      const diffs: number[] = []
      for (const row of allocAvg as any[]) {
        const pd = (row.payments as any)?.payment_date as string | undefined
        const od = (row.orders as any)?.order_date as string | undefined
        if (!pd || !od) continue
        const days = Math.floor(
          (new Date(pd + 'T00:00:00Z').getTime() - new Date(od + 'T00:00:00Z').getTime()) / 86400000,
        )
        if (days >= 0) diffs.push(days)
      }
      if (diffs.length > 0) {
        avg_collection_days = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length)
      }
    }

    const buyerOrderCount = new Map<string, number>()
    if (avg_collection_days === null) {
      const lastOrderByCust   = new Map<string, string>()
      const lastPaymentByCust = new Map<string, string>()

      for (const o of orders) {
        if (!isSalesOrder(o) || !o.customer_id) continue
        const prevDate = lastOrderByCust.get(o.customer_id)
        if (!prevDate || o.order_date > prevDate) lastOrderByCust.set(o.customer_id, o.order_date)
        buyerOrderCount.set(o.customer_id, (buyerOrderCount.get(o.customer_id) ?? 0) + 1)
      }
      for (const p of payments ?? []) {
        const cid = (p as { customer_id?: string | null }).customer_id
        if (!cid) continue
        const pd = (p as { payment_date: string }).payment_date
        const prevDate = lastPaymentByCust.get(cid)
        if (!prevDate || pd > prevDate) lastPaymentByCust.set(cid, pd)
      }

      const diffs: number[] = []
      for (const [cid, od] of lastOrderByCust) {
        const pd = lastPaymentByCust.get(cid)
        if (!pd) continue
        const days = Math.floor(
          (new Date(pd + 'T00:00:00Z').getTime() - new Date(od + 'T00:00:00Z').getTime()) / 86400000,
        )
        if (days >= 0) diffs.push(days)
      }
      avg_collection_days =
        diffs.length > 0 ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null
    } else {
      // repeat 구매율 집계는 기존 로직 그대로 유지
      for (const o of orders) {
        if (!isSalesOrder(o) || !o.customer_id) continue
        buyerOrderCount.set(o.customer_id, (buyerOrderCount.get(o.customer_id) ?? 0) + 1)
      }
    }

    // 미수금 비율 — Σ미수금 / Σ매출 (기간 내)
    const totalSales      = totalRevenue
    const totalCollection = (payments ?? []).reduce(
      (s, p) => s + (p as { amount: number }).amount, 0,
    )
    const receivable_ratio =
      totalSales !== 0 ? Math.max(0, ((totalSales - totalCollection) / totalSales) * 100) : null

    // 반복 구매율 — 기간 내 2회 이상 주문한 거래처 비율 (전체 buyer 기준)
    const totalBuyers   = (customers ?? []).length
    const repeatBuyers  = [...buyerOrderCount.values()].filter((n) => n >= 2).length
    const repeat_purchase_rate =
      totalBuyers > 0 ? (repeatBuyers / totalBuyers) * 100 : null

    return {
      success: true,
      data: {
        rows,
        top3_share,
        kpi: { avg_collection_days, receivable_ratio, repeat_purchase_rate },
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'fetch failed' }
  }
}

// ============================================================
// 탭 4 — 위험신호
// ============================================================

export interface RiskSignals {
  declining_customers:   Array<{ customer_key: string; customer_name: string; revenue: number; prev_revenue: number; growth_rate: number }>
  low_margin_customers:  Array<{ customer_key: string; customer_name: string; margin_rate: number; revenue: number }>
  loss_products:         Array<{ product_name: string; revenue: number; margin: number; margin_rate: number }>
  high_revenue_low_margin: Array<{ customer_key: string; customer_name: string; revenue: number; margin: number; margin_rate: number; rank: number }>
  high_refund_products:  Array<{ product_name: string; sales_revenue: number; refund_revenue: number; refund_ratio: number }>
  margin_warning_threshold: number
}

const DECLINE_THRESHOLD     = -20  // % (전월 대비)
const REFUND_RATIO_THRESHOLD = 5   // % (반품/매출)

export async function getRiskSignals(
  from: string,
  to:   string,
): Promise<ActionResult<RiskSignals>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  try {
    const tid  = ctx.tenant_id
    const prev = prevPeriodRange(from, to)

    const [orders, prevOrders, settingsResult] = await Promise.all([
      fetchOrdersInRange(tid, from, to),
      fetchOrdersInRange(tid, prev.from, prev.to),
      getSettings(),
    ])

    const margin_warning_threshold = settingsResult.success && settingsResult.data
      ? settingsResult.data.margin_warning_threshold
      : DEFAULT_SETTINGS.margin_warning_threshold

    const customerRows = aggregateByCustomer(orders, prevOrders)
    const productRows  = aggregateByProduct(orders)

    // 1. 매출 감소 거래처 (전기간 대비 -20% 이상)
    const declining_customers = customerRows
      .filter((c) => c.growth_rate !== null && c.growth_rate <= DECLINE_THRESHOLD)
      .map((c) => {
        const prevRev = c.growth_rate !== null && c.growth_rate !== -100
          ? (c.revenue * 100) / (c.growth_rate + 100)
          : 0
        return {
          customer_key:  c.customer_key,
          customer_name: c.customer_name,
          revenue:       c.revenue,
          prev_revenue:  Math.round(prevRev),
          growth_rate:   c.growth_rate ?? 0,
        }
      })
      .sort((a, b) => a.growth_rate - b.growth_rate)
      .slice(0, 10)

    // 2. 마진 낮은 거래처 (마진율 < threshold, 매출 > 0)
    const low_margin_customers = customerRows
      .filter((c) => c.revenue > 0 && c.margin_rate < margin_warning_threshold)
      .map((c) => ({
        customer_key:  c.customer_key,
        customer_name: c.customer_name,
        margin_rate:   c.margin_rate,
        revenue:       c.revenue,
      }))
      .sort((a, b) => a.margin_rate - b.margin_rate)
      .slice(0, 10)

    // 3. 손해 상품 (마진 < 0)
    const loss_products = productRows
      .filter((p) => p.margin < 0)
      .map((p) => ({
        product_name: p.product_name,
        revenue:      p.revenue,
        margin:       p.margin,
        margin_rate:  p.margin_rate,
      }))
      .sort((a, b) => a.margin - b.margin)
      .slice(0, 10)

    // 4. 매출은 있는데 마진 없는 거래처 (매출 TOP10 ∩ 마진율 하위 50%)
    const top10 = customerRows.slice(0, 10).map((c) => c.customer_key)
    const sortedByMarginRate = [...customerRows].sort((a, b) => a.margin_rate - b.margin_rate)
    const lowerHalf = new Set(
      sortedByMarginRate.slice(0, Math.ceil(sortedByMarginRate.length / 2)).map((c) => c.customer_key),
    )
    const high_revenue_low_margin = customerRows
      .filter((c) => top10.includes(c.customer_key) && lowerHalf.has(c.customer_key))
      .map((c) => ({
        customer_key:  c.customer_key,
        customer_name: c.customer_name,
        revenue:       c.revenue,
        margin:        c.margin,
        margin_rate:   c.margin_rate,
        rank:          c.rank,
      }))

    // 5. 반품 많은 상품 — refund 주문(order_type='refund') line_total은 음수 가정
    //    refund_ratio = |refund_revenue| / sales_revenue
    const salesByProduct  = new Map<string, number>()
    const refundByProduct = new Map<string, number>()
    for (const o of orders) {
      const isSale = isSalesOrder(o)
      const isRefund = o.order_type === 'refund'
      for (const l of o.order_lines ?? []) {
        if (isSale) {
          salesByProduct.set(l.product_name, (salesByProduct.get(l.product_name) ?? 0) + l.line_total)
        } else if (isRefund) {
          refundByProduct.set(l.product_name, (refundByProduct.get(l.product_name) ?? 0) + l.line_total)
        }
      }
    }
    const high_refund_products = [...refundByProduct.entries()]
      .map(([product_name, refund_revenue]) => {
        const sales_revenue = salesByProduct.get(product_name) ?? 0
        const refund_ratio  = sales_revenue !== 0 ? (Math.abs(refund_revenue) / sales_revenue) * 100 : 0
        return { product_name, sales_revenue, refund_revenue, refund_ratio }
      })
      .filter((r) => r.refund_ratio >= REFUND_RATIO_THRESHOLD)
      .sort((a, b) => b.refund_ratio - a.refund_ratio)
      .slice(0, 10)

    return {
      success: true,
      data: {
        declining_customers,
        low_margin_customers,
        loss_products,
        high_revenue_low_margin,
        high_refund_products,
        margin_warning_threshold,
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'fetch failed' }
  }
}
