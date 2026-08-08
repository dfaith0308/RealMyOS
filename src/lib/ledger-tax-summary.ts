/**
 * 세금계산서·수금 관련 런타임 집계 헬퍼 (RULE-02: DB 저장 금지).
 */

export interface TaxSummary {
  taxable_paid: number
  card_paid: number
  invoice_amount: number
}

export type TaxSummaryLedgerRow = {
  type: 'order' | 'payment'
  payment_method?: string | null
  payment_amount?: number | null
}

/** 기간·결제수단 필터가 이미 적용된 ledger rows(입금)로 tax_summary 산출 */
export function computeTaxSummaryFromLedgerRows(
  rows: TaxSummaryLedgerRow[],
): TaxSummary {
  let taxable_paid = 0
  let card_paid = 0
  for (const r of rows) {
    if (r.type !== 'payment') continue
    const method = r.payment_method ?? null
    const amount = Number(r.payment_amount ?? 0)
    if (!amount) continue
    if (method === 'cash' || method === 'transfer') taxable_paid += amount
    else if (method === 'card') card_paid += amount
  }
  return {
    taxable_paid,
    card_paid,
    invoice_amount: taxable_paid,
  }
}

export type OrderLineTaxInput = {
  tax_type?: string | null
  line_total?: number | null
}

/** 주문 라인 line_total을 tax_type별로 합산 (세금계산서 요약용) */
export function sumOrderLinesByTaxType(
  lines: OrderLineTaxInput[],
): { taxable: number; exempt: number } {
  let taxable = 0
  let exempt = 0
  for (const l of lines) {
    const amt = Number(l.line_total ?? 0)
    if (!amt) continue
    if (l.tax_type === 'exempt') exempt += amt
    else taxable += amt
  }
  return { taxable, exempt }
}
