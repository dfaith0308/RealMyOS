/**
 * analytics-calc.ts — 매출분석 집계 헬퍼 (RULE-02, RULE-03)
 *
 * 원칙
 *  - 모든 집계는 메모리 계산 (DB 캐시/뷰 금지)
 *  - 입력 SSOT: order_lines 스냅샷 (`product` 테이블 참조 금지)
 *  - 매출 인정: orders.status='confirmed' (호출부에서 필터)
 *  - 반품: order_type='refund' (또는 음수 line)은 음수 자연 합산 — 호출부 정의에 위임
 *  - sales 여부 판단: ledger-calc.isSalesOrder
 */

import {
  effectiveOrderAmount,
  isSalesOrder,
  buildCustomerKey,
  resolveCustomerName,
} from '@/lib/ledger-calc'

// ============================================================
// 타입
// ============================================================

export interface AnalyticsLine {
  order_id:       string
  product_name:   string
  quantity:       number
  unit_price:     number
  cost_price:     number
  line_total:     number
}

export interface AnalyticsOrder {
  id:             string
  order_date:     string
  order_type?:    string | null
  total_amount:   number
  final_amount?:  number | null
  customer_id?:   string | null
  customer_name?: string | null
  /** 조인된 customers row (이름 fallback용) */
  customers?:     { name?: string | null } | null
  order_lines?:   AnalyticsLine[]
}

export interface DateBucket {
  date:    string
  revenue: number
  cost:    number
  margin:  number
}

export interface ProductRow {
  product_name:        string
  quantity:            number
  revenue:             number
  cost:                number
  margin:              number
  margin_rate:         number
  margin_contribution: number
}

export interface CustomerRow {
  customer_key:  string
  customer_name: string
  revenue:       number
  cost:          number
  margin:        number
  margin_rate:   number
  share:         number
  rank:          number
  growth_rate:   number | null
}

export interface OverviewSummary {
  revenue:           number
  cost:              number
  margin:            number
  margin_rate:       number
  prev_revenue:      number
  prev_margin:       number
  revenue_growth:    number | null
  margin_growth:     number | null
  margin_rate_delta: number | null
}

// ============================================================
// 라인 단위 마진 (RULE-03 — order_lines 스냅샷만 사용)
// ============================================================

export function lineMargin(line: AnalyticsLine): number {
  return line.line_total - line.cost_price * line.quantity
}

export function lineCost(line: AnalyticsLine): number {
  return line.cost_price * line.quantity
}

// ============================================================
// 일자별 집계 (탭 1 — 매출현황)
// ============================================================

