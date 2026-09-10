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

import { isTestProductName } from '@/lib/commerce-constants'
import {
  saleAmount,
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
  discount_amount?: number | null
  point_used?:    number | null
  deposit_used?:  number | null
  final_amount?:  number | null
  customer_id?:   string | null
  customer_name?: string | null
  /** 조인된 customers row (이름 fallback용) */
  customers?:     { name?: string | null } | null
  order_lines?:   AnalyticsLine[]
}

export interface DateBucket {
  date:    string
  /** 전체 매출 (원가 미확정 라인도 포함) */
  revenue: number
  /** 원가가 확정된 라인의 매출 — 마진율 분모 */
  cost_basis_revenue: number
  cost:    number
  margin:  number
}

export interface ProductRow {
  product_name:        string
  quantity:            number
  revenue:             number
  /** 원가가 확정된 라인의 매출 — 마진율 분모 */
  cost_basis_revenue:  number
  cost:                number
  margin:              number
  margin_rate:         number
  margin_contribution: number
}

export interface CustomerRow {
  customer_key:  string
  customer_name: string
  revenue:       number
  /** 원가가 확정된 라인의 매출 — 마진율 분모 */
  cost_basis_revenue: number
  cost:          number
  margin:        number
  margin_rate:   number
  share:         number
  rank:          number
  growth_rate:   number | null
}

/**
 * 원가 신뢰도.
 * order_lines.cost_price 는 주문 시점 스냅샷이라, 그때 상품 원가가 비어 있었으면
 * 0/1원이 그대로 박혀 있다. 그 라인은 원가가 없는 게 아니라 "모르는" 것이라서
 * 순이익·마진율이 실제보다 높게 잡힌다. 숫자를 고치지 않고 얼마나 섞였는지만 알린다.
 */
export interface CostCoverage {
  line_count:                number
  unconfirmed_line_count:    number
  /** [TEST] 시뮬레이션 라인 — 미확정 집계에서 분리해 따로 센다 */
  test_line_count:           number
  revenue:                   number
  unconfirmed_revenue:       number
  /** 미확정 라인 매출이 전체 매출에서 차지하는 비중(%) */
  unconfirmed_revenue_share: number
}

