/**
 * ledger-calc.ts — 돈 흐름 계산 공통 유틸
 *
 * 모든 함수는 named export.
 * 이 파일의 공식을 벗어나는 계산 금지.
 */

/** 주문 1건의 확정금액: final_amount 우선, NULL이면 total_amount */
export function effectiveOrderAmount(order: {
  final_amount?: number | null
  total_amount?: number | null
}): number {
  return Number(order.final_amount ?? order.total_amount ?? 0)
}

/** 매출 집계 대상 상태 여부: confirmed 또는 delivered */
export function isConfirmedRevenueStatus(status?: string | null): boolean {
  return status === 'confirmed' || status === 'delivered'
}

/**
 * 공급자 매출 주문 여부
 * order_type = 'sale' 또는 null(legacy) → true
 * order_type = 'purchase' → false
 */
export function isSalesOrder(order: { order_type?: string | null }): boolean {
  return order.order_type == null || order.order_type === 'sale'
}

/** Map key: customer_id 우선, 없으면 customer_name 기반 */
export function buildCustomerKey(order: {
  customer_id?: string | null
  customer_name?: string | null
}): string {
  return order.customer_id ?? `name:${order.customer_name ?? '알 수 없음'}`
}

/** 거래처명 resolve: customer_name snapshot 우선, customers join fallback */
export function resolveCustomerName(order: {
  customer_name?: string | null
  customers?: { name?: string | null } | null
}): string {
  return order.customer_name ?? order.customers?.name ?? '알 수 없음'
}

/** 미수금: 0 미만은 0 */
export function calcReceivable(
  openingBalance: number,
  totalOrderFinal: number,
  totalPaid: number,
): number {
  return Math.max(0, openingBalance + totalOrderFinal - totalPaid)
}

/**
 * 예치금: 항상 0
 * ⚠️ 예치금 기능 미완성 — "선입금→주문차감" 구현 전까지 0 고정.
 * calcDeposit(totalFinal, paid) 방식(수금 초과분 자동 예치)은 오계산 유발로 제거.
 */
export function calcDeposit(
  _totalOrderFinal?: number,
  _totalPaid?: number,
): number {
  return 0
}

/** 현재잔액: 부호 유지 (음수 = 예치 상태) */
export function calcCurrentBalance(
  openingBalance: number,
  totalOrderFinal: number,
  totalPaid: number,
): number {
  return openingBalance + totalOrderFinal - totalPaid
}
