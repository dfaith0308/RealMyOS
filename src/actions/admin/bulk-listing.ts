'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { analyzeProductStrengths } from '@/actions/admin/ai-product-analysis'
import { createListingFull, updateListingFull } from '@/actions/admin/commerce'
import { buildPlatformProductDisplayName } from '@/lib/commerce-utils'
import {
  DEFAULT_BASE_SHIPPING_FEE,
  requiresBaseShippingFee,
  resolveBulkShippingType,
  type ListingShippingType,
} from '@/lib/commerce-constants'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

const PLATFORM_OWNER_TENANT = '00000000-0000-0000-0000-000000000000'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createSupabaseServer>>) {
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false as const, error: '로그인 필요' }
  if (ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

export type BulkListingRow = {
  row_number: number
  brand_name?: string
  product_name: string
  spec?: string
  category?: string
  sub_category?: string
  supply_price: number
  commerce_price: number
  base_shipping_fee: number
  original_price?: number
  free_shipping_qty?: number
  bulk_qty?: number
  bulk_discount_rate?: number
  box_qty?: number
  storage_method?: string
  ingredients?: string
  manufacturer?: string
  usage_desc?: string
  barcode?: string
  item_report_number?: string
  thumbnail_url?: string
}

type CategoryRow = {
  id: string
  name: string
  parent_id: string | null
}

type ListingContext = {
  id: string
  product_id: string
  status: string
  is_visible: boolean
  shipping_type: string
  shipping_group_id: string | null
  admin_memo: string | null
  allergen: string | null
  origin: string | null
  package_unit: string | null
  min_order_qty: number | null
}

function normStr(v: string | null | undefined): string {
  return (v ?? '').trim()
}

function cleanProductName(
  productName: string,
  brandName?: string | null,
  spec?: string | null,
): string {
  let name = productName.trim()

  if (brandName) {
    const brand = brandName.trim()
    if (name.toLowerCase().startsWith(brand.toLowerCase())) {
      name = name.slice(brand.length).trim()
    }
  }

  if (spec) {
    const sp = spec.trim()
    if (name.toLowerCase().endsWith(sp.toLowerCase())) {
      name = name.slice(0, name.length - sp.length).trim()
    }
  }

  return name || productName.trim()
}

async function loadPlatformCategories(supabase: SupabaseClient): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from('product_categories')
    .select('id, name, parent_id')
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .eq('is_active', true)

  if (error) throw new Error(error.message)
  return (data ?? []) as CategoryRow[]
}

async function resolveCategoryId(
  supabase: SupabaseClient,
  categoryName: string,
  subCategoryName?: string,
  categories?: CategoryRow[],
): Promise<string | null> {
  const allCats = categories ?? (await loadPlatformCategories(supabase))
  const rootName = normStr(categoryName)
  if (!rootName) return null

  const root = allCats.find((c) => !c.parent_id && c.name === rootName)
  if (!root) return null

  const subName = normStr(subCategoryName)
  if (!subName) return root.id

  const sub = allCats.find((c) => c.parent_id === root.id && c.name === subName)
  return sub?.id ?? null
}

async function findExistingListing(
  supabase: SupabaseClient,
  barcode?: string,
  itemReportNumber?: string,
  brandName?: string,
  productName?: string,
  spec?: string,
): Promise<string | null> {
  const base = supabase
    .from('commerce_product_listings')
    .select('id')
    .eq('owner_type', 'platform')
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .is('deleted_at', null)

  const bc = barcode?.replace(/\D/g, '')
  if (bc) {
    const { data, error } = await base.eq('barcode', bc).maybeSingle()
    if (error) throw new Error(error.message)
    if (data?.id) return data.id as string
  }

  const irn = normStr(itemReportNumber)
  if (irn) {
    const { data, error } = await base.eq('item_report_number', irn).maybeSingle()
    if (error) throw new Error(error.message)
    if (data?.id) return data.id as string
  }

  const pn = normStr(productName)
  if (!pn) return null

  const displayName = buildPlatformProductDisplayName(normStr(brandName) || null, pn, normStr(spec) || null)
  const b = normStr(brandName)
  const sp = normStr(spec)

  const { data: rows, error } = await supabase
    .from('commerce_product_listings')
    .select('id, brand_name, spec, products ( name )')
    .eq('owner_type', 'platform')
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .is('deleted_at', null)

  if (error) throw new Error(error.message)

  for (const row of rows ?? []) {
    const r = row as {
      id: string
      brand_name: string | null
      spec: string | null
      products: { name: string } | { name: string }[] | null
    }
    if (normStr(r.brand_name) !== b) continue
    if (normStr(r.spec) !== sp) continue
    const prod = Array.isArray(r.products) ? r.products[0] : r.products
    if (prod?.name === displayName) return r.id
  }

  return null
}

