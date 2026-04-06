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
}

export interface CreateOrderInput {
  customer_id: string
  order_date: string
  lines: OrderLineInput[]
  memo?: string
  status?: OrderStatus
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
  order_id: string
  order_number: string
  total_amount: number
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
  last_unit_price: number
}