export interface OverviewSummary {
  /** 전체 매출 — 원가 미확정 라인도 포함한다 (원장·정산과 같은 값) */
  revenue:           number
  /** 원가가 확정된 라인의 매출 — 마진율 분모 */
  cost_basis_revenue: number
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

/** 화면(commerce-constants.isCostUnconfirmed)과 같은 기준 */
const UNCONFIRMED_COST_MAX = 1

/**
 * 원가가 확정된 라인인가.
 * 주문 시점에 상품 매입가가 비어 있었으면 order_lines.cost_price 에 0/1원이 박힌다.
 * 그 라인은 원가가 "없는" 게 아니라 "모르는" 것이라, 원가·순이익·마진율 집계에서 뺀다.
 * 매출은 실제로 판 금액이므로 그대로 센다 — 원장·정산과 어긋나면 안 된다.
 */
export function isCostConfirmed(line: AnalyticsLine): boolean {
  return Number.isFinite(line.cost_price) && line.cost_price > UNCONFIRMED_COST_MAX
}

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
    const cur = map.get(date) ?? { date, revenue: 0, cost_basis_revenue: 0, cost: 0, margin: 0 }
    for (const l of o.order_lines ?? []) {
      cur.revenue += l.line_total
      if (!isCostConfirmed(l)) continue
      cur.cost_basis_revenue += l.line_total
      cur.cost               += lineCost(l)
      cur.margin             += lineMargin(l)
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
        cost_basis_revenue:  0,
        cost:                0,
        margin:              0,
        margin_rate:         0,
        margin_contribution: 0,
      }
      cur.quantity += l.quantity
      cur.revenue  += l.line_total
      map.set(l.product_name, cur)
      if (!isCostConfirmed(l)) continue
      cur.cost_basis_revenue += l.line_total
      cur.cost               += lineCost(l)
      const m                 = lineMargin(l)
      cur.margin             += m
      totalMargin            += m
    }
  }
  for (const r of map.values()) {
    // 분모는 원가 확정분 매출 — 전체 매출로 나누면 마진율이 실제보다 낮게 보인다
    r.margin_rate         = r.cost_basis_revenue !== 0 ? (r.margin / r.cost_basis_revenue) * 100 : 0
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
      cost_basis_revenue: 0,
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
      cur.revenue  += l.line_total
      totalRevenue += l.line_total
      if (!isCostConfirmed(l)) continue
      cur.cost_basis_revenue += l.line_total
      cur.cost               += lineCost(l)
      cur.margin             += lineMargin(l)
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
    r.margin_rate = r.cost_basis_revenue !== 0 ? (r.margin / r.cost_basis_revenue) * 100 : 0
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
  let revenue = 0, cost_basis_revenue = 0, cost = 0, margin = 0
  for (const o of orders) {
    if (!isSalesOrder(o)) continue
    for (const l of o.order_lines ?? []) {
      revenue += l.line_total
      if (!isCostConfirmed(l)) continue
      cost_basis_revenue += l.line_total
      cost               += lineCost(l)
      margin             += lineMargin(l)
    }
  }
  let prev_revenue = 0, prev_cost_basis_revenue = 0, prev_margin = 0
  for (const o of prevOrders) {
    if (!isSalesOrder(o)) continue
    for (const l of o.order_lines ?? []) {
      prev_revenue += l.line_total
      if (!isCostConfirmed(l)) continue
      prev_cost_basis_revenue += l.line_total
      prev_margin             += lineMargin(l)
    }
  }
  const margin_rate       = cost_basis_revenue !== 0 ? (margin / cost_basis_revenue) * 100 : 0
  const prev_margin_rate  = prev_cost_basis_revenue !== 0 ? (prev_margin / prev_cost_basis_revenue) * 100 : 0
  return {
    revenue, cost_basis_revenue, cost, margin, margin_rate,
    prev_revenue, prev_margin,
    revenue_growth:    prev_revenue !== 0 ? ((revenue - prev_revenue) / prev_revenue) * 100 : null,
    margin_growth:     prev_margin  !== 0 ? ((margin  - prev_margin)  / prev_margin)  * 100 : null,
    margin_rate_delta: prev_cost_basis_revenue !== 0 ? margin_rate - prev_margin_rate : null,
  }
}

// ============================================================
// 원가 신뢰도 (모든 탭 공통 경고용)
// ============================================================

export function buildCostCoverage(orders: AnalyticsOrder[]): CostCoverage {
  let line_count = 0
  let unconfirmed_line_count = 0
  let test_line_count = 0
  let revenue = 0
  let unconfirmed_revenue = 0

  for (const o of orders) {
    if (!isSalesOrder(o)) continue
    for (const l of o.order_lines ?? []) {
      line_count++
      revenue += l.line_total
      if (isCostConfirmed(l)) continue
      // [TEST] 잔여물은 "매입가를 채워야 할 상품"이 아니다. 따로 센다.
      if (isTestProductName(l.product_name)) {
        test_line_count++
        continue
      }
      unconfirmed_line_count++
      unconfirmed_revenue += l.line_total
    }
  }

  return {
    line_count,
    unconfirmed_line_count,
    test_line_count,
    revenue,
    unconfirmed_revenue,
    unconfirmed_revenue_share: revenue !== 0 ? (unconfirmed_revenue / revenue) * 100 : 0,
  }
}

// ============================================================
// 재export — 매출은 saleAmount / 라인합(line_total), 미수는 effectiveOrderAmount
// 본 파일 집계는 order_lines.line_total 기준이라 deposit 미차감(매출 정의와 일치)
// ============================================================
export { saleAmount, effectiveOrderAmount, isSalesOrder, buildCustomerKey, resolveCustomerName }
