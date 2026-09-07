/** commerce_orders / 결제 UI — Server Action 밖에서도 사용 가능한 상수·타입 */

export const COMMERCE_ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'preparing',
  'shipped',
  'completed',
  'cancelled',
  'refunded',
] as const

export type CommerceOrderStatus = (typeof COMMERCE_ORDER_STATUSES)[number]

export const COMMERCE_PAYMENT_METHODS = ['card', 'bank_transfer', 'kakao_manual'] as const

export type CommercePaymentMethod = (typeof COMMERCE_PAYMENT_METHODS)[number]

/** commerce_product_listings.shipping_type — Server Action 파일 밖에서도 사용 */
export const LISTING_SHIPPING_TYPES = ['free', 'paid', 'conditional_free'] as const

export type ListingShippingType = (typeof LISTING_SHIPPING_TYPES)[number]

/**
 * 대량등록 기본배송비 fallback.
 * 무료배송 상품은 기본배송비를 입력하지 않아도 되지만, 저장 경로가 1원 이상 정수를 요구하므로
 * 값이 없을 때 이 값으로 채운다. (상품 등록 폼의 기본값과 동일)
 */
export const DEFAULT_BASE_SHIPPING_FEE = 3500

/**
 * 대량등록 행의 배송 유형을 정한다.
 * 현재 대량등록 템플릿에는 배송 유형 컬럼이 없어 항상 무료배송으로 생성한다.
 * 나중에 컬럼이 생기면 그 값을 그대로 넘기면 된다.
 */
export function resolveBulkShippingType(raw?: string | null): ListingShippingType {
  const v = (raw ?? '').trim().toLowerCase()
  if (v === 'paid' || v === '유료배송') return 'paid'
  if (v === 'conditional_free' || v === '조건부무료' || v === '조건부 무료') return 'conditional_free'
  return 'free'
}

/** 무료배송이면 기본배송비를 요구하지 않는다 */
export function requiresBaseShippingFee(shippingType: ListingShippingType): boolean {
  return shippingType !== 'free'
}

/**
 * 매입가 없이 상품이 저장될 때 product_costs 에 넣는 자리값.
 * 원가 행이 아예 없으면 주문 스냅샷(getCurrentCostPrice)이 원가를 찾지 못하므로
 * 0원이 아니라 1원을 둔다. "아직 안 채운 값"이지 "진짜 1원"이 아니다.
 */
export const PLATFORM_COMMERCE_PLACEHOLDER_COST = 1

/**
 * "원가 미확정" 판정.
 * 자리값(1원) 이하이거나 원가 행 자체가 없는 상품은 마진을 계산해봐야 의미가 없다.
 * 화면에서는 마진율 대신 "원가 미확정"으로 보여주고, 원가 기반 집계에서는 따로 센다.
 */
export function isCostUnconfirmed(cost: number | null | undefined): boolean {
  if (cost == null || !Number.isFinite(cost)) return true
  return cost <= PLATFORM_COMMERCE_PLACEHOLDER_COST
}

/**
 * 폼·엑셀에서 받은 매입가를 저장 가능한 정수로 정규화한다.
 * 비었거나 0 이하면 null — 호출부가 "미입력"과 "0원"을 구분하지 않아도 되게 한다.
 */
export function normalizeCostPriceInput(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(n)) return null
  const i = Math.round(n)
  return i > 0 ? i : null
}
