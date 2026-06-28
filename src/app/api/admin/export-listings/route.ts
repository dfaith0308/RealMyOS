import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getListingsForExport } from '@/actions/admin/commerce'

export async function GET() {
  const res = await getListingsForExport()
  if (!res.success || !res.data) {
    return NextResponse.json({ error: res.error }, { status: res.error === '권한 없음' || res.error === '로그인 필요' ? 401 : 500 })
  }

  const rows = res.data.rows.map((r: any) => {
    const cat = r.product_categories
    const parentCat = cat?.parent?.name ?? cat?.name ?? ''
    const subCat = cat?.parent_id ? cat?.name : ''

    return {
      brand_name: r.brand_name ?? '',
      product_name: r.products?.name ?? '',
      spec: r.spec ?? '',
      category: parentCat,
      sub_category: subCat,
      supply_price: '',
      commerce_price: r.commerce_price ?? '',
      base_shipping_fee: r.base_shipping_fee ?? '',
      original_price: r.original_price ?? '',
      free_shipping_qty: r.free_shipping_qty ?? '',
      bulk_qty: r.bulk_qty ?? '',
      bulk_discount_rate: r.bulk_discount_rate ?? '',
      box_qty: r.box_qty ?? '',
      storage_method: r.storage_method ?? '',
      ingredients: r.ingredients ?? '',
      manufacturer: r.manufacturer ?? '',
      usage_desc: r.usage_desc ?? '',
      barcode: r.barcode ?? '',
      item_report_number: r.item_report_number ?? '',
      thumbnail_url: r.thumbnail_url ?? '',
    }
  })

  const headerKorean = [
    '브랜드명', '상품명', '규격·용량', '대분류', '소분류',
    '공급가', '식식이 판매가', '기본배송비', '시중판매가',
    '무료배송기준수량', '대량구매기준수량', '대량할인율(%)', '박스당수량',
    '보관방법', '원재료명및함량', '제조원', '용도',
    '바코드', '품목보고번호', '썸네일URL',
  ]
  const headerEnglish = [
    'brand_name', 'product_name', 'spec', 'category', 'sub_category',
    'supply_price', 'commerce_price', 'base_shipping_fee', 'original_price',
    'free_shipping_qty', 'bulk_qty', 'bulk_discount_rate', 'box_qty',
    'storage_method', 'ingredients', 'manufacturer', 'usage_desc',
    'barcode', 'item_report_number', 'thumbnail_url',
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    headerKorean,
    headerEnglish,
    ...rows.map((r: Record<string, unknown>) => Object.values(r)),
  ])

  ws['!cols'] = [
    { wch: 15 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
    { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 10 },
    { wch: 18 }, { wch: 40 }, { wch: 18 }, { wch: 25 },
    { wch: 16 }, { wch: 18 }, { wch: 40 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, '상품목록')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="siksiki_listings_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
