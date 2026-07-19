/**
 * ledger-calc.ts — 회계 엔진 (단일 미수·연체·예치 정의)
 *
 * 매출 인정: status === 'confirmed' 만 (delivered/completed 는 회계 미반영)
 * 미수금: getAccountsReceivable() 만 사용 (신규 코드는 calcReceivable 직접 호출 금지)
 *
 * 실청구액:
 * - discount_amount / point_used 가 있으면 total - discount - point 로 계산
 *   (DB generated final_amount 식이 잘못된 기간에도 앱 단에서 정합 유지)
 * - 없으면 final_amount → total_amount
 */

/** 주문 1건의 확정금액 */
export function effectiveOrderAmount(order: {
  final_amount?: number | null
  total_amount: number
  discount_amount?: number | null
  point_used?: number | null
}): number {
  const total = Number(order.total_amount ?? 0)
  const hasHeaderAdjustments =
    order.discount_amount != null || order.point_used != null

  if (hasHeaderAdjustments) {
    const discount = Math.max(0, Number(order.discount_amount ?? 0))
    const point = Math.max(0, Number(order.point_used ?? 0))
    return Math.max(0, total - discount - point)
  }

  if (order.final_amount != null && Number.isFinite(Number(order.final_amount))) {
    return Number(order.final_amount)
  }
  return total
}

/** 회계 매출 인정 여부 — confirmed ONLY */
export function isConfirmedRevenueStatus(status: string): boolean {
  return status === 'confirmed'
}

/**
 * 공급자 매출 주문 여부 (purchase 제외, legacy null = sale 간주)
 *
 * 반품 컨벤션:
 * - order_type에 'refund' 같은 값은 사용하지 않는다 (운영 DB: sale/purchase)
 * - 반품/환불은 sale(null 포함) 주문의 음수 line_total(또는 합계 음수)로 표현한다.
 */
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
  orders: Array<{
    order_date: string
    final_amount?: number | null
    total_amount: number
    discount_amount?: number | null
    point_used?: number | null
  }>,
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
    if (dueDateStr < todayStr) overdueSum += effectiveOrderAmount(o)
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
