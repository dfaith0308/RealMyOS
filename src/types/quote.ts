// ============================================================
// 견적 타입 정의
// ============================================================

export type QuoteStatus = 'draft' | 'sent' | 'partially_converted' | 'converted' | 'expired'
export type QuoteItemStatus = 'pending' | 'partially_converted' | 'converted'

export interface QuoteItem {
  id:                 string
  quote_id:           string
  product_id:         string | null
  product_code:       string
  product_name:       string
  quantity:           number
  quoted_price:       number
  tax_type:           'taxable' | 'exempt'
  line_total:         number
  pricing_mode:       'unit' | 'total' | null
  converted_quantity: number
  status:             QuoteItemStatus
}

export interface Quote {
  id:           string
  tenant_id:    string
  customer_id:  string
  customer_name?: string
  status:       QuoteStatus
  total_amount: number
  expires_at:   string | null
  memo:         string | null
  created_at:   string
  updated_at:   string
}

export interface QuoteDetail extends Quote {
  items: QuoteItem[]
}

export interface CreateQuoteInput {
  customer_id:  string
  items:        CreateQuoteItemInput[]
  expires_at?:  string
  memo?:        string
  status?:      QuoteStatus
}

export interface CreateQuoteItemInput {
  product_id:    string
  product_code:  string
  product_name:  string
  quantity:      number
  quoted_price:  number
  tax_type:      'taxable' | 'exempt'
  line_total:    number
  pricing_mode?: 'unit' | 'total'
}

export interface ConvertQuoteInput {
  quote_id:    string
  conversions: Array<{
    item_id:      string
    qty:          number
    quoted_price: number  // 전환 시 가격 수정 허용
    tax_type:     'taxable' | 'exempt'
    product_id:   string
    product_code: string
    product_name: string
  }>
  order_date?:  string
  memo?:        string
}
