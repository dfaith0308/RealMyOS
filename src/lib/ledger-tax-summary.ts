/**
 * 수금 기준 세금계산서 대상 금액 집계 (RULE-02: 런타임 계산만, DB 저장 금지).
 * getCustomerLedger tax_summary 와 동일 산식 — 신규 계산식 금지.
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
