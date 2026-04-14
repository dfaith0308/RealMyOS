/**
 * ledger-calc.ts — 돈 흐름 계산 공통 유틸
 *
 * 이 파일의 공식을 벗어나는 계산 금지.
 * getCustomersWithStats / getCustomersWithBalance / 원장 / 대시보드 전부 여기만 사용.
 *
 * 공식 정의:
 *   effectiveOrderAmount = final_amount ?? total_amount   (할인/포인트 적용값, NULL 안전)
 *   receivable = opening + SUM(effectiveOrderAmount) - SUM(paid)   (min 0)
 *   deposit    = SUM(paid) - SUM(effectiveOrderAmount)              (min 0, opening 무관)
 *   current_balance = opening + SUM(effectiveOrderAmount) - SUM(paid)  (부호 유지)
 */

/** 주문 1건의 확정금액: final_amount 우선, NULL이면 total_amount */
export function effectiveOrderAmount(order: {
  final_amount?: number | null
  total_amount:  number
}): number {
  return order.final_amount ?? order.total_amount
}

/** 미수금: 0 미만은 0 */
export function calcReceivable(
  openingBalance:   number,
  totalOrderFinal:  number,
  totalPaid:        number,
): number {
  return Math.max(0, openingBalance + totalOrderFinal - totalPaid)
}

/** 예치금: 수금이 주문 확정금액을 초과한 분 (opening 무관) */
export function calcDeposit(
  totalOrderFinal: number,
  totalPaid:       number,
): number {
  return Math.max(0, totalPaid - totalOrderFinal)
}

/** 현재잔액: 부호 유지 (음수 = 예치) */
export function calcCurrentBalance(
  openingBalance:  number,
  totalOrderFinal: number,
  totalPaid:       number,
): number {
  return openingBalance + totalOrderFinal - totalPaid
}