export function aggregateByDate(orders: AnalyticsOrder[]): DateBucket[] {
  const map = new Map<string, DateBucket>()
  for (const o of orders) {
    if (!isSalesOrder(o)) continue
    const date = o.order_date
    const cur = map.get(date) ?? { date, revenue: 0, cost: 0, margin: 0 }
    for (const l of o.order_lines ?? []) {
      cur.revenue += l.line_total
      cur.cost    += lineCost(l)
      cur.margin  += lineMargin(l)
    }
    map.set(date, cur)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// ============================================================
// 상품별 집계 (탭 2 — 마진분석)
// ============================================================

export function aggregateByProduct(orders: AnalyticsOrder[]): ProductRow[] {
  const map = new Map<string, ProductRow>()
  let totalMargin = 0
  for (const o of orders) {
    if (!isSalesOrder(o)) continue
    for (const l of o.order_lines ?? []) {
      const cur = map.get(l.product_name) ?? {
        product_name:        l.product_name,
        quantity:            0,
        revenue:             0,
        cost:                0,
        margin:              0,
        margin_rate:         0,
        margin_contribution: 0,
      }
      cur.quantity += l.quantity
      cur.revenue  += l.line_total
      cur.cost     += lineCost(l)
      const m       = lineMargin(l)
      cur.margin   += m
      totalMargin  += m
      map.set(l.product_name, cur)
    }
  }
  for (const r of map.values()) {
    r.margin_rate         = r.revenue !== 0 ? (r.margin / r.revenue) * 100 : 0
    r.margin_contribution = totalMargin !== 0 ? (r.margin / totalMargin) * 100 : 0
  }
  return [...map.values()].sort((a, b) => b.margin - a.margin)
}

// ============================================================
// 거래처별 집계 (탭 3 — 거래처분석)
// ============================================================

export function aggregateByCustomer(
  orders: AnalyticsOrder[],
  prevOrders: AnalyticsOrder[] = [],
): CustomerRow[] {
  const map = new Map<string, CustomerRow>()
  let totalRevenue = 0

  for (const o of orders) {
    if (!isSalesOrder(o)) continue
    const key  = buildCustomerKey(o)
    const name = resolveCustomerName(o)
    const cur  = map.get(key) ?? {
      customer_key:  key,
      customer_name: name,
      revenue:       0,
      cost:          0,
      margin:        0,
      margin_rate:   0,
      share:         0,
      rank:          0,
      growth_rate:   null,
    }
    if ((cur.customer_name === '알 수 없음' || cur.customer_name === '') && name) {
      cur.customer_name = name
    }
    for (const l of o.order_lines ?? []) {
      cur.revenue += l.line_total
      cur.cost    += lineCost(l)
      cur.margin  += lineMargin(l)
      totalRevenue += l.line_total
    }
    map.set(key, cur)
  }

  // 전기간 집계 — 성장률 계산용
  const prevMap = new Map<string, number>()
  for (const o of prevOrders) {
    if (!isSalesOrder(o)) continue
    const key = buildCustomerKey(o)
    let sum = prevMap.get(key) ?? 0
    for (const l of o.order_lines ?? []) sum += l.line_total
    prevMap.set(key, sum)
  }

  const rows = [...map.values()]
    .sort((a, b) => b.revenue - a.revenue)

  rows.forEach((r, i) => {
    r.rank        = i + 1
    r.share       = totalRevenue !== 0 ? (r.revenue / totalRevenue) * 100 : 0
    r.margin_rate = r.revenue !== 0 ? (r.margin / r.revenue) * 100 : 0
    const prev    = prevMap.get(r.customer_key) ?? 0
    r.growth_rate = prev !== 0 ? ((r.revenue - prev) / prev) * 100 : (r.revenue > 0 ? null : 0)
  })

  return rows
}

// ============================================================
// 기간 헬퍼
// ============================================================

/** 동일 길이 직전 기간 — `to - from` 일수만큼 앞으로 당김 */
export function prevPeriodRange(from: string, to: string): { from: string; to: string } {
  const fd = new Date(from + 'T00:00:00Z')
  const td = new Date(to   + 'T00:00:00Z')
  const ms = td.getTime() - fd.getTime()
  const days = Math.floor(ms / 86400000)
  const prevTo   = new Date(fd.getTime() - 86400000)
  const prevFrom = new Date(prevTo.getTime() - days * 86400000)
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to:   prevTo.toISOString().slice(0, 10),
  }
}

/** 매출현황 요약 — 합계 + 전기간 대비 */
export function buildOverviewSummary(
  orders: AnalyticsOrder[],
  prevOrders: AnalyticsOrder[],
): OverviewSummary {
  let revenue = 0, cost = 0, margin = 0
  for (const o of orders) {
    if (!isSalesOrder(o)) continue
    for (const l of o.order_lines ?? []) {
      revenue += l.line_total
      cost    += lineCost(l)
      margin  += lineMargin(l)
    }
  }
  let prev_revenue = 0, prev_margin = 0
  for (const o of prevOrders) {
    if (!isSalesOrder(o)) continue
    for (const l of o.order_lines ?? []) {
      prev_revenue += l.line_total
      prev_margin  += lineMargin(l)
    }
  }
  const margin_rate       = revenue !== 0 ? (margin / revenue) * 100 : 0
  const prev_margin_rate  = prev_revenue !== 0 ? (prev_margin / prev_revenue) * 100 : 0
  return {
    revenue, cost, margin, margin_rate,
    prev_revenue, prev_margin,
    revenue_growth:    prev_revenue !== 0 ? ((revenue - prev_revenue) / prev_revenue) * 100 : null,
    margin_growth:     prev_margin  !== 0 ? ((margin  - prev_margin)  / prev_margin)  * 100 : null,
    margin_rate_delta: prev_revenue !== 0 ? margin_rate - prev_margin_rate : null,
  }
}

// ============================================================
// 사용자 지정 외 / 거래처 정렬용 — effectiveOrderAmount는 호환 보존
// ============================================================
export { effectiveOrderAmount, isSalesOrder, buildCustomerKey, resolveCustomerName }
