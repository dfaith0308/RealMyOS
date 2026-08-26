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
