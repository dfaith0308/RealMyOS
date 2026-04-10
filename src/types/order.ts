export type FulfillmentType = 'stock' | 'consignment'
export type OrderStatus = 'draft' | 'confirmed' | 'cancelled'
export type TaxType = 'taxable' | 'exempt'

export interface OrderLineInput {
  product_id: string
  quantity: number
  unit_price: number
  fulfillment_type: FulfillmentType
  product_code: string
  product_name: string
  cost_price: number
  tax_type: TaxType
  // line_total 진실값 — mode=total일 때 사용자 입력 총액 그대로 사용
  // unit_price는 참고값이므로 unit_price×qty ≠ line_total 허용
  line_total_override?: number
}

export interface CreateOrderInput {
  customer_id:     string
  order_date:      string
  lines:           OrderLineInput[]
  memo?:           string
  status?:         OrderStatus
  discount_amount?: number   // 기간할인 (orders 레벨, 상품 무관)
  point_used?:      number   // 적립금 사용 (orders 레벨, 상품 무관)
}

export interface LineCalculation {
  supply_price: number
  vat_amount: number
  line_total: number
}

export interface OrderTotals {
  total_supply_price: number
  total_vat_amount: number
  total_amount: number
}

export interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

export interface CreatedOrder {
  order_id:        string
  order_number:    string
  total_amount:    number   // 상품 합계 (할인 전)
  discount_amount: number
  point_used:      number
  final_amount:    number   // 실제 결제금액 = total - discount - point
}

export interface CustomerForOrder {
  id: string
  name: string
  payment_terms_days: number
}

export interface ProductForOrder {
  id: string
  product_code: string
  name: string
  tax_type: TaxType
  procurement_type: string
  fulfillment_type: FulfillmentType
  current_cost_price: number
  last_unit_price: number           // 이 거래처의 최근 단가 (없으면 정상가)
  has_purchase_history: boolean     // 이 거래처가 실제 구매한 적 있는지 여부
  // 과거 거래 복원용 — 입력했던 방식 그대로 재현
  last_pricing_mode: 'unit' | 'total' | null
  last_line_total:   number | null  // mode=total일 때 진실값
  last_qty:          number | null  // 과거 수량 (참고용)
}