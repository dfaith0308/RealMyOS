'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { isSalesOrder } from '@/lib/ledger-calc'
import type { ActionResult } from '@/types/order'

function todayKST(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
}

function monthStartKST(offsetMonths = 0): string {
  const d = new Date(Date.now() + 9 * 3600000)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1 + offsetMonths
  const dt = new Date(Date.UTC(y, m - 1, 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function ymKey(dateStr: string): string {
  return String(dateStr).slice(0, 7)
}

function monthLabel(ym: string): string {
  const m = Number(ym.slice(5, 7))
  return `${m}월`
}

function daysBetween(a: string, b: string): number {
  const ta = new Date(a + 'T00:00:00Z').getTime()
  const tb = new Date(b + 'T00:00:00Z').getTime()
  return Math.round(Math.abs(tb - ta) / 86400000)
}

export interface ProductMonthlySales {
  month: string       // YYYY-MM
  label: string       // N월
  amount: number
  is_current: boolean
}

export interface ProductBuyerRow {
  customer_id: string
  name: string
  total_amount: number
  total_qty: number
  unit_price: number | null
}

export interface ProductCustomerPriceRow {
  customer_id: string
  name: string
  unit_price: number
}

export interface ProductRepurchaseRow {
  customer_id: string
  name: string
  /** 평균 재구매 주기(일). 주문 1건이면 null */
  avg_cycle_days: number | null
  last_order_date: string
  days_since_last: number
}

export interface ProductAnalyticsKpi {
  month_sales: number
  avg_margin_rate: number | null
  buyer_count: number
  avg_repurchase_days: number | null
}

export interface ProductAnalytics {
  kpi: ProductAnalyticsKpi
  monthly_sales: ProductMonthlySales[]
  buyers_this_month: ProductBuyerRow[]
  customer_prices: ProductCustomerPriceRow[]
  repurchase: ProductRepurchaseRow[]
  base_price: number | null
}

/**
 * 상품 상세 허브 분석 — 집계는 앱 메모리에서만 (DB 저장 금지).
 * N+1 금지: order_lines 1회 + customer_product_prices 1회.
 */
export async function getProductAnalytics(
  productId: string,
): Promise<ActionResult<ProductAnalytics>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }
  if (!productId) return { success: false, error: 'product_id 필요' }

  const tid = ctx.tenant_id
  const today = todayKST()
  const thisMonthStart = monthStartKST(0)
  const sixMonthStart = monthStartKST(-5)

  const [{ data: lines, error: lineErr }, { data: priceRows, error: priceErr }, { data: product }] =
    await Promise.all([
      supabase
        .from('order_lines')
        .select(`
          quantity, unit_price, cost_price, line_total,
          orders!inner(
            id, order_date, status, deleted_at, order_type,
            customer_id, customer_name, tenant_id, seller_tenant_id,
            customers(name)
          )
        `)
        .eq('tenant_id', tid)
        .eq('product_id', productId)
        .eq('orders.status', 'confirmed')
        .is('orders.deleted_at', null)
        .gte('orders.order_date', sixMonthStart)
        .lte('orders.order_date', today),
      supabase
        .from('customer_product_prices')
        .select('customer_id, last_price, customers(name)')
        .eq('tenant_id', tid)
        .eq('product_id', productId)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(200),
      supabase
        .from('products')
        .select('id, product_prices(price_type, price)')
        .eq('tenant_id', tid)
        .eq('id', productId)
        .is('deleted_at', null)
        .maybeSingle(),
    ])

  if (lineErr) return { success: false, error: lineErr.message }
  if (priceErr) return { success: false, error: priceErr.message }

  type LineRow = {
    quantity: number | null
    unit_price: number | null
    cost_price: number | null
    line_total: number | null
    orders:
      | {
          id: string
          order_date: string
          status: string
          deleted_at: string | null
          order_type: string | null
          customer_id: string | null
          customer_name: string | null
          customers: { name?: string | null } | Array<{ name?: string | null }> | null
        }
      | Array<{
          id: string
          order_date: string
          status: string
          deleted_at: string | null
          order_type: string | null
          customer_id: string | null
          customer_name: string | null
          customers: { name?: string | null } | Array<{ name?: string | null }> | null
        }>
  }

  const flatLines: Array<{
    qty: number
    unit_price: number
    cost_price: number
    line_total: number
    order_date: string
    customer_id: string
    customer_name: string
  }> = []

  for (const raw of (lines ?? []) as LineRow[]) {
    const o = Array.isArray(raw.orders) ? raw.orders[0] : raw.orders
    if (!o || !isSalesOrder(o)) continue
    const cid = (o.customer_id ?? '').trim()
    if (!cid) continue
    const custJoin = o.customers
    const joined = Array.isArray(custJoin)
      ? (custJoin[0]?.name?.trim() ?? '')
      : (custJoin?.name?.trim() ?? '')
    const name = (o.customer_name?.trim() || joined || '알 수 없음')
    flatLines.push({
      qty: Number(raw.quantity ?? 0) || 0,
      unit_price: Number(raw.unit_price ?? 0) || 0,
      cost_price: Number(raw.cost_price ?? 0) || 0,
      line_total: Number(raw.line_total ?? 0) || 0,
      order_date: String(o.order_date).slice(0, 10),
      customer_id: cid,
      customer_name: name,
    })
  }

  // 월별 매출 (최근 6개월 슬롯 고정)
  const monthSlots: string[] = []
  for (let i = -5; i <= 0; i++) {
    monthSlots.push(monthStartKST(i).slice(0, 7))
  }
  const monthMap = new Map<string, number>(monthSlots.map((m) => [m, 0]))
  for (const l of flatLines) {
    const key = ymKey(l.order_date)
    if (!monthMap.has(key)) continue
    monthMap.set(key, (monthMap.get(key) ?? 0) + l.line_total)
  }
  const currentYm = thisMonthStart.slice(0, 7)
  const monthly_sales: ProductMonthlySales[] = monthSlots.map((m) => ({
    month: m,
    label: monthLabel(m),
    amount: monthMap.get(m) ?? 0,
    is_current: m === currentYm,
  }))

  // 이번달 구매 거래처
  const buyerMap = new Map<string, { name: string; total_amount: number; total_qty: number; last_unit: number }>()
  for (const l of flatLines) {
    if (l.order_date < thisMonthStart) continue
    const cur = buyerMap.get(l.customer_id) ?? {
      name: l.customer_name,
      total_amount: 0,
      total_qty: 0,
      last_unit: l.unit_price,
    }
    cur.total_amount += l.line_total
    cur.total_qty += l.qty
    cur.last_unit = l.unit_price
    if (l.customer_name !== '알 수 없음') cur.name = l.customer_name
    buyerMap.set(l.customer_id, cur)
  }
  const buyers_this_month: ProductBuyerRow[] = [...buyerMap.entries()]
    .map(([customer_id, v]) => ({
      customer_id,
      name: v.name,
      total_amount: v.total_amount,
      total_qty: v.total_qty,
      unit_price: v.total_qty !== 0 ? Math.round(v.total_amount / Math.abs(v.total_qty)) : v.last_unit,
    }))
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, 10)

  // 기준 판매가
  const priceList = (product as any)?.product_prices ?? []
  const base_price =
    (priceList.find((p: any) => p.price_type === 'normal')?.price as number | undefined) ?? null

  // 거래처별 단가 — customer_product_prices 우선, 없으면 최근 라인 단가
  const priceFromCache = new Map<string, { name: string; unit_price: number }>()
  for (const r of priceRows ?? []) {
    const cid = String((r as any).customer_id ?? '')
    if (!cid || priceFromCache.has(cid)) continue
    const last = Number((r as any).last_price ?? 0)
    if (!last) continue
    const cust = (r as any).customers
    const name = Array.isArray(cust)
      ? (cust[0]?.name ?? '-')
      : (cust?.name ?? '-')
    priceFromCache.set(cid, { name, unit_price: last })
  }
  // 라인에서 거래처별 최신 단가 fallback
  const latestByCustomer = new Map<string, { name: string; unit_price: number; date: string }>()
  for (const l of [...flatLines].sort((a, b) => b.order_date.localeCompare(a.order_date))) {
    if (latestByCustomer.has(l.customer_id)) continue
    latestByCustomer.set(l.customer_id, {
      name: l.customer_name,
      unit_price: l.unit_price,
      date: l.order_date,
    })
  }
  const customerIds = new Set([
    ...priceFromCache.keys(),
    ...latestByCustomer.keys(),
  ])
  const customer_prices: ProductCustomerPriceRow[] = [...customerIds]
    .map((cid) => {
      const cached = priceFromCache.get(cid)
      const fromLine = latestByCustomer.get(cid)
      return {
        customer_id: cid,
        name: cached?.name ?? fromLine?.name ?? '-',
        unit_price: cached?.unit_price ?? fromLine?.unit_price ?? 0,
      }
    })
    .filter((r) => r.unit_price > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .slice(0, 20)

  // 재구매 주기 — 거래처별 주문일 distinct
  const datesByCustomer = new Map<string, { name: string; dates: Set<string> }>()
  for (const l of flatLines) {
    const cur = datesByCustomer.get(l.customer_id) ?? {
      name: l.customer_name,
      dates: new Set<string>(),
    }
    cur.dates.add(l.order_date)
    if (l.customer_name !== '알 수 없음') cur.name = l.customer_name
    datesByCustomer.set(l.customer_id, cur)
  }
  const repurchase: ProductRepurchaseRow[] = [...datesByCustomer.entries()]
    .map(([customer_id, v]) => {
      const dates = [...v.dates].sort()
      const last = dates[dates.length - 1]
      let avg: number | null = null
      if (dates.length >= 2) {
        let sum = 0
        for (let i = 1; i < dates.length; i++) sum += daysBetween(dates[i - 1], dates[i])
        avg = Math.round(sum / (dates.length - 1))
      }
      return {
        customer_id,
        name: v.name,
        avg_cycle_days: avg,
        last_order_date: last,
        days_since_last: daysBetween(last, today),
      }
    })
    .sort((a, b) => b.days_since_last - a.days_since_last)
    .slice(0, 20)

  // KPI
  const month_sales = monthly_sales.find((m) => m.is_current)?.amount ?? 0
  const monthLines = flatLines.filter((l) => l.order_date >= thisMonthStart)
  let marginWeighted = 0
  let marginBase = 0
  for (const l of monthLines.length ? monthLines : flatLines) {
    if (l.unit_price <= 0) continue
    const m = (l.unit_price - l.cost_price) / l.unit_price
    const w = Math.abs(l.line_total) || Math.abs(l.unit_price * l.qty)
    marginWeighted += m * w
    marginBase += w
  }
  const avg_margin_rate =
    marginBase > 0 ? Math.round((marginWeighted / marginBase) * 1000) / 10 : null

  const cycles = repurchase
    .map((r) => r.avg_cycle_days)
    .filter((n): n is number => n != null && n > 0)
  const avg_repurchase_days =
    cycles.length > 0
      ? Math.round(cycles.reduce((s, n) => s + n, 0) / cycles.length)
      : null

  return {
    success: true,
    data: {
      kpi: {
        month_sales,
        avg_margin_rate,
        buyer_count: buyerMap.size,
        avg_repurchase_days,
      },
      monthly_sales,
      buyers_this_month,
      customer_prices,
      repurchase,
      base_price,
    },
  }
}
