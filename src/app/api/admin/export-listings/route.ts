import { NextResponse } from 'next/server'
import { getAdminCategories, getListingsForExport } from '@/actions/admin/commerce'
import { extractRawProductNameFromDisplay } from '@/lib/commerce-utils'
import {
  buildBulkListingTemplateWorkbook,
  writeBulkListingTemplateBuffer,
  type BulkListingTemplateDataRow,
} from '@/lib/bulk-listing-template-xlsx'

function cellVal(v: unknown): string | number {
  if (v == null || v === '') return ''
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return String(v)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const ids = url.searchParams.get('ids')?.split(',').filter(Boolean) ?? []

  const [listRes, catRes] = await Promise.all([
    getListingsForExport(ids.length > 0 ? ids : undefined),
    getAdminCategories(),
  ])

  if (!listRes.success || !listRes.data) {
    return NextResponse.json(
      { error: listRes.error },
      {
        status:
          listRes.error === '권한 없음' || listRes.error === '로그인 필요' ? 401 : 500,
      },
    )
  }

  if (!catRes.success || !catRes.data) {
    return NextResponse.json({ error: catRes.error ?? '카테고리 조회 실패' }, { status: 500 })
  }

  const dataRows: BulkListingTemplateDataRow[] = listRes.data.rows.map((r: Record<string, unknown>) => {
    const cat = r.product_categories as
      | { name?: string; parent_id?: string | null; parent?: { name?: string } }
      | null
      | undefined
    const parentCat = cat?.parent?.name ?? cat?.name ?? ''
    const subCat = cat?.parent_id ? cat?.name ?? '' : ''
    const products = r.products as { name?: string | null } | { name?: string | null }[] | null | undefined
    const productRecord = Array.isArray(products) ? products[0] : products
    const displayName = productRecord?.name ?? ''
    const brand = (r.brand_name as string | null) ?? null
    const spec = (r.spec as string | null) ?? null

    return {
      brand_name: cellVal(brand),
      product_name: cellVal(extractRawProductNameFromDisplay(displayName, brand, spec)),
      spec: cellVal(spec),
      category: cellVal(parentCat),
      sub_category: cellVal(subCat),
      supply_price: '',
      commerce_price: cellVal(r.commerce_price),
      base_shipping_fee: cellVal(r.base_shipping_fee),
      original_price: cellVal(r.original_price),
      free_shipping_qty: cellVal(r.free_shipping_qty),
      bulk_qty: cellVal(r.bulk_qty),
      bulk_discount_rate: cellVal(r.bulk_discount_rate),
      box_qty: cellVal(r.box_qty),
      storage_method: cellVal(r.storage_method),
      ingredients: cellVal(r.ingredients),
      manufacturer: cellVal(r.manufacturer),
      usage_desc: cellVal(r.usage_desc),
      barcode: cellVal(r.barcode),
      item_report_number: cellVal(r.item_report_number),
      thumbnail_url: cellVal(r.thumbnail_url),
    }
  })

  const wb = buildBulkListingTemplateWorkbook(dataRows, catRes.data.tree)
  const buf = writeBulkListingTemplateBuffer(wb)

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="siksiki_listings_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
