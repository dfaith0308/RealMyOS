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
