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

/**
 * E2E 시뮬레이션이 남긴 [TEST] 상품인가.
 * 실제로 팔 수 없는 데이터라 "원가 미확정"과 같은 칸에 세면 안 된다.
 * 상품명은 buildPlatformProductDisplayName 으로 "브랜드 상품명 규격"이 되므로
 * 앞머리에 [TEST] 가 붙는지만 본다.
 */
export function isTestProductName(name: string | null | undefined): boolean {
  return /^\s*\[TEST\]/i.test(String(name ?? ''))
}

/**
 * 리스팅 판매자 이관 기록의 admin_logs.action_type.
 *
 * 이관(P3)은 리스팅의 product_id 를 새 공급자 상품으로 옮기고, 옛 플랫폼 상품은
 * 과거 원가·마진 기록으로 남겨둔다(삭제하지 않는다). 그 결과 옛 상품에는 플랫폼
 * 리스팅이 하나도 없는 상태가 되어 "이미 등록된 상품" 검사에 걸리지 않는다.
 * 다시 등록되는 것을 막으려면 이 이력을 봐야 한다.
 *
 * admin_logs.old_value->>'from_product_id' 에 이관되어 나간 플랫폼 product_id 가 들어 있다.
 * 서버 액션 파일('use server')은 async 함수만 export 할 수 있어 여기에 둔다.
 */
export const LISTING_TRANSFER_ACTION_TYPE = 'listing_supplier_transferred'

/**
 * 매입가 상한. product_costs.cost_price 는 postgres int4 라 2,147,483,647 을 넘으면
 * insert 가 22003 (out of range) 으로 터진다. 애플리케이션에서 먼저 걸러
 * 읽을 수 있는 메시지를 주기 위한 기술적 상한이다.
 *
 * 주의: 이것은 "DB 가 받아줄 수 있는 최대"이지 "사업적으로 말이 되는 최대"가 아니다.
 * 예를 들어 9,999만원짜리 매입가도 이 상한은 통과한다. 품목 성격에 맞는 업무 상한이
 * 필요하면 별도로 정해 이 값보다 낮게 건다.
 */
export const MAX_COST_PRICE = 2147483647
