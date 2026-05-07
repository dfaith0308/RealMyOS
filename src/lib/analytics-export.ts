'use client'

import type {
  CustomerAnalyticsResult,
  MarginResult,
  OverviewResult,
  RiskSignals,
} from '@/actions/analytics'

type XLSXMod = typeof import('xlsx')

let _xlsx: XLSXMod | null = null
async function getXLSX(): Promise<XLSXMod> {
  if (_xlsx) return _xlsx
  // Dynamic import so /analytics build doesn't eagerly bundle xlsx.
  const mod = (await import('xlsx')) as XLSXMod
  _xlsx = mod
  return mod
}

function safeSheetName(name: string): string {
  // Excel worksheet name constraints: <= 31 chars, no: : \ / ? * [ ]
  const cleaned = name.replace(/[:\\/?*\[\]]/g, ' ').trim()
  return cleaned.length > 31 ? cleaned.slice(0, 31) : (cleaned || 'Sheet1')
}

function fileName(tab: string, from: string, to: string): string {
  const safe = (s: string) => s.replace(/[^0-9A-Za-z_\-]/g, '')
  return `analytics_${safe(tab)}_${safe(from)}_${safe(to)}.xlsx`
}

function downloadWorkbook(XLSX: XLSXMod, wb: any, tab: string, from: string, to: string) {
  XLSX.writeFile(wb, fileName(tab, from, to), { compression: true })
}

export async function exportOverviewToExcel(data: OverviewResult, from: string, to: string) {
  const XLSX = await getXLSX()
  const wb = XLSX.utils.book_new()

  const rows = (data.by_date ?? []).map((r) => ({
    date: r.date,
    revenue: r.revenue,
    cost: r.cost,
    margin: r.margin,
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName('by_date'))

  downloadWorkbook(XLSX, wb, 'overview', from, to)
}

export async function exportMarginToExcel(data: MarginResult, from: string, to: string) {
  const XLSX = await getXLSX()
  const wb = XLSX.utils.book_new()

  const rows = (data.rows ?? []).map((r) => ({
    product_name: r.product_name,
    quantity: r.quantity,
    revenue: r.revenue,
    cost: r.cost,
    margin: r.margin,
    margin_rate: r.margin_rate,
    margin_contribution: r.margin_contribution,
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName('products'))

  downloadWorkbook(XLSX, wb, 'margin', from, to)
}

export async function exportCustomerToExcel(data: CustomerAnalyticsResult, from: string, to: string) {
  const XLSX = await getXLSX()
  const wb = XLSX.utils.book_new()

  const rows = (data.rows ?? []).map((r) => ({
    customer_name: r.customer_name,
    revenue: r.revenue,
    cost: r.cost,
    margin: r.margin,
    margin_rate: r.margin_rate,
    share: r.share,
    rank: r.rank,
    growth_rate: r.growth_rate,
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName('customers'))

  downloadWorkbook(XLSX, wb, 'customer', from, to)
}

export async function exportRiskToExcel(data: RiskSignals, from: string, to: string) {
  const XLSX = await getXLSX()
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      (data.declining_customers ?? []).map((r) => ({
        customer_name: r.customer_name,
        prev_revenue: r.prev_revenue,
        revenue: r.revenue,
        growth_rate: r.growth_rate,
      })),
    ),
    safeSheetName('매출감소'),
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      (data.low_margin_customers ?? []).map((r) => ({
        customer_name: r.customer_name,
        revenue: r.revenue,
        margin_rate: r.margin_rate,
      })),
    ),
    safeSheetName('저마진거래처'),
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      (data.loss_products ?? []).map((r) => ({
        product_name: r.product_name,
        revenue: r.revenue,
        margin: r.margin,
        margin_rate: r.margin_rate,
      })),
    ),
    safeSheetName('손해상품'),
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      (data.high_revenue_low_margin ?? []).map((r) => ({
        rank: r.rank,
        customer_name: r.customer_name,
        revenue: r.revenue,
        margin: r.margin,
        margin_rate: r.margin_rate,
      })),
    ),
    safeSheetName('핵심위험'),
  )

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      (data.high_refund_products ?? []).map((r) => ({
        product_name: r.product_name,
        sales_revenue: r.sales_revenue,
        refund_revenue: r.refund_revenue,
        refund_ratio: r.refund_ratio,
      })),
    ),
    safeSheetName('반품많은상품'),
  )

  downloadWorkbook(XLSX, wb, 'risk', from, to)
}

