import XLSX from 'xlsx-js-style'

export type CategoryTreeNode = {
  name: string
  is_active: boolean
  children: CategoryTreeNode[]
}

export const GREEN = '1f5d3a'
export const LIGHT_GREEN = 'f0f7f3'
export const BLUE = '1d4ed8'
export const LIGHT_BLUE = 'EFF6FF'
export const AMBER = 'F59E0B'
export const WHITE = 'FFFFFF'
export const GRAY = 'F3F4F6'

const DATA_START_ROW = 5 // 1-indexed Excel row

export const BULK_LISTING_ENGLISH_KEYS = [
  'brand_name',
  'product_name',
  'spec',
  'category',
  'sub_category',
  'supply_price',
  'commerce_price',
  'base_shipping_fee',
  '',
  '',
  'original_price',
  '',
  'free_shipping_qty',
  'bulk_qty',
  'bulk_discount_rate',
  'box_qty',
  'storage_method',
  'ingredients',
  'manufacturer',
  'usage_desc',
  'barcode',
  'item_report_number',
  'thumbnail_url',
] as const

export const BULK_LISTING_KOREAN_HEADERS = [
  '브랜드명',
  '상품명',
  '규격·용량',
  '대분류',
  '소분류',
  '공급가',
  '식식이판매가',
  '기본배송비',
  '마진율(PG3.3%) [자동]',
  '마진등급 [자동]',
  '시중판매가',
  '고객할인율 [자동]',
  '무료배송기준수량',
  '대량구매기준수량',
  '대량할인율(%)',
  '박스당수량',
  '보관방법',
  '원재료명및함량',
  '제조원',
  '용도',
  '바코드',
  '품목보고번호',
  '썸네일URL',
] as const

const DESCRIPTION_ROW = [
  '해나음 (예: 브랜드명)',
  '냉면비빔장',
  '2kg',
  '양념·장류',
  '비빔장',
  '8500',
  '8900',
  '3500',
  '자동계산',
  '자동계산',
  '12000',
  '자동계산',
  '10',
  '20',
  '5',
  '12',
  '상온보관',
  '고춧가루(중국산)…',
  '㈜해나음식품',
  '비빔·무침 양념',
  '8809558031038',
  '20100020501027',
  'https://…',
]

/** 필수=초록, 자동=파랑, 선택=노랑 */
const HEADER_KIND: ('required' | 'auto' | 'optional')[] = [
  'optional',
  'required',
  'optional',
  'required',
  'optional',
  'required',
  'required',
  'required',
  'auto',
  'auto',
  'optional',
  'auto',
  'optional',
  'optional',
  'optional',
  'optional',
  'optional',
  'optional',
  'optional',
  'optional',
  'optional',
  'optional',
  'optional',
]

export type BulkListingTemplateDataRow = {
  brand_name: string | number
  product_name: string | number
  spec: string | number
  category: string | number
  sub_category: string | number
  supply_price: string | number
  commerce_price: string | number
  base_shipping_fee: string | number
  original_price: string | number
  free_shipping_qty: string | number
  bulk_qty: string | number
  bulk_discount_rate: string | number
  box_qty: string | number
  storage_method: string | number
  ingredients: string | number
  manufacturer: string | number
  usage_desc: string | number
  barcode: string | number
  item_report_number: string | number
  thumbnail_url: string | number
}