async function getListingContext(
  supabase: SupabaseClient,
  listingId: string,
): Promise<ListingContext | null> {
  const { data, error } = await supabase
    .from('commerce_product_listings')
    .select(
      'id, product_id, status, is_visible, shipping_type, shipping_group_id, admin_memo, allergen, origin, package_unit, min_order_qty',
    )
    .eq('id', listingId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data?.id || !data.product_id) return null
  return data as ListingContext
}

async function applySupplyPrice(
  supabase: SupabaseClient,
  productId: string,
  supplyPrice: number,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const { data: existing, error: selErr } = await supabase
    .from('product_costs')
    .select('id')
    .eq('product_id', productId)
    .is('end_date', null)
    .maybeSingle()

  if (selErr) throw new Error(selErr.message)

  if (existing?.id) {
    const { error } = await supabase
      .from('product_costs')
      .update({ cost_price: supplyPrice })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
    return
  }

  const { error: insErr } = await supabase.from('product_costs').insert({
    product_id: productId,
    cost_price: supplyPrice,
    start_date: today,
    end_date: null,
  })
  if (insErr) throw new Error(insErr.message)
}

async function resolveAiAnalysis(row: BulkListingRow): Promise<{
  ai_strengths: string | null
  ai_usage: string | null
  ai_summary: string | null
  description: string | null
}> {
  const ingredients = normStr(row.ingredients)
  if (!ingredients) {
    return { ai_strengths: null, ai_usage: null, ai_summary: null, description: null }
  }

  const analysis = await analyzeProductStrengths({
    productName: row.product_name,
    brandName: row.brand_name,
    spec: row.spec,
    ingredients,
    usageDesc: row.usage_desc,
    manufacturer: row.manufacturer,
  })

  if (!analysis.success) {
    return { ai_strengths: null, ai_usage: null, ai_summary: null, description: null }
  }

  const ai_strengths = analysis.strengths?.trim() || null
  const ai_usage = analysis.usage?.trim() || null
  const ai_summary = analysis.summary?.trim() || null
  return {
    ai_strengths,
    ai_usage,
    ai_summary,
    description: ai_strengths,
  }
}

async function patchListingExtras(
  supabase: SupabaseClient,
  listingId: string,
  patch: {
    brand_name?: string | null
    spec?: string | null
    thumbnail_url?: string | null
    description?: string | null
    ai_strengths?: string | null
    ai_usage?: string | null
    ai_summary?: string | null
  },
): Promise<void> {
  const payload: Record<string, string | null> = {}
  if (patch.brand_name !== undefined) payload.brand_name = patch.brand_name
  if (patch.spec !== undefined) payload.spec = patch.spec
  if (patch.thumbnail_url !== undefined) payload.thumbnail_url = patch.thumbnail_url
  if (patch.description !== undefined) payload.description = patch.description
  if (patch.ai_strengths !== undefined) payload.ai_strengths = patch.ai_strengths
  if (patch.ai_usage !== undefined) payload.ai_usage = patch.ai_usage
  if (patch.ai_summary !== undefined) payload.ai_summary = patch.ai_summary
  if (Object.keys(payload).length === 0) return

  const { error } = await supabase.from('commerce_product_listings').update(payload).eq('id', listingId)
  if (error) throw new Error(error.message)
}

