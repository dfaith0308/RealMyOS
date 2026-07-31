/**
 * ledger-calc.ts — 회계 엔진 (단일 미수·연체·예치 정의)
 *
 * 매출 인정: status === 'confirmed' 만 (delivered/completed 는 회계 미반영)
 * 미수금: getAccountsReceivable() 만 사용 (신규 코드는 calcReceivable 직접 호출 금지)
 * 음수 AR = 초과입금(선수금). UI는 classifyAccountsReceivable()로 라벨/색 분기.
 *
 * 매출(saleAmount): total - discount - point
 *   — deposit_used 제외. 예치금은 결제수단일 뿐 판매를 취소하지 않음.
 * 실청구/미수(effectiveOrderAmount = receivableAmount):
 *   — total - discount - point - deposit (= DB final_amount)
 *   — 헤더 조정값이 없으면 final_amount → total_amount fallback
 */

/** 매출액 — deposit_used 미차감 */
export function saleAmount(order: {
  total_amount: number
  discount_amount?: number | null
  point_used?: number | null
}): number {
  const total = Number(order.total_amount ?? 0)
  const discount = Math.max(0, Number(order.discount_amount ?? 0))
  const point = Math.max(0, Number(order.point_used ?? 0))
  return Math.max(0, total - discount - point)
}

/** 실청구액(미수 가산분) — deposit_used 차감. 원장·AR 전용 */
export function effectiveOrderAmount(order: {
  final_amount?: number | null
  total_amount: number
  discount_amount?: number | null
  point_used?: number | null
  deposit_used?: number | null
}): number {
  const total = Number(order.total_amount ?? 0)
  const hasHeaderAdjustments =
    order.discount_amount != null ||
    order.point_used != null ||
    order.deposit_used != null

  if (hasHeaderAdjustments) {
    const discount = Math.max(0, Number(order.discount_amount ?? 0))
    const point = Math.max(0, Number(order.point_used ?? 0))
    const deposit = Math.max(0, Number(order.deposit_used ?? 0))
    return Math.max(0, total - discount - point - deposit)
  }

  if (order.final_amount != null && Number.isFinite(Number(order.final_amount))) {
    return Number(order.final_amount)
  }
  return total
}

/** effectiveOrderAmount 별칭 — 미수/원장 용도 명시 */
export const receivableAmount = effectiveOrderAmount

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
 *
 * 음수 = 초과입금(선수금). 예치금 미운영 정책(2026-07-21)에 따라
 * Math.max(0) 클램프하지 않고 부호 그대로 반환한다.
 */
export function getAccountsReceivable(
  openingBalance: number,
  totalConfirmedSalesFinal: number,
  totalInboundPaidConfirmed: number,
  totalReturnAmount = 0,
): number {
  return (
    openingBalance + totalConfirmedSalesFinal - totalInboundPaidConfirmed - totalReturnAmount
  )
}

/** AR 부호별 UI 표시 (미수금 / 초과입금 / 정산완료) */
export type ArDisplayKind = 'receivable' | 'prepayment' | 'settled'

export type ArDisplay = {
  kind: ArDisplayKind
  /** 원본 부호 값 (음수 = 초과입금) */
  signed: number
  /** 표시용 절댓값 */
  absolute: number
  /** KPI/컬럼 라벨 */
  label: string
  /** 금액 색상 */
  color: string
  /** 음수일 때 부가 설명 */
  hint: string | null
}

const AR_COLOR_RECEIVABLE = '#dc2626'
const AR_COLOR_PREPAYMENT = '#1d4ed8'
const AR_COLOR_SETTLED = '#15803d'

/**
 * AR 숫자를 사용자 라벨/색으로 변환.
 * 초과입금은 "-20,000원"이 아니라 라벨 "초과입금" + 절댓값으로 보여 준다.
 */
export function classifyAccountsReceivable(ar: number): ArDisplay {
  const signed = Number(ar) || 0
  if (signed > 0) {
    return {
      kind: 'receivable',
      signed,
      absolute: signed,
      label: '미수금',
      color: AR_COLOR_RECEIVABLE,
      hint: null,
    }
  }
  if (signed < 0) {
    return {
      kind: 'prepayment',
      signed,
      absolute: Math.abs(signed),
      label: '초과입금',
      color: AR_COLOR_PREPAYMENT,
      hint: '다음 주문에 자동 차감',
    }
  }
  return {
    kind: 'settled',
    signed: 0,
    absolute: 0,
    label: '미수금',
    color: AR_COLOR_SETTLED,
    hint: null,
  }
}

/** formatKRW(absolute) 와 함께 쓸 표시 금액 — 초과입금도 양수로 */
export function arDisplayAmount(ar: number): number {
  return classifyAccountsReceivable(ar).absolute
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
    deposit_used?: number | null
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
 * @deprecated 예치금 미운영. 초과입금은 getAccountsReceivable 음수로 표현.
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