function colLetter(colIndex: number): string {
  let n = colIndex + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function cellStyle(
  kind: 'section' | 'required' | 'auto' | 'optional' | 'english' | 'desc' | 'data',
): XLSX.CellObject['s'] {
  const border = {
    top: { style: 'thin', color: { rgb: 'D1D5DB' } },
    bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
    left: { style: 'thin', color: { rgb: 'D1D5DB' } },
    right: { style: 'thin', color: { rgb: 'D1D5DB' } },
  }
  switch (kind) {
    case 'section':
      return {
        fill: { fgColor: { rgb: GRAY } },
        font: { bold: true, color: { rgb: '111827' }, sz: 11 },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border,
      }
    case 'required':
      return {
        fill: { fgColor: { rgb: GREEN } },
        font: { bold: true, color: { rgb: WHITE }, sz: 10 },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border,
      }
    case 'auto':
      return {
        fill: { fgColor: { rgb: BLUE } },
        font: { bold: true, color: { rgb: WHITE }, sz: 10 },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border,
      }
    case 'optional':
      return {
        fill: { fgColor: { rgb: AMBER } },
        font: { bold: true, color: { rgb: WHITE }, sz: 10 },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border,
      }
    case 'english':
      return {
        fill: { fgColor: { rgb: LIGHT_GREEN } },
        font: { color: { rgb: '374151' }, sz: 10 },
        alignment: { horizontal: 'center', vertical: 'center' },
        border,
      }
    case 'desc':
      return {
        fill: { fgColor: { rgb: LIGHT_BLUE } },
        font: { color: { rgb: '6B7280' }, sz: 9, italic: true },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border,
      }
    default:
      return {
        font: { sz: 10 },
        alignment: { vertical: 'center', wrapText: true },
        border,
      }
  }
}

function setCell(
  ws: XLSX.WorkSheet,
  r: number,
  c: number,
  value: string | number | null | undefined,
  styleKind: Parameters<typeof cellStyle>[0],
) {
  const addr = XLSX.utils.encode_cell({ r, c })
  const v = value ?? ''
  ws[addr] = {
    v,
    t: typeof v === 'number' ? 'n' : 's',
    s: cellStyle(styleKind),
  }
}

function setFormula(ws: XLSX.WorkSheet, r: number, c: number, formula: string) {
  const addr = XLSX.utils.encode_cell({ r, c })
  ws[addr] = {
    f: formula,
    t: 's',
    s: cellStyle('data'),
  }
}

function marginFormula(excelRow: number): string {
  return `IF(AND(F${excelRow}<>"",G${excelRow}<>""),ROUND((G${excelRow}*(1-0.033)-F${excelRow})/(G${excelRow}*(1-0.033))*100,1),"")`
}

function marginGradeFormula(excelRow: number): string {
  return `IF(I${excelRow}="","",IF(I${excelRow}<=10,"🔴 위험",IF(I${excelRow}<=16,"🟡 주의","🟢 정상")))`
}

function customerDiscountFormula(excelRow: number): string {
  return `IF(AND(K${excelRow}<>"",G${excelRow}<>""),ROUND((K${excelRow}-G${excelRow})/K${excelRow}*100,1)&"%","")`
}

function buildMainSheet(dataRows: BulkListingTemplateDataRow[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {}
  const colCount = BULK_LISTING_KOREAN_HEADERS.length
  const lastRow = DATA_START_ROW - 1 + Math.max(dataRows.length, 1)

  const sectionRow = [
    { label: '① 상품 정보', from: 0, to: 4 },
    { label: '② 가격·배송 (필수)', from: 5, to: 7 },
    { label: '③ 마진 (자동)', from: 8, to: 9 },
    { label: '④ 시중가·할인', from: 10, to: 11 },
    { label: '⑤ 선택 입력', from: 12, to: colCount - 1 },
  ]

  for (const sec of sectionRow) {
    setCell(ws, 0, sec.from, sec.label, 'section')
    for (let c = sec.from + 1; c <= sec.to; c++) {
      setCell(ws, 0, c, '', 'section')
    }
  }

  for (let c = 0; c < colCount; c++) {
    setCell(ws, 1, c, BULK_LISTING_KOREAN_HEADERS[c], HEADER_KIND[c]!)
    setCell(ws, 2, c, BULK_LISTING_ENGLISH_KEYS[c] ?? '', 'english')
    setCell(ws, 3, c, DESCRIPTION_ROW[c] ?? '', 'desc')
  }

  dataRows.forEach((row, idx) => {
    const r = DATA_START_ROW - 1 + idx
    const excelRow = r + 1
    const values = [
      row.brand_name,
      row.product_name,
      row.spec,
      row.category,
      row.sub_category,
      row.supply_price,
      row.commerce_price,
      row.base_shipping_fee,
      null,
      null,
      row.original_price,
      null,
      row.free_shipping_qty,
      row.bulk_qty,
      row.bulk_discount_rate,
      row.box_qty,
      row.storage_method,
      row.ingredients,
      row.manufacturer,
      row.usage_desc,
      row.barcode,
      row.item_report_number,
      row.thumbnail_url,
    ]
    values.forEach((val, c) => {
      if (val === null) return
      setCell(ws, r, c, val, 'data')
    })
    setFormula(ws, r, 8, marginFormula(excelRow))
    setFormula(ws, r, 9, marginGradeFormula(excelRow))
    setFormula(ws, r, 11, customerDiscountFormula(excelRow))
  })

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow - 1, c: colCount - 1 } })
  ws['!merges'] = sectionRow.map((sec) => ({
    s: { r: 0, c: sec.from },
    e: { r: 0, c: sec.to },
  }))
  ws['!cols'] = [
    { wch: 14 }, { wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 14 },
    { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
    { wch: 10 }, { wch: 16 }, { wch: 36 }, { wch: 18 }, { wch: 22 },
    { wch: 16 }, { wch: 18 }, { wch: 36 },
  ]
  ws['!rows'] = [{ hpt: 28 }, { hpt: 36 }, { hpt: 22 }, { hpt: 28 }]
  ws['!views'] = [
    {
      state: 'frozen',
      xSplit: 3,
      ySplit: 4,
      topLeftCell: 'D5',
      activePane: 'bottomRight',
    },
  ]

  return ws
}