function validateRow(row: BulkListingRow): string | null {
  if (!normStr(row.product_name)) return 'product_name 필수'
  if (!Number.isFinite(row.commerce_price) || row.commerce_price <= 0 || !Number.isInteger(row.commerce_price)) {
    return 'commerce_price는 1원 이상 정수'
  }
  if (!Number.isFinite(row.supply_price) || row.supply_price <= 0 || !Number.isInteger(row.supply_price)) {
    return 'supply_price는 1원 이상 정수'
  }
  // 무료배송은 기본배송비가 의미 없으므로 요구하지 않는다. 값을 넣었다면 형식만 본다.
  if (requiresBaseShippingFee(resolveBulkShippingType())) {
    if (
      !Number.isFinite(row.base_shipping_fee) ||
      row.base_shipping_fee <= 0 ||
      !Number.isInteger(row.base_shipping_fee)
    ) {
      return 'base_shipping_fee는 1원 이상 정수'
    }
  } else if (row.base_shipping_fee) {
    if (!Number.isFinite(row.base_shipping_fee) || row.base_shipping_fee < 0 || !Number.isInteger(row.base_shipping_fee)) {
      return 'base_shipping_fee는 0 이상 정수'
    }
  }
  if (!normStr(row.category)) return 'category(대분류) 필수'
  return null
}

function toOptionalInt(v: number | undefined): number | null {
  if (v == null || !Number.isFinite(v) || !Number.isInteger(v) || v <= 0) return null
  return v
}

function toOptionalRate(v: number | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null
  return v
}

export async function bulkCreateListings(
  rows: BulkListingRow[],
): Promise<
  ActionResult<{
    created: number
    updated: number
    failed: { row: number; reason: string }[]
  }>
> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  let created = 0
  let updated = 0
  const failed: { row: number; reason: string }[] = []

  let categories: CategoryRow[] = []
  try {
    categories = await loadPlatformCategories(supabase)
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '카테고리 조회 실패' }
  }

  for (const row of rows) {
    const rowNo = row.row_number

    const validationError = validateRow(row)
    if (validationError) {
      failed.push({ row: rowNo, reason: validationError })
      continue
    }

    let categoryId: string | null = null
    try {
      categoryId = await resolveCategoryId(supabase, row.category!, row.sub_category, categories)
    } catch (e) {
      failed.push({ row: rowNo, reason: e instanceof Error ? e.message : '카테고리 조회 실패' })
      continue
    }

    if (!categoryId) {
      failed.push({ row: rowNo, reason: '카테고리를 찾을 수 없습니다' })
      continue
    }

    let description: string | null = null
    let ai_strengths: string | null = null
    let ai_usage: string | null = null
    let ai_summary: string | null = null
    try {
      const ai = await resolveAiAnalysis(row)
      description = ai.description
      ai_strengths = ai.ai_strengths
      ai_usage = ai.ai_usage
      ai_summary = ai.ai_summary
    } catch {
      description = null
    }

    const brand_name = normStr(row.brand_name) || null
    const spec = normStr(row.spec) || null
    const product_name = cleanProductName(normStr(row.product_name), brand_name, spec)
    const shippingType = resolveBulkShippingType()
    // 무료배송이라 미입력일 수 있으나 저장 경로가 1원 이상을 요구하므로 기본값으로 채운다
    const baseShippingFee =
      Number.isInteger(row.base_shipping_fee) && row.base_shipping_fee > 0
        ? row.base_shipping_fee
        : DEFAULT_BASE_SHIPPING_FEE

    let existingListingId: string | null = null
    try {
      existingListingId = await findExistingListing(
        supabase,
        row.barcode,
        row.item_report_number,
        brand_name ?? undefined,
        product_name,
        spec ?? undefined,
      )
    } catch (e) {
      failed.push({ row: rowNo, reason: e instanceof Error ? e.message : '기존 상품 조회 실패' })
      continue
    }

    try {
      if (existingListingId) {
        const ctx = await getListingContext(supabase, existingListingId)
        if (!ctx) {
          failed.push({ row: rowNo, reason: '기존 Listing을 찾을 수 없습니다' })
          continue
        }

        const storefront_published = ctx.status === 'visible' && ctx.is_visible
        const st = (ctx.shipping_type as ListingShippingType) || 'free'

        const updateRes = await updateListingFull({
          listing_id: existingListingId,
          product_name,
          brand_name,
          spec,
          category_id: categoryId,
          commerce_price: row.commerce_price,
          original_price: toOptionalInt(row.original_price),
          storefront_published,
          shipping_type: st,
          shipping_group_id: ctx.shipping_group_id,
          badge_labels: null,
          admin_memo: ctx.admin_memo,
          base_shipping_fee: baseShippingFee,
          free_shipping_qty: toOptionalInt(row.free_shipping_qty),
          bulk_qty: toOptionalInt(row.bulk_qty),
          bulk_discount_rate: toOptionalRate(row.bulk_discount_rate),
          box_qty: toOptionalInt(row.box_qty) ?? 1,
          storage_method: row.storage_method?.trim() || null,
          usage_desc: row.usage_desc?.trim() || null,
          ingredients: row.ingredients?.trim() || null,
          manufacturer: row.manufacturer?.trim() || null,
          barcode: row.barcode?.trim() || null,
          item_report_number: row.item_report_number?.trim() || null,
          origin: ctx.origin,
          package_unit: ctx.package_unit,
          min_order_qty: ctx.min_order_qty ?? 1,
          allergen: ctx.allergen,
        })

        if (!updateRes.success) {
          failed.push({ row: rowNo, reason: updateRes.error ?? '업데이트 실패' })
          continue
        }

        await patchListingExtras(supabase, existingListingId, {
          brand_name,
          spec,
          thumbnail_url: row.thumbnail_url?.trim() || null,
          description,
          ai_strengths,
          ai_usage,
          ai_summary,
        })
        await applySupplyPrice(supabase, ctx.product_id, row.supply_price)
        updated += 1
      } else {
        const createRes = await createListingFull({
          brand_name,
          product_name,
          spec,
          thumbnail_url: row.thumbnail_url?.trim() || null,
          image_urls: null,
          badge_labels: null,
          category_id: categoryId,
          commerce_price: row.commerce_price,
          original_price: toOptionalInt(row.original_price),
          shipping_type: shippingType,
          shipping_group_id: null,
          admin_memo: null,
          description,
          ai_strengths,
          ai_usage,
          ai_summary,
          status: 'draft',
          base_shipping_fee: baseShippingFee,
          free_shipping_qty: toOptionalInt(row.free_shipping_qty),
          bulk_qty: toOptionalInt(row.bulk_qty),
          bulk_discount_rate: toOptionalRate(row.bulk_discount_rate),
          box_qty: toOptionalInt(row.box_qty) ?? 1,
          storage_method: row.storage_method?.trim() || null,
          min_order_qty: 1,
          package_unit: null,
          usage_desc: row.usage_desc?.trim() || null,
          allergen: null,
          ingredients: row.ingredients?.trim() || null,
          manufacturer: row.manufacturer?.trim() || null,
          barcode: row.barcode?.trim() || null,
          item_report_number: row.item_report_number?.trim() || null,
        })

        if (!createRes.success || !createRes.data) {
          failed.push({ row: rowNo, reason: createRes.error ?? '등록 실패' })
          continue
        }

        await applySupplyPrice(supabase, createRes.data.product_id, row.supply_price)
        created += 1
      }
    } catch (e) {
      failed.push({ row: rowNo, reason: e instanceof Error ? e.message : '처리 중 오류' })
    }
  }

  revalidatePath('/admin/commerce/products')

  return {
    success: true,
    data: { created, updated, failed },
  }
}
