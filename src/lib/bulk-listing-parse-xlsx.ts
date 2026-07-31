import * as XLSX from 'xlsx'
import type { BulkListingRow } from '@/actions/admin/bulk-listing'

const COLUMN_MAP: Record<string, keyof Omit<BulkListingRow, 'row_number'>> = {
  brand_name: 'brand_name',
  product_name: 'product_name',
  spec: 'spec',
  category: 'category',
  sub_category: 'sub_category',
  supply_price: 'supply_price',
  commerce_price: 'commerce_price',
  base_shipping_fee: 'base_shipping_fee',
  original_price: 'original_price',
  free_shipping_qty: 'free_shipping_qty',
  bulk_qty: 'bulk_qty',
  bulk_discount_rate: 'bulk_discount_rate',
  box_qty: 'box_qty',
  storage_method: 'storage_method',
  ingredients: 'ingredients',
  manufacturer: 'manufacturer',
  usage_desc: 'usage_desc',
  barcode: 'barcode',
  item_report_number: 'item_report_number',
  thumbnail_url: 'thumbnail_url',
}

const NUMERIC_FIELDS = new Set<keyof BulkListingRow>([
  'supply_price',
  'commerce_price',
  'base_shipping_fee',
  'original_price',
  'free_shipping_qty',
  'bulk_qty',
  'bulk_discount_rate',
  'box_qty',
  'row_number',
])

function cellStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function parseNumber(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : undefined
}

/** Prefer the 「상품등록」 sheet (v3 template). Fall back to first sheet. */
export function resolveProductSheetName(sheetNames: string[]): string | null {
  const exact = sheetNames.find((n) => n.trim() === '상품등록')
  if (exact) return exact
  const loose = sheetNames.find((n) => n.replace(/\s/g, '').includes('상품등록'))
  if (loose) return loose
  return sheetNames[0] ?? null
}

export function parseBulkListingWorkbook(buffer: ArrayBuffer): {
  sheetName: string
  rows: BulkListingRow[]
} {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = resolveProductSheetName(workbook.SheetNames)
  if (!sheetName) return { sheetName: '', rows: [] }

  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new Error(`시트「${sheetName}」을(를) 찾을 수 없습니다. 「상품등록」시트가 있는지 확인하세요.`)
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  if (matrix.length < 3) return { sheetName, rows: [] }

  let headerRowIndex = -1
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const row = matrix[i]
    if (
      row &&
      Array.isArray(row) &&
      row.some((cell: unknown) => {
        const key = cellStr(cell).toLowerCase()
        return key === 'product_name' || key === 'brand_name' || key === 'commerce_price'
      })
    ) {
      headerRowIndex = i
      break
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('엑셀 형식이 올바르지 않습니다. 영문 키 헤더(product_name 등)가 없습니다.')
  }

  const dataStartIndex = headerRowIndex + 2
  const headerRow = matrix[headerRowIndex]
  if (!Array.isArray(headerRow)) return { sheetName, rows: [] }

  const colIndex: Partial<Record<keyof Omit<BulkListingRow, 'row_number'>, number>> = {}
  headerRow.forEach((header, idx) => {
    const key = cellStr(header).toLowerCase()
    const field = COLUMN_MAP[key]
    if (field) colIndex[field] = idx
  })

  const rows: BulkListingRow[] = []

  for (let i = dataStartIndex; i < matrix.length; i++) {
    const line = matrix[i]
    if (!Array.isArray(line)) continue

    const partial: Partial<BulkListingRow> = { row_number: i + 1 }

    for (const [field, idx] of Object.entries(colIndex) as [keyof Omit<BulkListingRow, 'row_number'>, number][]) {
      const raw = line[idx]
      if (NUMERIC_FIELDS.has(field)) {
        const n = parseNumber(raw)
        if (n !== undefined) (partial as Record<string, unknown>)[field] = Math.round(n)
      } else {
        const s = cellStr(raw)
        if (s) (partial as Record<string, unknown>)[field] = s
      }
    }

    if (!cellStr(partial.product_name)) continue

    rows.push({
      row_number: partial.row_number ?? i + 1,
      product_name: cellStr(partial.product_name),
      brand_name: partial.brand_name,
      spec: partial.spec,
      category: partial.category,
      sub_category: partial.sub_category,
      supply_price: partial.supply_price ?? 0,
      commerce_price: partial.commerce_price ?? 0,
      base_shipping_fee: partial.base_shipping_fee ?? 0,
      original_price: partial.original_price,
      free_shipping_qty: partial.free_shipping_qty,
      bulk_qty: partial.bulk_qty,
      bulk_discount_rate: partial.bulk_discount_rate,
      box_qty: partial.box_qty,
      storage_method: partial.storage_method,
      ingredients: partial.ingredients,
      manufacturer: partial.manufacturer,
      usage_desc: partial.usage_desc,
      barcode: partial.barcode,
      item_report_number: partial.item_report_number,
      thumbnail_url: partial.thumbnail_url,
    })
  }

  return { sheetName, rows }
}
