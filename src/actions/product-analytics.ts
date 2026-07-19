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

/** PostgREST .in() URL 길이 대비 — 배치 조회 */
async function fetchByIdsInBatches<T>(
  ids: string[],
  batchSize: number,
  fetchBatch: (chunk: string[]) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: string | null }> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize)
    if (chunk.length === 0) continue
    const { data, error } = await fetchBatch(chunk)
    if (error) return { data: out, error: error.message }
    if (data?.length) out.push(...data)
  }
  return { data: out, error: null }
}

export interface ProductMonthlySales {
  month: string
  label: string
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
  phone: string | null
}

export interface ProductRepurchaseRow {
  customer_id: string
  name: string
  phone: string | null
  avg_cycle_days: number | null
  last_order_date: string
  days_since_last: number
}

export interface ProductAnalyticsKpi {
  month_sales: number
  avg_margin_rate: number | null
  buyer_count: number
  /** 이번달 귀속 재구매 사이클 평균(일). 사이클이 없으면 null */
  avg_repurchase_days: number | null
  /** 지난달 귀속 재구매 사이클 평균(일). 사이클이 없으면 null */
  avg_repurchase_days_prev_month: number | null
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
 * N+1 금지: order_lines → orders → customers 단계 조회 (중첩 embed 없음).
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

  // ── 1) order_lines (단순 조회, 중첩 join 없음) ──
  const { data: lines, error: lineErr } = await supabase
    .from('order_lines')
    .select('id, product_id, order_id, quantity, unit_price, cost_price, line_total')
    .eq('tenant_id', tid)
    .eq('product_id', productId)
    .limit(5000)

  if (lineErr) return { success: false, error: lineErr.message }

  const orderIds = [...new Set((lines ?? []).map((l) => l.order_id).filter(Boolean))] as string[]

  // ── 2) orders (confirmed + 기간 + tenant) ──
  let orders: Array<{
    id: string
    order_date: string
    status: string
    customer_id: string | null
    customer_name: string | null
    deleted_at: string | null
    order_type: string | null
  }> = []

  if (orderIds.length > 0) {
    const { data: orderRows, error: orderErr } = await fetchByIdsInBatches(orderIds, 200, async (chunk) => {
      const res = await supabase
        .from('orders')
        .select('id, order_date, status, customer_id, customer_name, deleted_at, order_type')
        .in('id', chunk)
        .or(`seller_tenant_id.eq.${tid},tenant_id.eq.${tid}`)
        .eq('status', 'confirmed')
        .is('deleted_at', null)
        .gte('order_date', sixMonthStart)
        .lte('order_date', today)
      return { data: res.data as typeof orders | null, error: res.error }
    })
    if (orderErr) return { success: false, error: orderErr }
    orders = orderRows
  }

  const orderById = new Map(orders.map((o) => [o.id, o]))

  // ── 3) customers 이름 ──
  const customerIdSet = new Set<string>()
  for (const o of orders) {
    if (o.customer_id) customerIdSet.add(o.customer_id)
  }

  // 단가 캐시 + 판매가 (중첩 customers embed 없이)
  const [{ data: priceRows, error: priceErr }, { data: product }] = await Promise.all([
    supabase
      .from('customer_product_prices')
      .select('customer_id, last_price')
      .eq('tenant_id', tid)
      .eq('product_id', productId)
      .order('updated_at', { ascending: false })
      .limit(200),
    supabase
      .from('products')
      .select('id, product_prices(price_type, price)')
      .eq('tenant_id', tid)
      .eq('id', productId)
      .is('deleted_at', null)
      .maybeSingle(),
  ])

  if (priceErr) return { success: false, error: priceErr.message }

  for (const r of priceRows ?? []) {
    if (r.customer_id) customerIdSet.add(r.customer_id)
  }

  const customerIds = [...customerIdSet]
  const custById = new Map<string, { name: string; phone: string | null }>()
  if (customerIds.length > 0) {
    const { data: custRows, error: custErr } = await fetchByIdsInBatches(customerIds, 200, async (chunk) => {
      const res = await supabase
        .from('customers')
        .select('id, name, phone')
        .eq('tenant_id', tid)
        .in('id', chunk)
        .is('deleted_at', null)
      return {
        data: res.data as Array<{ id: string; name: string; phone: string | null }> | null,
        error: res.error,
      }
    })
    if (custErr) return { success: false, error: custErr }
    for (const c of custRows) {
      const phone = typeof c.phone === 'string' && c.phone.trim() ? c.phone.trim() : null
      custById.set(c.id, { name: c.name?.trim() || '알 수 없음', phone })
    }
  }

