/**
 * ledger-calc.ts — 회계 엔진 (단일 미수·연체·예치 정의)
 *
 * 매출 인정: status === 'confirmed' 만 (delivered/completed 는 회계 미반영)
 * 미수금: getAccountsReceivable() 만 사용 (신규 코드는 calcReceivable 직접 호출 금지)
 * final_amount: 최종 청구액 — point_used 재차감 금지
 */

/** 주문 1건의 확정금액: final_amount 우선, NULL이면 total_amount */
export function effectiveOrderAmount(order: {
  final_amount?: number | null
  total_amount:  number
}): number {
  return order.final_amount ?? order.total_amount
}

/** 회계 매출 인정 여부 — confirmed ONLY */
export function isConfirmedRevenueStatus(status: string): boolean {
  return status === 'confirmed'
}

/** 공급자 매출 주문 여부 (purchase 제외, legacy null = sale 간주) */
export function isSalesOrder(order: { order_type?: string | null }): boolean {
  return order.order_type == null || order.order_type === 'sale'
}

/** Map key: customer_id 우선, 없으면 name 기반 */
export function buildCustomerKey(order: {
  customer_id?: string | null
  customer_name?: string | null
}): string {
  return order.customer_id ?? `name:${order.customer_name ?? '알 수 없음'}`
}

/** 거래처명 resolve: customer_name snapshot 우선, 빈 문자열은 조인 이름으로 fallback */
export function resolveCustomerName(order: {
  customer_name?: string | null
  customers?: { name?: string | null } | null
}): string {
  const snap = order.customer_name?.trim()
  if (snap) return snap
  const joined = order.customers?.name?.trim()
  if (joined) return joined
  return '알 수 없음'
}

/**
 * Receivable Single Function — 미수금(Accounts Receivable)
 * 반품 도입 시 totalReturnAmount 에 합산 반영
 */
export function getAccountsReceivable(
  openingBalance: number,
  totalConfirmedSalesFinal: number,
  totalInboundPaidConfirmed: number,
  totalReturnAmount = 0,
): number {
  return Math.max(
    0,
    openingBalance + totalConfirmedSalesFinal - totalInboundPaidConfirmed - totalReturnAmount,
  )
}

/**
 * 연체 미수 (기한 경과 주문 합 − 총 입금, 0 미만 클램프)
 * due 일자 = order_date + paymentTermsDays (일). 별도 due_date 컬럼 도입 시 이 함수만 교체.
 */
export function getOverdueReceivable(
  orders: Array<{ order_date: string; final_amount?: number | null; total_amount: number }>,
  paymentTermsDays: number,
  totalInboundPaidConfirmed: number,
  todayStr: string,
): number {
  if (paymentTermsDays <= 0) return 0
  let overdueSum = 0
  for (const o of orders) {
    const dueDate = new Date(o.order_date + 'T00:00:00Z')
    dueDate.setUTCDate(dueDate.getUTCDate() + paymentTermsDays)
    const dueDateStr = dueDate.toISOString().slice(0, 10)
    if (dueDateStr < todayStr) overdueSum += effectiveOrderAmount(o as { final_amount?: number | null; total_amount: number })
  }
  return Math.max(0, overdueSum - totalInboundPaidConfirmed)
}

/** customer_deposits.balance 진실값 (없으면 0) */
export function getCustomerDeposit(balanceFromCustomerDeposits: number | null | undefined): number {
  return Math.max(0, Number(balanceFromCustomerDeposits ?? 0))
}

/** @deprecated getAccountsReceivable 사용 */
export function calcReceivable(
  openingBalance:   number,
  totalOrderFinal:  number,
  totalPaid:        number,
): number {
  return getAccountsReceivable(openingBalance, totalOrderFinal, totalPaid, 0)
}

/**
 * @deprecated 레거시 호환. 신규: 미수는 getAccountsReceivable, 예치는 getCustomerDeposit
 * (음수 선수 표현 금지 정책 — 남는 값은 예치 테이블 기준)
 */
export function calcDeposit(
  _totalOrderFinal: number,
  _totalPaid:       number,
): number {
  return 0
}

/**
 * @deprecated DB/필드 호환용. 신규 UI·로직은 receivable_amount / getAccountsReceivable 만 사용
 */
export function calcCurrentBalance(
  openingBalance:  number,
  totalOrderFinal: number,
  totalPaid:       number,
): number {
  return getAccountsReceivable(openingBalance, totalOrderFinal, totalPaid, 0)
}
