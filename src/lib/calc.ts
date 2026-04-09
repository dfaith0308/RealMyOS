import type { LineCalculation, OrderTotals, TaxType } from '@/types/order'

export function calcLine(
  unit_price: number,
  quantity: number,
  tax_type: TaxType,
): LineCalculation {
  const line_total = unit_price * quantity
  const abs = Math.abs(line_total)
  const sign = line_total < 0 ? -1 : 1

  let supply_price: number
  let vat_amount: number

  if (tax_type === 'taxable') {
    supply_price = sign * Math.round(abs / 1.1)
    vat_amount = line_total - supply_price
  } else {
    supply_price = line_total
    vat_amount = 0
  }

  return { supply_price, vat_amount, line_total }
}

export function calcOrderTotals(lines: LineCalculation[]): OrderTotals {
  return lines.reduce(
    (acc, l) => ({
      total_supply_price: acc.total_supply_price + l.supply_price,
      total_vat_amount: acc.total_vat_amount + l.vat_amount,
      total_amount: acc.total_amount + l.line_total,
    }),
    { total_supply_price: 0, total_vat_amount: 0, total_amount: 0 },
  )
}

export function calcMarginRate(unit_price: number, cost_price: number): number {
  if (!unit_price || unit_price <= 0 || !cost_price || cost_price <= 0) return 0
  const rate = ((unit_price - cost_price) / unit_price) * 100
  if (!isFinite(rate) || isNaN(rate)) return 0
  return rate
}

export function formatOrderNumber(date: Date, seq: number): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `ORD-${y}${m}${d}-${String(seq).padStart(3, '0')}`
}

export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원'
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}