function buildCategorySheet(tree: CategoryTreeNode[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {}
  setCell(ws, 0, 0, '대분류', 'section')
  setCell(ws, 0, 1, '소분류', 'section')

  let r = 1
  for (const parent of tree) {
    if (!parent.is_active) continue
    if (parent.children.length === 0) {
      setCell(ws, r, 0, parent.name, 'data')
      setCell(ws, r, 1, '', 'data')
      r++
      continue
    }
    for (const child of parent.children) {
      if (!child.is_active) continue
      setCell(ws, r, 0, parent.name, 'data')
      setCell(ws, r, 1, child.name, 'data')
      r++
    }
  }

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r, 1), c: 1 } })
  ws['!cols'] = [{ wch: 20 }, { wch: 20 }]
  return ws
}

function buildGuideSheet(): XLSX.WorkSheet {
  const lines = [
    '식식이 상품 대량등록 템플릿 v3 — 입력 가이드',
    '',
    '1. 「상품등록」 시트 5행부터 데이터를 입력합니다.',
    '2. 3행 영문키(brand_name, product_name 등)는 수정하지 마세요.',
    '3. 4행은 입력 예시입니다. 실제 등록 시 5행부터 덮어써 주세요.',
    '',
    '【필수 입력】',
    '· 상품명, 대분류, 공급가, 식식이판매가, 기본배송비',
    '',
    '【자동 계산】',
    '· 마진율(PG 3.3% 반영), 마진등급, 고객할인율 — 수식으로 자동 계산됩니다.',
    '',
    '【카테고리】',
    '· 「카테고리목록」 시트의 대분류·소분류명을 그대로 입력하세요.',
    '',
    '【업로드】',
    '· 관리자 > 상품 관리 > 대량 등록에서 이 파일을 업로드합니다.',
  ]

  const ws: XLSX.WorkSheet = {}
  lines.forEach((line, i) => {
    setCell(ws, i, 0, line, i === 0 ? 'section' : 'data')
  })
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lines.length, c: 0 } })
  ws['!cols'] = [{ wch: 72 }]
  return ws
}

export function buildBulkListingTemplateWorkbook(
  dataRows: BulkListingTemplateDataRow[],
  categoryTree: CategoryTreeNode[],
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildMainSheet(dataRows), '상품등록')
  XLSX.utils.book_append_sheet(wb, buildCategorySheet(categoryTree), '카테고리목록')
  XLSX.utils.book_append_sheet(wb, buildGuideSheet(), '입력가이드')
  return wb
}

export function writeBulkListingTemplateBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

export { colLetter }