  // ── 라인 × 주문 조인 (메모리) ──
  const flatLines: Array<{
    qty: number
    unit_price: number
    cost_price: number
    line_total: number
    order_date: string
    customer_id: string
    customer_name: string
  }> = []

  for (const raw of lines ?? []) {
    const o = orderById.get(raw.order_id)
    if (!o || !isSalesOrder(o)) continue
    const cid = (o.customer_id ?? '').trim()
    if (!cid) continue
    const name =
      custById.get(cid)?.name ||
      o.customer_name?.trim() ||
      '알 수 없음'
    const qty = Number(raw.quantity ?? 0) || 0
    const unit_price = Number(raw.unit_price ?? 0) || 0
    const cost_price = Number(raw.cost_price ?? 0) || 0
    const line_total =
      raw.line_total != null && Number.isFinite(Number(raw.line_total))
        ? Number(raw.line_total)
        : unit_price * qty
    flatLines.push({
      qty,
      unit_price,
      cost_price,
      line_total,
      order_date: String(o.order_date).slice(0, 10),
      customer_id: cid,
      customer_name: name,
    })
  }

  // 월별 매출
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

  const priceList = (product as { product_prices?: Array<{ price_type: string; price: number }> } | null)
    ?.product_prices ?? []
  const base_price =
    priceList.find((p) => p.price_type === 'normal')?.price ?? null

  const priceFromCache = new Map<string, number>()
  for (const r of priceRows ?? []) {
    const cid = String(r.customer_id ?? '')
    if (!cid || priceFromCache.has(cid)) continue
    const last = Number(r.last_price ?? 0)
    if (!last) continue
    priceFromCache.set(cid, last)
  }

  const latestByCustomer = new Map<string, { name: string; unit_price: number }>()
  for (const l of [...flatLines].sort((a, b) => b.order_date.localeCompare(a.order_date))) {
    if (latestByCustomer.has(l.customer_id)) continue
    latestByCustomer.set(l.customer_id, {
      name: l.customer_name,
      unit_price: l.unit_price,
    })
  }

  const allPriceCust = new Set([...priceFromCache.keys(), ...latestByCustomer.keys()])
  const customer_prices: ProductCustomerPriceRow[] = [...allPriceCust]
    .map((cid) => ({
      customer_id: cid,
      name: custById.get(cid)?.name ?? latestByCustomer.get(cid)?.name ?? '-',
      unit_price: priceFromCache.get(cid) ?? latestByCustomer.get(cid)?.unit_price ?? 0,
      phone: custById.get(cid)?.phone ?? null,
    }))
    .filter((r) => r.unit_price > 0)
    .sort((a, b) => {
      // 기준가 대비 할인율 높은 순 (양수 = 기준가보다 저가)
      if (base_price != null && base_price > 0) {
        const discA = (base_price - a.unit_price) / base_price
        const discB = (base_price - b.unit_price) / base_price
        if (discB !== discA) return discB - discA
      }
      return a.name.localeCompare(b.name, 'ko')
    })
    .slice(0, 20)

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
        phone: custById.get(customer_id)?.phone ?? null,
        avg_cycle_days: avg,
        last_order_date: last,
        days_since_last: daysBetween(last, today),
      }
    })
    .sort((a, b) => b.days_since_last - a.days_since_last)
    .slice(0, 20)

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

  // 개별 재구매 간격 → 더 최근 구매일이 속한 달(YYYY-MM)에 귀속
  const thisYm = thisMonthStart.slice(0, 7)
  const prevYm = monthStartKST(-1).slice(0, 7)
  const thisMonthGaps: number[] = []
  const prevMonthGaps: number[] = []
  for (const v of datesByCustomer.values()) {
    const dates = [...v.dates].sort()
    for (let i = 1; i < dates.length; i++) {
      const gap = daysBetween(dates[i - 1], dates[i])
      const ym = ymKey(dates[i])
      if (ym === thisYm) thisMonthGaps.push(gap)
      else if (ym === prevYm) prevMonthGaps.push(gap)
    }
  }
  const avg_repurchase_days =
    thisMonthGaps.length > 0
      ? Math.round(thisMonthGaps.reduce((s, n) => s + n, 0) / thisMonthGaps.length)
      : null
  const avg_repurchase_days_prev_month =
    prevMonthGaps.length > 0
      ? Math.round(prevMonthGaps.reduce((s, n) => s + n, 0) / prevMonthGaps.length)
      : null

  return {
    success: true,
    data: {
      kpi: {
        month_sales,
        avg_margin_rate,
        buyer_count: buyerMap.size,
        avg_repurchase_days,
        avg_repurchase_days_prev_month,
      },
      monthly_sales,
      buyers_this_month,
      customer_prices,
      repurchase,
      base_price,
    },
  }
}
