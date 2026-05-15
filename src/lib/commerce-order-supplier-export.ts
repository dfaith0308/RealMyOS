/** 공급자 전달용 storefront 주문 export — 컬럼·CSV 유틸 (서버/클라이언트 공용, xlsx 없음) */

export const SUPPLIER_EXPORT_HEADERS = [
  '주문번호',
  '주문일시',
  '식당명',
  '받는사람',
  '연락처',
  '배송지',
  '상품명',
  '수량',
  '배송메시지',
  '결제상태',
] as const

export type SupplierExportHeader = (typeof SUPPLIER_EXPORT_HEADERS)[number]

export type SupplierExportRow = {
  [K in SupplierExportHeader]: K extends '수량' ? number : string
}

export function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** UTF-8 BOM — Excel에서 한글 CSV 열 때 깨짐 방지 */
export function supplierExportRowsToCsvString(rows: SupplierExportRow[]): string {
  const headerLine = SUPPLIER_EXPORT_HEADERS.map((h) => escapeCsvCell(h)).join(',')
  const body = rows.map((r) =>
    SUPPLIER_EXPORT_HEADERS.map((h) =>
      h === '수량' ? escapeCsvCell(String(r[h])) : escapeCsvCell(String(r[h] ?? '')),
    ).join(','),
  )
  return `\uFEFF${[headerLine, ...body].join('\r\n')}`
}

export function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function supplierExportFilename(ext: 'csv' | 'xlsx'): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const slug = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `storefront-orders-${slug}.${ext}`
}
