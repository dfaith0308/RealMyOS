'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin as requireAdminAuth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { buildPlatformProductDisplayName, extractPureProductName } from '@/lib/commerce-utils'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import {
  COMMERCE_ORDER_STATUSES,
  COMMERCE_PAYMENT_METHODS,
  LISTING_SHIPPING_TYPES,
  type CommerceOrderStatus,
  type CommercePaymentMethod,
  type ListingShippingType,
} from '@/lib/commerce-constants'
import type { ActionResult } from '@/types/order'
import type { SupplierExportRow } from '@/lib/commerce-order-supplier-export'
import { cancelPendingCommerceOrderAllocationsForOrder, createCommerceOrderAllocations } from '@/actions/admin/commerce-allocation'
import { upsertIngredientMaster } from '@/actions/admin/ingredient-master'
import { processCommerceOrderCancelledAccountingP0 } from '@/actions/admin/commerce-reversal'

export type { ListingShippingType } from '@/lib/commerce-constants'

const PLATFORM_OWNER_TENANT = '00000000-0000-0000-0000-000000000000'

const LISTING_STATUSES = ['draft', 'visible', 'hidden', 'sold_out', 'discontinued'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

const ALLOWED_STATUS_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  draft: ['visible'],
  visible: ['hidden', 'sold_out', 'discontinued'],
  hidden: ['visible'],
  sold_out: ['visible'],
  discontinued: [],
}

async function requireAdmin(supabase: any) {
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false as const, error: '로그인 필요' }
  if (ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

async function insertAdminLog(
  supabase: any,
  input: {
    admin_id: string
    /** 스키마 `admin_logs.admin_tenant_id` NOT NULL — 플랫폼 관리자는 보통 `PLATFORM_OWNER_TENANT`와 동일 sentinel */
    admin_tenant_id?: string
    tenant_id?: string | null
    action_type: string
    reason?: string | null
    target_table?: string | null
    target_id?: string | null
    old_value?: unknown
    new_value?: unknown
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin_tenant_id = input.admin_tenant_id ?? PLATFORM_OWNER_TENANT
  const { error } = await supabase.from('admin_logs').insert({
    admin_tenant_id,
    admin_id: input.admin_id,
    tenant_id: input.tenant_id ?? null,
    action_type: input.action_type,
    reason: input.reason ?? null,
    target_table: input.target_table ?? null,
    target_id: input.target_id ?? null,
    old_value: input.old_value ?? null,
    new_value: input.new_value ?? null,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Storage/업로드 오류를 운영자용 문구로 통일 */
function mapListingUploadError(raw: string): string {
  const msg = (raw ?? '').trim()
  const low = msg.toLowerCase()
  if (!msg) return '이미지 업로드에 실패했습니다.'
  if (low.includes('row-level security') || low.includes('violates row-level security')) {
    return 'Storage 업로드 권한이 없습니다. commerce-images 버킷 Storage 정책(관리자 INSERT) 적용 여부를 확인해 주세요.'
  }
  if (
    low.includes('not authorized') ||
    low.includes('unauthorized') ||
    low.includes('permission denied') ||
    low.includes('403')
  ) {
    return 'Storage 업로드 권한이 없습니다. 로그인·관리자 권한을 확인해 주세요.'
  }
  if (low.includes('payload too large') || low.includes('entity too large') || low.includes('file size')) {
    return '8MB 이하 이미지만 업로드 가능합니다.'
  }
  if (low.includes('mime') || low.includes('invalid type') || low.includes('not supported')) {
    return 'JPG/PNG/WebP만 업로드 가능합니다.'
  }
  if (low.includes('network') || low.includes('failed to fetch') || low.includes('econnreset')) {
    return '네트워크 오류로 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.'
  }
  return msg
}

export type CommerceListingRow = {
  id: string
  tenant_id: string
  product_id: string | null
  commerce_price: number
  brand_name: string | null
  original_price: number | null
  shipping_type: string
  category_id: string | null
  status: ListingStatus
  is_visible: boolean
  created_at: string
  thumbnail_url: string | null
  image_urls: string[] | null
  badge_labels: string[] | null
  description: string | null
  spec: string | null
  admin_memo: string | null
  products: { name: string | null; category_id: string | null } | null
}

/** 플랫폼 커머스 대분류 (parent_id IS NULL) */
export type PlatformCommerceCategory = {
  id: string
  name: string
  parent_id: string | null
  icon_url: string | null
}

const CATEGORY_NAME_MAX = 24
const CATEGORY_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type AdminCategoryRow = {
  id: string
  name: string
  slug: string | null
  parent_id: string | null
  sort_order: number
  is_active: boolean
  icon_url: string | null
}

export type AdminCategoryNode = AdminCategoryRow & {
  children: AdminCategoryNode[]
}

function validateCategoryName(name: string): string | null {
  const t = name.trim()
  if (!t) return '이름을 입력해 주세요'
  if (t.length > CATEGORY_NAME_MAX) return `이름은 최대 ${CATEGORY_NAME_MAX}자입니다`
  return null
}

function normalizeCategorySlug(slug: string): string {
  return slug.trim().toLowerCase()
}

function validateCategorySlug(slug: string): string | null {
  const t = normalizeCategorySlug(slug)
  if (!t) return 'slug를 입력해 주세요'
  if (!CATEGORY_SLUG_RE.test(t)) {
    return 'slug는 영문 소문자, 숫자, 하이픈(-)만 사용할 수 있습니다'
  }
  return null
}

function buildAdminCategoryTree(rows: AdminCategoryRow[]): AdminCategoryNode[] {
  const byParent = new Map<string | null, AdminCategoryRow[]>()
  for (const r of rows) {
    const k = r.parent_id
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k)!.push(r)
  }
  for (const [, list] of byParent) {
    list.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return a.name.localeCompare(b.name, 'ko')
    })
  }
  function toNode(r: AdminCategoryRow): AdminCategoryNode {
    const children = (byParent.get(r.id) ?? []).map(toNode)
    return { ...r, children }
  }
  return (byParent.get(null) ?? []).map(toNode)
}

export type ProductPickRow = {
  id: string
  name: string | null
  category_id: string | null
  tenant_id: string
  /** 플랫폼 Listing 판매가(products.selling_price 없음 — commerce_price만 사용) */
  listing_commerce_price: number | null
  /** 플랫폼(owner_type=platform) listing 이 있으면 true — 검색 결과에는 포함되나 신규 등록 불가 */
  already_listed: boolean
}

export async function getListings(filters?: {
  status?: string
}): Promise<ActionResult<{ listings: CommerceListingRow[] }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  let q = supabase
    .from('commerce_product_listings')
    .select(
      `
      id,
      tenant_id,
      product_id,
      commerce_price,
      brand_name,
      original_price,
      shipping_type,
      category_id,
      status,
      is_visible,
      created_at,
      thumbnail_url,
      image_urls,
      badge_labels,
      description,
      spec,
      admin_memo,
      products ( name, category_id )
    `,
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const st = filters?.status
  if (st && st !== 'all' && (LISTING_STATUSES as readonly string[]).includes(st)) {
    q = q.eq('status', st)
  }

  const { data, error } = await q

  if (error) return { success: false, error: error.message }

  const listings = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    brand_name: (row.brand_name as string | null) ?? null,
    original_price:
      typeof row.original_price === 'number' && Number.isFinite(row.original_price)
        ? Math.round(row.original_price)
        : null,
    shipping_type: (row.shipping_type as string) || 'free',
    category_id: (row.category_id as string | null) ?? null,
    thumbnail_url: row.thumbnail_url ?? null,
    image_urls: row.image_urls ?? null,
    badge_labels: (row.badge_labels as string[] | null) ?? null,
    description: row.description ?? null,
    spec: (row.spec as string | null) ?? null,
    admin_memo: (row.admin_memo as string | null) ?? null,
    products: Array.isArray(row.products) ? row.products[0] ?? null : row.products ?? null,
  })) as CommerceListingRow[]

  return { success: true, data: { listings } }
}

export async function getListingsForExport(ids?: string[]): Promise<ActionResult<{ rows: any[] }>> {
  try {
    await requireAdminAuth()
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '권한 없음' }
  }
  const supabase = await createSupabaseAdmin()

  let query = supabase
    .from('commerce_product_listings')
    .select(`
      id, brand_name, spec, commerce_price, original_price,
      base_shipping_fee, free_shipping_qty, bulk_qty, bulk_discount_rate,
      box_qty, storage_method, ingredients, manufacturer, usage_desc,
      barcode, item_report_number, thumbnail_url, category_id,
      ai_strengths, ai_usage, ai_summary,
      products(name, category_id),
      product_categories:category_id(name, parent_id,
        parent:parent_id(name))
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const filteredIds = (ids ?? []).map((x) => String(x ?? '').trim()).filter(Boolean)
  if (filteredIds.length > 0) {
    query = query.in('id', filteredIds)
  }

  const { data, error } = await query

  if (error) return { success: false, error: error.message }
  return { success: true, data: { rows: data ?? [] } }
}

export async function getCategories(): Promise<ActionResult<{ categories: PlatformCommerceCategory[] }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('product_categories')
    .select('id, name, parent_id, icon_url')
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .is('parent_id', null)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return { success: false, error: error.message }
  const categories = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: (r.name as string) ?? '',
    parent_id: (r.parent_id as string | null) ?? null,
    icon_url: (r.icon_url as string | null) ?? null,
  })) as PlatformCommerceCategory[]
  return {
    success: true,
    data: { categories },
  }
}

export async function getSubCategories(
  parentId: string,
): Promise<ActionResult<{ categories: PlatformCommerceCategory[] }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const pid = String(parentId ?? '').trim()
  if (!pid) return { success: false, error: '대분류를 선택해 주세요' }

  const { data: parent, error: pErr } = await supabase
    .from('product_categories')
    .select('id')
    .eq('id', pid)
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .is('parent_id', null)
    .eq('is_active', true)
    .maybeSingle()

  if (pErr) return { success: false, error: pErr.message }
  if (!parent) return { success: false, error: '유효한 대분류가 아닙니다' }

  const { data, error } = await supabase
    .from('product_categories')
    .select('id, name, parent_id, icon_url')
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .eq('parent_id', pid)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return { success: false, error: error.message }
  const categories = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: (r.name as string) ?? '',
    parent_id: (r.parent_id as string | null) ?? null,
    icon_url: (r.icon_url as string | null) ?? null,
  })) as PlatformCommerceCategory[]
  return { success: true, data: { categories } }
}

/**
 * 관리자 카테고리 화면용 전체 트리 (플랫폼 테넌트).
 * 비활성 항목도 노출해야 하므로 `is_active`로 필터하지 않습니다.
 * (상품 등록용 `getCategories()`는 활성 대분류만 조회합니다.)
 */
export async function getAdminCategories(): Promise<ActionResult<{ tree: AdminCategoryNode[] }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('product_categories')
    .select('id, name, slug, parent_id, sort_order, is_active, icon_url')
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return { success: false, error: error.message }

  const rows: AdminCategoryRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: (r.name as string) ?? '',
    slug: (r.slug as string | null) ?? null,
    parent_id: (r.parent_id as string | null) ?? null,
    sort_order: typeof r.sort_order === 'number' && Number.isFinite(r.sort_order) ? Math.round(r.sort_order) : 0,
    is_active: r.is_active !== false,
    icon_url: (r.icon_url as string | null) ?? null,
  }))

  return { success: true, data: { tree: buildAdminCategoryTree(rows) } }
}

export async function createCategory(input: {
  name: string
  slug: string
  parent_id: string | null
  sort_order?: number
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const nameErr = validateCategoryName(input.name)
  if (nameErr) return { success: false, error: nameErr }

  const slugErr = validateCategorySlug(input.slug)
  if (slugErr) return { success: false, error: slugErr }

  const name = input.name.trim()
  const slug = normalizeCategorySlug(input.slug)

  const rawParent = input.parent_id != null ? String(input.parent_id).trim() : ''
  const parent_id = rawParent || null

  if (parent_id) {
    const { data: parentRow, error: pErr } = await supabase
      .from('product_categories')
      .select('id, parent_id')
      .eq('id', parent_id)
      .eq('tenant_id', PLATFORM_OWNER_TENANT)
      .maybeSingle()

    if (pErr) return { success: false, error: pErr.message }
    if (!parentRow) return { success: false, error: '상위 카테고리를 찾을 수 없습니다' }
    if (parentRow.parent_id != null) {
      return { success: false, error: '2단계까지만 카테고리를 만들 수 있습니다' }
    }
  }

  const sort_order =
    input.sort_order != null && Number.isFinite(input.sort_order) && Number.isInteger(input.sort_order)
      ? input.sort_order
      : 0

  const { data: inserted, error: insErr } = await supabase
    .from('product_categories')
    .insert({
      tenant_id: PLATFORM_OWNER_TENANT,
      name,
      slug,
      parent_id,
      sort_order,
      is_active: true,
    })
    .select('id')
    .single()

  if (insErr) return { success: false, error: insErr.message }
  const id = inserted.id as string

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: PLATFORM_OWNER_TENANT,
    action_type: 'category_created',
    target_table: 'product_categories',
    target_id: id,
    new_value: { name, slug, parent_id },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/categories')
  return { success: true, data: { id } }
}

export async function updateCategory(
  id: string,
  input: {
    name?: string
    slug?: string
    sort_order?: number
  },
): Promise<ActionResult<void>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const cid = String(id ?? '').trim()
  if (!cid) return { success: false, error: '카테고리 ID가 필요합니다' }

  const { data: row, error: fErr } = await supabase
    .from('product_categories')
    .select('id, name, slug, sort_order')
    .eq('id', cid)
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .maybeSingle()

  if (fErr) return { success: false, error: fErr.message }
  if (!row) return { success: false, error: '카테고리를 찾을 수 없습니다' }

  const before_name = String(row.name ?? '')
  const before_slug = row.slug != null ? String(row.slug) : null
  const before_sort =
    typeof row.sort_order === 'number' && Number.isFinite(row.sort_order) ? Math.round(row.sort_order) : 0

  const patch: Record<string, unknown> = {}
  let after_name = before_name
  let after_slug = before_slug
  let after_sort = before_sort

  if (input.name !== undefined) {
    const ne = validateCategoryName(input.name)
    if (ne) return { success: false, error: ne }
    after_name = input.name.trim()
    patch.name = after_name
  }
  if (input.slug !== undefined) {
    const se = validateCategorySlug(input.slug)
    if (se) return { success: false, error: se }
    after_slug = normalizeCategorySlug(input.slug)
    patch.slug = after_slug
  }
  if (input.sort_order !== undefined) {
    const so = input.sort_order
    if (!Number.isFinite(so) || !Number.isInteger(so)) {
      return { success: false, error: '정렬 순서는 정수여야 합니다' }
    }
    after_sort = so
    patch.sort_order = after_sort
  }

  if (Object.keys(patch).length === 0) {
    return { success: false, error: '변경할 내용이 없습니다' }
  }

  const { error: uErr } = await supabase.from('product_categories').update(patch).eq('id', cid)

  if (uErr) return { success: false, error: uErr.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: PLATFORM_OWNER_TENANT,
    action_type: 'category_updated',
    target_table: 'product_categories',
    target_id: cid,
    old_value: { before_name, before_slug, before_sort_order: before_sort },
    new_value: {
      before_name,
      after_name,
      before_slug,
      after_slug,
      before_sort_order: before_sort,
      after_sort_order: after_sort,
    },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/categories')
  return { success: true }
}

export async function toggleCategoryActive(id: string): Promise<ActionResult<{ is_active: boolean }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const cid = String(id ?? '').trim()
  if (!cid) return { success: false, error: '카테고리 ID가 필요합니다' }

  const { data: row, error: fErr } = await supabase
    .from('product_categories')
    .select('id, is_active, name')
    .eq('id', cid)
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .maybeSingle()

  if (fErr) return { success: false, error: fErr.message }
  if (!row) return { success: false, error: '카테고리를 찾을 수 없습니다' }

  const before = row.is_active !== false
  const after = !before

  const { error: uErr } = await supabase
    .from('product_categories')
    .update({ is_active: after })
    .eq('id', cid)

  if (uErr) return { success: false, error: uErr.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: PLATFORM_OWNER_TENANT,
    action_type: 'category_active_toggled',
    target_table: 'product_categories',
    target_id: cid,
    old_value: { is_active: before, name: row.name },
    new_value: { is_active: after, name: row.name },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/categories')
  return { success: true, data: { is_active: after } }
}

export async function deleteCategory(id: string): Promise<ActionResult<void>> {
  // 향후 soft delete 구조 전환 예정
  // 카테고리 이동 기능 추후 추가 예정
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const cid = String(id ?? '').trim()
  if (!cid) return { success: false, error: '카테고리 ID가 필요합니다' }

  const { data: row, error: fErr } = await supabase
    .from('product_categories')
    .select('id, name, slug')
    .eq('id', cid)
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .maybeSingle()

  if (fErr) return { success: false, error: fErr.message }
  if (!row) return { success: false, error: '카테고리를 찾을 수 없습니다' }

  const { count: childCount, error: cErr } = await supabase
    .from('product_categories')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', cid)
    .eq('tenant_id', PLATFORM_OWNER_TENANT)

  if (cErr) return { success: false, error: cErr.message }
  if ((childCount ?? 0) > 0) {
    return { success: false, error: '소분류가 있는 카테고리는 삭제할 수 없습니다' }
  }

  const { count: listingCount, error: lErr } = await supabase
    .from('commerce_product_listings')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', cid)
    .is('deleted_at', null)

  if (lErr) return { success: false, error: lErr.message }
  if ((listingCount ?? 0) > 0) {
    return { success: false, error: '이 카테고리의 상품을 먼저 이동해주세요' }
  }

  const { error: dErr } = await supabase.from('product_categories').delete().eq('id', cid)

  if (dErr) return { success: false, error: dErr.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: PLATFORM_OWNER_TENANT,
    action_type: 'category_deleted',
    target_table: 'product_categories',
    target_id: cid,
    old_value: { name: row.name, slug: row.slug },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/categories')
  return { success: true }
}

export async function updateListingStatus(
  id: string,
  status: string,
): Promise<ActionResult<void>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  if (!(LISTING_STATUSES as readonly string[]).includes(status)) {
    return { success: false, error: '유효하지 않은 상태입니다' }
  }
  const nextStatus = status as ListingStatus

  const { data: row, error: fetchErr } = await supabase
    .from('commerce_product_listings')
    .select('id, status, tenant_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (fetchErr) return { success: false, error: fetchErr.message }
  if (!row) return { success: false, error: 'Listing 을 찾을 수 없습니다' }

  const beforeStatus = row.status as ListingStatus
  const allowed = ALLOWED_STATUS_TRANSITIONS[beforeStatus] ?? []
  if (!allowed.includes(nextStatus)) {
    return { success: false, error: '허용되지 않는 상태 전이입니다' }
  }

  const is_visible = nextStatus === 'visible'

  const { error: upErr } = await supabase
    .from('commerce_product_listings')
    .update({
      status: nextStatus,
      is_visible,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .is('deleted_at', null)

  if (upErr) return { success: false, error: upErr.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: row.tenant_id,
    action_type: 'listing_status_changed',
    target_table: 'commerce_product_listings',
    target_id: id,
    new_value: { listing_id: id, before_status: beforeStatus, after_status: nextStatus },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/products')
  return { success: true }
}

export async function updateListingPrice(id: string, price: number): Promise<ActionResult<void>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  if (!Number.isFinite(price) || !Number.isInteger(price) || price <= 0) {
    return { success: false, error: '가격은 1원 이상의 정수여야 합니다' }
  }

  const { data: row, error: fetchErr } = await supabase
    .from('commerce_product_listings')
    .select('id, commerce_price, tenant_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (fetchErr) return { success: false, error: fetchErr.message }
  if (!row) return { success: false, error: 'Listing 을 찾을 수 없습니다' }

  const before_price = row.commerce_price as number

  const { error: upErr } = await supabase
    .from('commerce_product_listings')
    .update({
      commerce_price: price,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .is('deleted_at', null)

  if (upErr) return { success: false, error: upErr.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: row.tenant_id,
    action_type: 'listing_price_changed',
    target_table: 'commerce_product_listings',
    target_id: id,
    new_value: { listing_id: id, before_price, after_price: price },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/products')
  return { success: true }
}

/** 편집 화면 초기값 — 상품명은 `products.name` (목록·스토어와 동일 소스) */
export type ListingForEditData = {
  id: string
  product_id: string
  product_name: string
  category_id: string | null
  commerce_price: number
  original_price: number | null
  status: ListingStatus
  is_visible: boolean
  shipping_group_id: string | null
  shipping_type: string
  badge_labels: string[] | null
  admin_memo: string | null
  thumbnail_url: string | null
  image_urls: string[] | null
  base_shipping_fee: number | null
  free_shipping_qty: number | null
  bulk_qty: number | null
  bulk_discount_rate: number | null
  box_qty?: number | null
  origin?: string | null
  storage_method?: string | null
  min_order_qty?: number | null
  package_unit?: string | null
  usage_desc?: string | null
  allergen?: string | null
  ingredients?: string | null
  manufacturer?: string | null
  barcode?: string | null
  item_report_number?: string | null
  brand_name?: string | null
  spec?: string | null
  description?: string | null
  ai_strengths?: string | null
  ai_usage?: string | null
  ai_summary?: string | null
  sub_category_id?: string | null
}

export type UpdateListingFullInput = {
  listing_id: string
  product_name: string
  category_id: string
  commerce_price: number
  original_price: number | null
  /** 스토어 노출 = `status === 'visible'` & `is_visible` (getListings / COMMERCE-FLOW 정합) */
  storefront_published: boolean
  shipping_type: ListingShippingType
  shipping_group_id: string | null
  badge_labels: string[] | null
  admin_memo: string | null
  base_shipping_fee: number
  free_shipping_qty: number | null
  bulk_qty: number | null
  bulk_discount_rate: number | null
  box_qty?: number | null
  origin?: string | null
  storage_method?: string | null
  min_order_qty?: number | null
  package_unit?: string | null
  usage_desc?: string | null
  allergen?: string | null
  ingredients?: string | null
  manufacturer?: string | null
  barcode?: string | null
  item_report_number?: string | null
  brand_name?: string | null
  spec?: string | null
  thumbnail_url?: string | null
  image_urls?: string[] | null
  description?: string | null
  ai_strengths?: string | null
  ai_usage?: string | null
  ai_summary?: string | null
}

function listingStorefrontPublished(status: ListingStatus, is_visible: boolean): boolean {
  return status === 'visible' && is_visible
}

/**
 * 스토어 공개 토글을 `updateListingStatus`와 동일한 전이 규칙으로 `status`/`is_visible`에 반영한다.
 * `visible`이지만 `is_visible`만 false인 비정상 행은 공개로 두면 `is_visible`만 true로 보정한다.
 */
function resolveStorefrontVisibility(
  currentStatus: ListingStatus,
  currentIsVisible: boolean,
  desiredPublished: boolean,
): { ok: false; error: string } | { ok: true; nextStatus: ListingStatus; nextIsVisible: boolean } {
  if (currentStatus === 'discontinued') {
    if (desiredPublished) {
      return { ok: false, error: '판매중단 상품은 스토어에 공개할 수 없습니다' }
    }
    return { ok: true, nextStatus: 'discontinued', nextIsVisible: false }
  }

  const currentlyPublished = listingStorefrontPublished(currentStatus, currentIsVisible)

  if (desiredPublished === currentlyPublished) {
    return { ok: true, nextStatus: currentStatus, nextIsVisible: currentIsVisible }
  }

  if (desiredPublished) {
    if (currentStatus === 'visible' && !currentIsVisible) {
      return { ok: true, nextStatus: 'visible', nextIsVisible: true }
    }
    const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? []
    if (!allowed.includes('visible')) {
      return { ok: false, error: '현재 상태에서는 스토어 공개로 전환할 수 없습니다' }
    }
    return { ok: true, nextStatus: 'visible', nextIsVisible: true }
  }

  if (currentStatus === 'visible' && currentIsVisible) {
    const allowed = ALLOWED_STATUS_TRANSITIONS.visible ?? []
    if (!allowed.includes('hidden')) {
      return { ok: false, error: '현재 상태에서는 스토어 비공개(숨김)로 전환할 수 없습니다' }
    }
    return { ok: true, nextStatus: 'hidden', nextIsVisible: false }
  }

  return { ok: true, nextStatus: currentStatus, nextIsVisible: currentIsVisible }
}

export async function getListingForEdit(listingId: string): Promise<ActionResult<ListingForEditData>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const lid = String(listingId ?? '').trim()
  if (!lid) return { success: false, error: 'Listing ID가 필요합니다' }

  const { data, error } = await supabase
    .from('commerce_product_listings')
    .select(
      `
      id,
      tenant_id,
      product_id,
      commerce_price,
      original_price,
      shipping_type,
      category_id,
      status,
      is_visible,
      shipping_group_id,
      badge_labels,
      admin_memo,
      thumbnail_url,
      image_urls,
      base_shipping_fee,
      free_shipping_qty,
      bulk_qty,
      bulk_discount_rate,
      box_qty,
      origin,
      storage_method,
      min_order_qty,
      package_unit,
      usage_desc,
      allergen,
      ingredients,
      manufacturer,
      barcode,
      item_report_number,
      brand_name,
      spec,
      description,
      ai_strengths,
      ai_usage,
      ai_summary,
      products ( id, name )
    `,
    )
    .eq('id', lid)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: 'Listing 을 찾을 수 없습니다' }

  const row = data as Record<string, unknown>
  if ((row.tenant_id as string) !== PLATFORM_OWNER_TENANT) {
    return { success: false, error: 'Listing 을 찾을 수 없습니다' }
  }

  const product_id = row.product_id as string | null
  if (!product_id) return { success: false, error: '연결된 상품이 없습니다' }

  const prod = Array.isArray(row.products) ? row.products[0] : row.products
  const p = (prod ?? null) as { id?: string; name?: string | null } | null

  const status = row.status as ListingStatus
  if (!(LISTING_STATUSES as readonly string[]).includes(status)) {
    return { success: false, error: 'Listing 상태값이 올바르지 않습니다' }
  }

  const category_id = (row.category_id as string | null) ?? null
  let sub_category_id: string | null = null
  if (category_id) {
    const { data: catRow, error: catErr } = await supabase
      .from('product_categories')
      .select('id, parent_id')
      .eq('id', category_id)
      .eq('tenant_id', PLATFORM_OWNER_TENANT)
      .maybeSingle()
    if (catErr) return { success: false, error: catErr.message }
    if (catRow?.parent_id) {
      sub_category_id = catRow.id as string
    }
  }

  return {
    success: true,
    data: {
      id: row.id as string,
      product_id,
      product_name: extractPureProductName(
        String(p?.name ?? '').trim(),
        (row.brand_name as string | null) ?? null,
        (row.spec as string | null) ?? null,
      ),
      category_id,
      sub_category_id,
      commerce_price:
        typeof row.commerce_price === 'number' && Number.isFinite(row.commerce_price)
          ? Math.round(row.commerce_price)
          : 0,
      original_price:
        typeof row.original_price === 'number' && Number.isFinite(row.original_price)
          ? Math.round(row.original_price)
          : null,
      status,
      is_visible: row.is_visible === true,
      shipping_group_id: (row.shipping_group_id as string | null) ?? null,
      shipping_type: (row.shipping_type as string) || 'free',
      badge_labels: (row.badge_labels as string[] | null) ?? null,
      admin_memo: (row.admin_memo as string | null) ?? null,
      thumbnail_url: (row.thumbnail_url as string | null) ?? null,
      image_urls: (row.image_urls as string[] | null) ?? null,
      base_shipping_fee:
        typeof row.base_shipping_fee === 'number' && Number.isFinite(row.base_shipping_fee)
          ? Math.round(row.base_shipping_fee)
          : null,
      free_shipping_qty:
        typeof row.free_shipping_qty === 'number' && Number.isFinite(row.free_shipping_qty)
          ? Math.round(row.free_shipping_qty)
          : null,
      bulk_qty:
        typeof row.bulk_qty === 'number' && Number.isFinite(row.bulk_qty)
          ? Math.round(row.bulk_qty)
          : null,
      bulk_discount_rate:
        typeof row.bulk_discount_rate === 'number' && Number.isFinite(row.bulk_discount_rate)
          ? row.bulk_discount_rate
          : null,
      box_qty:
        typeof row.box_qty === 'number' && Number.isFinite(row.box_qty)
          ? Math.round(row.box_qty)
          : null,
      origin: (row.origin as string | null) ?? null,
      storage_method: (row.storage_method as string | null) ?? null,
      min_order_qty:
        typeof row.min_order_qty === 'number' && Number.isFinite(row.min_order_qty)
          ? Math.round(row.min_order_qty)
          : null,
      package_unit: (row.package_unit as string | null) ?? null,
      usage_desc: (row.usage_desc as string | null) ?? null,
      allergen: (row.allergen as string | null) ?? null,
      ingredients: (row.ingredients as string | null) ?? null,
      manufacturer: (row.manufacturer as string | null) ?? null,
      barcode: (row.barcode as string | null) ?? null,
      item_report_number: (row.item_report_number as string | null) ?? null,
      brand_name: (row.brand_name as string | null) ?? null,
      spec: (row.spec as string | null) ?? null,
      description: (row.description as string | null) ?? null,
      ai_strengths: (row.ai_strengths as string | null) ?? null,
      ai_usage: (row.ai_usage as string | null) ?? null,
      ai_summary: (row.ai_summary as string | null) ?? null,
    },
  }
}

export async function updateListingFull(
  input: UpdateListingFullInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const listing_id = String(input.listing_id ?? '').trim()
  if (!listing_id) return { success: false, error: 'Listing ID가 필요합니다' }

  const product_name = String(input.product_name ?? '').trim()
  if (!product_name) return { success: false, error: '상품명을 입력해 주세요' }

  const category_id = String(input.category_id ?? '').trim()
  if (!category_id) return { success: false, error: '카테고리를 선택해 주세요' }

  const price = input.commerce_price
  if (!Number.isFinite(price) || !Number.isInteger(price) || price <= 0) {
    return { success: false, error: '식식이 판매가는 1원 이상의 정수여야 합니다' }
  }

  const { data: catRow, error: cErr } = await supabase
    .from('product_categories')
    .select('id')
    .eq('id', category_id)
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .eq('is_active', true)
    .maybeSingle()

  if (cErr) return { success: false, error: cErr.message }
  if (!catRow) return { success: false, error: '유효한 카테고리가 아닙니다' }

  const st = input.shipping_type
  if (!(LISTING_SHIPPING_TYPES as readonly string[]).includes(st)) {
    return { success: false, error: '유효하지 않은 배송 유형입니다' }
  }

  let shipping_group_id: string | null = null
  const sgRaw = input.shipping_group_id
  if (sgRaw != null && String(sgRaw).trim()) {
    const sgId = String(sgRaw).trim()
    const { data: sgRow, error: sgErr } = await supabase
      .from('shipping_groups')
      .select('id')
      .eq('id', sgId)
      .eq('tenant_id', PLATFORM_OWNER_TENANT)
      .eq('is_active', true)
      .maybeSingle()
    if (sgErr) return { success: false, error: sgErr.message }
    if (!sgRow) return { success: false, error: '유효한 묶음배송 그룹이 아닙니다' }
    shipping_group_id = sgId
  }

  const admin_memo = String(input.admin_memo ?? '').trim() || null

  const rawBadges = input.badge_labels
  const badge_labels =
    Array.isArray(rawBadges) && rawBadges.length > 0
      ? rawBadges.map((b) => String(b ?? '').trim()).filter(Boolean).slice(0, 2)
      : []
  const badge_labels_db = badge_labels.length > 0 ? badge_labels : null

  let original_price: number | null = null
  const opIn = input.original_price
  if (opIn != null && Number.isFinite(opIn) && Number.isInteger(opIn) && opIn > 0) {
    if (opIn > price) original_price = opIn
  }

  const base_shipping_fee = input.base_shipping_fee
  if (!Number.isFinite(base_shipping_fee) || !Number.isInteger(base_shipping_fee) || base_shipping_fee <= 0) {
    return { success: false, error: '기본 배송비는 1원 이상의 정수여야 합니다' }
  }

  const free_shipping_qty = (() => {
    const v = input.free_shipping_qty
    if (v == null) return null
    if (!Number.isFinite(v) || !Number.isInteger(v) || v <= 0) return null
    return v
  })()

  const bulk_qty = (() => {
    const v = input.bulk_qty
    if (v == null) return null
    if (!Number.isFinite(v) || !Number.isInteger(v) || v <= 0) return null
    return v
  })()

  const bulk_discount_rate = (() => {
    const v = input.bulk_discount_rate
    if (v == null) return null
    if (!Number.isFinite(v) || v <= 0) return null
    return v
  })()

  const origin = String(input.origin ?? '').trim() || null
  const storage_method = String(input.storage_method ?? '').trim() || null
  const min_order_qty = (() => {
    const v = input.min_order_qty
    if (v == null || !Number.isFinite(v) || !Number.isInteger(v) || v <= 0) return 1
    return v
  })()
  const package_unit = String(input.package_unit ?? '').trim() || null
  const usage_desc = String(input.usage_desc ?? '').trim() || null
  const allergen = String(input.allergen ?? '').trim() || null
  const ingredients = String(input.ingredients ?? '').trim() || null
  const manufacturer = input.manufacturer || null
  const barcode = String(input.barcode ?? '').replace(/\D/g, '') || null
  const item_report_number = String(input.item_report_number ?? '').trim() || null
  const box_qty = (() => {
    const v = input.box_qty
    if (v == null || !Number.isFinite(v) || !Number.isInteger(v) || v <= 0) return 1
    return v
  })()

  const brand_name = String(input.brand_name ?? '').trim() || null
  const spec = String(input.spec ?? '').trim() || null
  const thumbnail_url = String(input.thumbnail_url ?? '').trim() || null
  const description = String(input.description ?? '').trim() || null
  const ai_strengths = String(input.ai_strengths ?? '').trim() || null
  const ai_usage = String(input.ai_usage ?? '').trim() || null
  const ai_summary = String(input.ai_summary ?? '').trim() || null
  const rawUrls = input.image_urls
  const image_urls =
    Array.isArray(rawUrls) && rawUrls.length > 0
      ? rawUrls.map((u) => String(u ?? '').trim()).filter(Boolean).slice(0, 20)
      : []
  const image_urls_db = image_urls.length > 0 ? image_urls : null
  const dbProductName = buildPlatformProductDisplayName(brand_name, product_name, spec)

  const { data: listingRow, error: lFetchErr } = await supabase
    .from('commerce_product_listings')
    .select(
      `
      id,
      tenant_id,
      product_id,
      commerce_price,
      original_price,
      shipping_type,
      category_id,
      status,
      is_visible,
      shipping_group_id,
      badge_labels,
      admin_memo,
      base_shipping_fee,
      free_shipping_qty,
      bulk_qty,
      bulk_discount_rate,
      box_qty,
      origin,
      storage_method,
      min_order_qty,
      package_unit,
      usage_desc,
      allergen,
      ingredients,
      manufacturer,
      barcode,
      item_report_number,
      brand_name,
      spec,
      thumbnail_url,
      image_urls,
      description,
      ai_strengths,
      ai_usage,
      ai_summary,
      products ( id, name )
    `,
    )
    .eq('id', listing_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (lFetchErr) return { success: false, error: lFetchErr.message }
  if (!listingRow) return { success: false, error: 'Listing 을 찾을 수 없습니다' }

  const L = listingRow as Record<string, unknown>
  if ((L.tenant_id as string) !== PLATFORM_OWNER_TENANT) {
    return { success: false, error: 'Listing 을 찾을 수 없습니다' }
  }

  const product_id = L.product_id as string | null
  if (!product_id) return { success: false, error: '연결된 상품이 없습니다' }

  const currentStatus = L.status as ListingStatus
  if (!(LISTING_STATUSES as readonly string[]).includes(currentStatus)) {
    return { success: false, error: 'Listing 상태값이 올바르지 않습니다' }
  }
  const currentIsVisible = L.is_visible === true

  const vis = resolveStorefrontVisibility(currentStatus, currentIsVisible, input.storefront_published)
  if (!vis.ok) return { success: false, error: vis.error }

  const { data: productGuard, error: pgErr } = await supabase
    .from('products')
    .select('id, tenant_id')
    .eq('id', product_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (pgErr) return { success: false, error: pgErr.message }
  if (!productGuard || (productGuard as { tenant_id: string }).tenant_id !== PLATFORM_OWNER_TENANT) {
    return { success: false, error: '상품을 찾을 수 없거나 수정할 수 없습니다' }
  }

  const prodJoin = Array.isArray(L.products) ? L.products[0] : L.products
  const p0 = (prodJoin ?? null) as { name?: string | null } | null
  const before_product_name = String(p0?.name ?? '').trim()

  const beforeSnapshot = {
    product_name: before_product_name,
    category_id: (L.category_id as string | null) ?? null,
    commerce_price:
      typeof L.commerce_price === 'number' && Number.isFinite(L.commerce_price)
        ? Math.round(L.commerce_price)
        : 0,
    original_price:
      typeof L.original_price === 'number' && Number.isFinite(L.original_price)
        ? Math.round(L.original_price)
        : null,
    status: currentStatus,
    is_visible: currentIsVisible,
    shipping_group_id: (L.shipping_group_id as string | null) ?? null,
    shipping_type: (L.shipping_type as string) || 'free',
    badge_labels: (L.badge_labels as string[] | null) ?? null,
    admin_memo: (L.admin_memo as string | null) ?? null,
    base_shipping_fee:
      typeof L.base_shipping_fee === 'number' && Number.isFinite(L.base_shipping_fee)
        ? Math.round(L.base_shipping_fee)
        : null,
    free_shipping_qty:
      typeof L.free_shipping_qty === 'number' && Number.isFinite(L.free_shipping_qty)
        ? Math.round(L.free_shipping_qty)
        : null,
    bulk_qty:
      typeof L.bulk_qty === 'number' && Number.isFinite(L.bulk_qty)
        ? Math.round(L.bulk_qty)
        : null,
    bulk_discount_rate:
      typeof L.bulk_discount_rate === 'number' && Number.isFinite(L.bulk_discount_rate)
        ? L.bulk_discount_rate
        : null,
    box_qty:
      typeof L.box_qty === 'number' && Number.isFinite(L.box_qty)
        ? Math.round(L.box_qty)
        : null,
    origin: (L.origin as string | null) ?? null,
    storage_method: (L.storage_method as string | null) ?? null,
    min_order_qty:
      typeof L.min_order_qty === 'number' && Number.isFinite(L.min_order_qty)
        ? Math.round(L.min_order_qty)
        : null,
    package_unit: (L.package_unit as string | null) ?? null,
    usage_desc: (L.usage_desc as string | null) ?? null,
    allergen: (L.allergen as string | null) ?? null,
    ingredients: (L.ingredients as string | null) ?? null,
    manufacturer: (L.manufacturer as string | null) ?? null,
    barcode: (L.barcode as string | null) ?? null,
    item_report_number: (L.item_report_number as string | null) ?? null,
    brand_name: (L.brand_name as string | null) ?? null,
    spec: (L.spec as string | null) ?? null,
    thumbnail_url: (L.thumbnail_url as string | null) ?? null,
    image_urls: (L.image_urls as string[] | null) ?? null,
    description: (L.description as string | null) ?? null,
    ai_strengths: (L.ai_strengths as string | null) ?? null,
    ai_usage: (L.ai_usage as string | null) ?? null,
    ai_summary: (L.ai_summary as string | null) ?? null,
  }

  const afterSnapshot = {
    product_name: dbProductName,
    category_id,
    commerce_price: price,
    original_price,
    status: vis.nextStatus,
    is_visible: vis.nextIsVisible,
    shipping_group_id,
    shipping_type: st,
    badge_labels: badge_labels_db,
    admin_memo,
    base_shipping_fee,
    free_shipping_qty,
    bulk_qty,
    bulk_discount_rate,
    box_qty,
    origin,
    storage_method,
    min_order_qty,
    package_unit,
    usage_desc,
    allergen,
    ingredients,
    manufacturer,
    barcode,
    item_report_number,
    brand_name,
    spec,
    thumbnail_url,
    image_urls: image_urls_db,
    description,
    ai_strengths,
    ai_usage,
    ai_summary,
  }

  const normBadges = (v: string[] | null | undefined) => {
    if (!v || !Array.isArray(v) || v.length === 0) return ''
    return [...v].map(String).sort().join('\u0001')
  }

  const normUrls = (v: string[] | null | undefined) => {
    if (!v || !Array.isArray(v) || v.length === 0) return ''
    return [...v].map(String).join('\u0001')
  }

  const changed_fields: string[] = []
  const keys = Object.keys(afterSnapshot) as (keyof typeof afterSnapshot)[]
  for (const k of keys) {
    const a = beforeSnapshot[k]
    const b = afterSnapshot[k]
    const same =
      k === 'badge_labels'
        ? normBadges(a as string[] | null) === normBadges(b as string[] | null)
        : k === 'image_urls'
          ? normUrls(a as string[] | null) === normUrls(b as string[] | null)
          : a === b
    if (!same) changed_fields.push(k)
  }

  if (changed_fields.length === 0) {
    return { success: true, data: { id: listing_id } }
  }

  const { error: pUpErr } = await supabase
    .from('products')
    .update({
      name: dbProductName,
      barcode,
      item_report_number,
    })
    .eq('id', product_id)
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .is('deleted_at', null)

  if (pUpErr) return { success: false, error: pUpErr.message }

  const { error: lUpErr } = await supabase
    .from('commerce_product_listings')
    .update({
      commerce_price: price,
      original_price,
      category_id,
      shipping_type: st,
      shipping_group_id,
      badge_labels: badge_labels_db,
      admin_memo,
      base_shipping_fee,
      free_shipping_qty,
      bulk_qty,
      bulk_discount_rate,
      box_qty,
      origin,
      storage_method,
      min_order_qty,
      package_unit,
      usage_desc,
      allergen,
      ingredients,
      manufacturer,
      barcode,
      item_report_number,
      brand_name,
      spec,
      thumbnail_url,
      image_urls: image_urls_db,
      description,
      ai_strengths,
      ai_usage,
      ai_summary,
      status: vis.nextStatus,
      is_visible: vis.nextIsVisible,
      updated_at: new Date().toISOString(),
    })
    .eq('id', listing_id)
    .is('deleted_at', null)

  if (lUpErr) return { success: false, error: lUpErr.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    admin_tenant_id: auth.ctx.tenant_id,
    tenant_id: PLATFORM_OWNER_TENANT,
    action_type: 'listing_updated',
    target_table: 'commerce_product_listings',
    target_id: listing_id,
    new_value: {
      before: beforeSnapshot,
      after: afterSnapshot,
      changed_fields,
    },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/products')
  revalidatePath(`/admin/commerce/products/${listing_id}/edit`)
  return { success: true, data: { id: listing_id } }
}

export async function createListing(input: {
  product_id: string
  commerce_price: number
  category_id: string
  brand_name?: string | null
  original_price?: number | null
  shipping_type?: ListingShippingType
  thumbnail_url?: string | null
  description?: string | null
}): Promise<ActionResult<{ listing_id: string }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const product_id = String(input.product_id ?? '').trim()
  if (!product_id) return { success: false, error: '상품을 선택해 주세요' }

  const category_id = String(input.category_id ?? '').trim()
  if (!category_id) return { success: false, error: '카테고리를 선택해 주세요' }

  const price = input.commerce_price
  if (!Number.isFinite(price) || !Number.isInteger(price) || price <= 0) {
    return { success: false, error: '가격은 1원 이상의 정수여야 합니다' }
  }

  const { data: catRow, error: cErr } = await supabase
    .from('product_categories')
    .select('id')
    .eq('id', category_id)
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .is('parent_id', null)
    .maybeSingle()

  if (cErr) return { success: false, error: cErr.message }
  if (!catRow) return { success: false, error: '유효한 카테고리(대분류)가 아닙니다' }

  const brand_name = String(input.brand_name ?? '').trim() || null

  let original_price: number | null = null
  const opIn = input.original_price
  if (opIn != null && Number.isFinite(opIn) && Number.isInteger(opIn) && opIn > 0) {
    if (opIn > price) original_price = opIn
  }

  const stIn = input.shipping_type ?? 'free'
  if (!(LISTING_SHIPPING_TYPES as readonly string[]).includes(stIn)) {
    return { success: false, error: '유효하지 않은 배송 유형입니다' }
  }
  const shipping_type = stIn as ListingShippingType

  const thumbnail_url = String(input.thumbnail_url ?? '').trim() || null
  const description = String(input.description ?? '').trim() || null

  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('id, tenant_id')
    .eq('id', product_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (pErr) return { success: false, error: pErr.message }
  if (!product) return { success: false, error: '상품을 찾을 수 없습니다' }

  const { data: dup } = await supabase
    .from('commerce_product_listings')
    .select('id')
    .eq('product_id', product_id)
    .eq('owner_type', 'platform')
    .is('deleted_at', null)
    .maybeSingle()

  if (dup) return { success: false, error: '이미 등록된 상품입니다' }

  const { data: inserted, error: insErr } = await supabase
    .from('commerce_product_listings')
    .insert({
      tenant_id: product.tenant_id,
      product_id,
      owner_type: 'platform',
      owner_tenant_id: PLATFORM_OWNER_TENANT,
      commerce_price: price,
      brand_name,
      original_price,
      shipping_type,
      category_id,
      status: 'draft',
      is_visible: false,
      thumbnail_url,
      description,
    })
    .select('id')
    .single()

  if (insErr) return { success: false, error: insErr.message }
  const listing_id = inserted.id as string

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: product.tenant_id,
    action_type: 'listing_created',
    target_table: 'commerce_product_listings',
    target_id: listing_id,
    new_value: {
      listing_id,
      product_id,
      category_id,
      brand_name,
      original_price,
      shipping_type,
      thumbnail_url,
      description,
    },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/products')
  return { success: true, data: { listing_id } }
}

/** createProduct()와 같이 product_costs 행이 필요해 최소값으로 둠(실제 판매가는 listing). */
const PLATFORM_COMMERCE_PLACEHOLDER_COST = 1

async function allocateProductCodeForPlatform(supabase: any): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  try {
    const { data: seqData } = await supabase.rpc('nextval_product_code')
    if (seqData != null && Number.isFinite(Number(seqData))) {
      return { ok: true, code: `P${String(Number(seqData)).padStart(4, '0')}` }
    }
  } catch {
    // sequence 없으면 fallback
  }
  const { data: lastProduct, error } = await supabase
    .from('products')
    .select('product_code')
    .like('product_code', 'P%')
    .order('product_code', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  const n = lastProduct?.product_code
    ? (parseInt(String(lastProduct.product_code).replace(/[^0-9]/g, ''), 10) || 0) + 1
    : 1
  return { ok: true, code: `P${String(n).padStart(4, '0')}` }
}

export async function uploadListingImage(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const raw = formData.get('file')
  if (!raw || !(raw instanceof File)) {
    return { success: false, error: '파일이 없습니다' }
  }
  const file = raw
  if (file.size === 0) return { success: false, error: '빈 파일입니다' }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'image'
  const path = `admin/${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${safeName}`
  const buf = Buffer.from(await file.arrayBuffer())

  const { data, error } = await supabase.storage.from('commerce-images').upload(path, buf, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })

  if (error) {
    const msg = error.message ?? String(error)
    if (/bucket not found|Bucket not found|404|Not Found/i.test(msg)) {
      return {
        success: false,
        error:
          'commerce-images 저장소가 없습니다. Supabase Storage에서 commerce-images 버킷을 먼저 생성해주세요.',
      }
    }
    return { success: false, error: mapListingUploadError(msg) }
  }

  const { data: pub } = supabase.storage.from('commerce-images').getPublicUrl(data.path)
  return { success: true, data: { url: pub.publicUrl } }
}

export type ShippingGroupListItem = {
  id: string
  name: string
  description: string | null
}

/** 플랫폼 테넌트 묶음배송 그룹 (활성만) */
export async function getShippingGroups(): Promise<ActionResult<{ groups: ShippingGroupListItem[] }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('shipping_groups')
    .select('id, name, description')
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) return { success: false, error: error.message }
  return { success: true, data: { groups: (data ?? []) as ShippingGroupListItem[] } }
}

export async function createShippingGroup(input: {
  name: string
  description?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const name = String(input.name ?? '').trim()
  if (!name) return { success: false, error: '그룹명을 입력해 주세요' }

  const description =
    input.description != null && String(input.description).trim()
      ? String(input.description).trim()
      : null

  const { data: row, error } = await supabase
    .from('shipping_groups')
    .insert({
      tenant_id: PLATFORM_OWNER_TENANT,
      name,
      description,
      is_active: true,
    })
    .select('id')
    .single()

  if (error || !row) return { success: false, error: error?.message ?? '그룹 생성 실패' }

  const id = row.id as string
  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: PLATFORM_OWNER_TENANT,
    action_type: 'shipping_group_created',
    target_table: 'shipping_groups',
    target_id: id,
    new_value: { name, description },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/products/new')
  return { success: true, data: { id } }
}

export async function updateShippingGroup(
  id: string,
  input: { name?: string; description?: string },
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const gid = String(id ?? '').trim()
  if (!gid) return { success: false, error: '그룹 ID가 없습니다' }

  const { data: existing, error: fetchErr } = await supabase
    .from('shipping_groups')
    .select('id, name, description, tenant_id')
    .eq('id', gid)
    .maybeSingle()

  if (fetchErr) return { success: false, error: fetchErr.message }
  if (!existing || (existing as { tenant_id: string }).tenant_id !== PLATFORM_OWNER_TENANT) {
    return { success: false, error: '그룹을 찾을 수 없습니다' }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) {
    const n = String(input.name).trim()
    if (!n) return { success: false, error: '그룹명을 입력해 주세요' }
    patch.name = n
  }
  if (input.description !== undefined) {
    patch.description = String(input.description).trim() || null
  }

  if (Object.keys(patch).length === 1) {
    return { success: false, error: '변경할 내용이 없습니다' }
  }

  const { error: upErr } = await supabase.from('shipping_groups').update(patch).eq('id', gid)
  if (upErr) return { success: false, error: upErr.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: PLATFORM_OWNER_TENANT,
    action_type: 'shipping_group_updated',
    target_table: 'shipping_groups',
    target_id: gid,
    old_value: { name: existing.name, description: existing.description },
    new_value: patch,
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/products/new')
  return { success: true, data: { id: gid } }
}

export async function deleteShippingGroup(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const gid = String(id ?? '').trim()
  if (!gid) return { success: false, error: '그룹 ID가 없습니다' }

  const { data: existing, error: fetchErr } = await supabase
    .from('shipping_groups')
    .select('id, tenant_id, name')
    .eq('id', gid)
    .maybeSingle()

  if (fetchErr) return { success: false, error: fetchErr.message }
  if (!existing || (existing as { tenant_id: string }).tenant_id !== PLATFORM_OWNER_TENANT) {
    return { success: false, error: '그룹을 찾을 수 없습니다' }
  }

  const { count, error: cntErr } = await supabase
    .from('commerce_product_listings')
    .select('id', { count: 'exact', head: true })
    .eq('shipping_group_id', gid)
    .is('deleted_at', null)

  if (cntErr) return { success: false, error: cntErr.message }
  if ((count ?? 0) > 0) {
    return {
      success: false,
      error:
        '이 그룹을 사용 중인 상품이 있습니다. 먼저 상품의 배송 그룹을 변경해주세요.',
    }
  }

  const { error: upErr } = await supabase
    .from('shipping_groups')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', gid)

  if (upErr) return { success: false, error: upErr.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: PLATFORM_OWNER_TENANT,
    action_type: 'shipping_group_deactivated',
    target_table: 'shipping_groups',
    target_id: gid,
    old_value: { is_active: true, name: (existing as { name: string }).name },
    new_value: { is_active: false },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/products/new')
  return { success: true }
}

export async function createListingFull(input: {
  brand_name: string | null
  product_name: string
  spec: string | null
  thumbnail_url: string | null
  image_urls?: string[] | null
  badge_labels?: string[] | null
  category_id: string
  commerce_price: number
  original_price: number | null
  shipping_type: ListingShippingType
  shipping_group_id?: string | null
  admin_memo: string | null
  description?: string | null
  status: 'draft' | 'visible'
  base_shipping_fee?: number
  free_shipping_qty?: number | null
  bulk_qty?: number | null
  bulk_discount_rate?: number | null
  box_qty?: number | null
  origin?: string | null
  storage_method?: string | null
  min_order_qty?: number | null
  package_unit?: string | null
  usage_desc?: string | null
  allergen?: string | null
  ingredients?: string | null
  manufacturer?: string | null
  barcode?: string | null
  item_report_number?: string | null
  ai_strengths?: string | null
  ai_usage?: string | null
  ai_summary?: string | null
}): Promise<ActionResult<{ listing_id: string; product_id: string }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const product_name = String(input.product_name ?? '').trim()
  if (!product_name) return { success: false, error: '상품명을 입력해 주세요' }

  const category_id = String(input.category_id ?? '').trim()
  if (!category_id) return { success: false, error: '카테고리를 선택해 주세요' }

  const price = input.commerce_price
  if (!Number.isFinite(price) || !Number.isInteger(price) || price <= 0) {
    return { success: false, error: '식식이 판매가는 1원 이상의 정수여야 합니다' }
  }

  const { data: catRow, error: cErr } = await supabase
    .from('product_categories')
    .select('id')
    .eq('id', category_id)
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .eq('is_active', true)
    .maybeSingle()

  if (cErr) return { success: false, error: cErr.message }
  if (!catRow) return { success: false, error: '유효한 카테고리가 아닙니다' }

  const st = input.shipping_type
  if (!(LISTING_SHIPPING_TYPES as readonly string[]).includes(st)) {
    return { success: false, error: '유효하지 않은 배송 유형입니다' }
  }

  let shipping_group_id: string | null = null
  const sgRaw = input.shipping_group_id
  if (sgRaw != null && String(sgRaw).trim()) {
    const sgId = String(sgRaw).trim()
    const { data: sgRow, error: sgErr } = await supabase
      .from('shipping_groups')
      .select('id')
      .eq('id', sgId)
      .eq('tenant_id', PLATFORM_OWNER_TENANT)
      .eq('is_active', true)
      .maybeSingle()
    if (sgErr) return { success: false, error: sgErr.message }
    if (!sgRow) return { success: false, error: '유효한 묶음배송 그룹이 아닙니다' }
    shipping_group_id = sgId
  }

  const statusIn = input.status
  if (statusIn !== 'draft' && statusIn !== 'visible') {
    return { success: false, error: '유효하지 않은 공개 설정입니다' }
  }

  const brand_name = String(input.brand_name ?? '').trim() || null
  const spec = String(input.spec ?? '').trim() || null
  const admin_memo = String(input.admin_memo ?? '').trim() || null
  const thumbnail_url = String(input.thumbnail_url ?? '').trim() || null
  const listing_description = String(input.description ?? '').trim() || null
  const ai_strengths = String(input.ai_strengths ?? '').trim() || null
  const ai_usage = String(input.ai_usage ?? '').trim() || null
  const ai_summary = String(input.ai_summary ?? '').trim() || null

  const rawUrls = input.image_urls
  const image_urls =
    Array.isArray(rawUrls) && rawUrls.length > 0
      ? rawUrls.map((u) => String(u ?? '').trim()).filter(Boolean).slice(0, 20)
      : []
  const image_urls_db = image_urls.length > 0 ? image_urls : null

  const rawBadges = input.badge_labels
  const badge_labels =
    Array.isArray(rawBadges) && rawBadges.length > 0
      ? rawBadges.map((b) => String(b ?? '').trim()).filter(Boolean).slice(0, 2)
      : []
  const badge_labels_db = badge_labels.length > 0 ? badge_labels : null

  let original_price: number | null = null
  const opIn = input.original_price
  if (opIn != null && Number.isFinite(opIn) && Number.isInteger(opIn) && opIn > 0) {
    if (opIn > price) original_price = opIn
  }

  const dbProductName = buildPlatformProductDisplayName(brand_name, product_name, spec)

  const codeRes = await allocateProductCodeForPlatform(supabase)
  if (!codeRes.ok) return { success: false, error: codeRes.error }
  const product_code = codeRes.code

  const today = new Date().toISOString().slice(0, 10)

  const { data: insertedProduct, error: pInsErr } = await supabase
    .from('products')
    .insert({
      tenant_id: PLATFORM_OWNER_TENANT,
      product_code,
      name: dbProductName,
      tax_type: 'taxable',
      category_id,
      supplier_id: null,
      barcode: input.barcode?.replace(/\D/g, '') || null,
      ingredients: null,
      item_report_number: input.item_report_number?.trim() || null,
      min_margin_rate: null,
      procurement_type: 'consignment',
    })
    .select('id')
    .single()

  if (pInsErr || !insertedProduct) {
    return { success: false, error: pInsErr?.message ?? '상품 저장 실패' }
  }
  const product_id = insertedProduct.id as string

  const { error: costErr } = await supabase.from('product_costs').insert({
    product_id,
    cost_price: PLATFORM_COMMERCE_PLACEHOLDER_COST,
    start_date: today,
    end_date: null,
  })

  if (costErr) {
    await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', product_id)
    return { success: false, error: `매입가 이력 저장 실패: ${costErr.message}` }
  }

  const { error: statsErr } = await supabase.from('product_stats').upsert(
    { product_id, used_by_count: 0, avg_unit_price: price },
    { onConflict: 'product_id' },
  )
  if (statsErr) {
    await supabase.from('product_costs').delete().eq('product_id', product_id)
    await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', product_id)
    return { success: false, error: `product_stats 저장 실패: ${statsErr.message}` }
  }

  const is_visible = statusIn === 'visible'
  const listingStatus: ListingStatus = statusIn === 'visible' ? 'visible' : 'draft'

  const { data: insertedListing, error: lErr } = await supabase
    .from('commerce_product_listings')
    .insert({
      tenant_id: PLATFORM_OWNER_TENANT,
      product_id,
      owner_type: 'platform',
      owner_tenant_id: PLATFORM_OWNER_TENANT,
      commerce_price: price,
      brand_name,
      original_price,
      shipping_type: st,
      category_id,
      status: listingStatus,
      is_visible,
      thumbnail_url,
      image_urls: image_urls_db,
      badge_labels: badge_labels_db,
      description: listing_description,
      ai_strengths,
      ai_usage,
      ai_summary,
      spec,
      admin_memo,
      shipping_group_id,
      base_shipping_fee: input.base_shipping_fee ?? 3500,
      free_shipping_qty: input.free_shipping_qty ?? null,
      bulk_qty: input.bulk_qty ?? null,
      bulk_discount_rate: input.bulk_discount_rate ?? null,
      box_qty: input.box_qty ?? 1,
      origin: String(input.origin ?? '').trim() || null,
      storage_method: String(input.storage_method ?? '').trim() || null,
      min_order_qty: input.min_order_qty ?? 1,
      package_unit: String(input.package_unit ?? '').trim() || null,
      usage_desc: String(input.usage_desc ?? '').trim() || null,
      allergen: String(input.allergen ?? '').trim() || null,
      ingredients: input.ingredients || null,
      manufacturer: input.manufacturer || null,
      barcode: input.barcode?.replace(/\D/g, '') || null,
      item_report_number: input.item_report_number?.trim() || null,
    })
    .select('id')
    .single()

  if (lErr || !insertedListing) {
    await supabase.from('product_costs').delete().eq('product_id', product_id)
    await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', product_id)
    return { success: false, error: lErr?.message ?? 'Listing 저장 실패' }
  }

  const listing_id = insertedListing.id as string

  try {
    // 상품 등록 자체는 막지 않되(비치명적), 실패는 반드시 눈에 보이게 남긴다.
    const im = await upsertIngredientMaster({
      source_type: 'admin',
      source_id: listing_id,
      name: product_name,
      barcode: input.barcode || null,
      item_report_number: input.item_report_number || null,
      brand: input.brand_name || null,
      spec: input.spec || null,
      manufacturer: input.manufacturer || null,
      ingredients_text: input.ingredients || null,
      price: input.commerce_price || null,
      tenant_id: PLATFORM_OWNER_TENANT,
    })
    if (!im.success) {
      console.error('ingredient_master 등록 실패 (비치명적):', im.error)
    }
  } catch (e) {
    console.error('ingredient_master 등록 실패 (비치명적):', e)
  }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    admin_tenant_id: auth.ctx.tenant_id,
    tenant_id: PLATFORM_OWNER_TENANT,
    action_type: 'listing_created_full',
    target_table: 'commerce_product_listings',
    target_id: listing_id,
    new_value: {
      listing_id,
      product_id,
      product_name,
      brand_name,
      spec,
      commerce_price: price,
      status: statusIn,
      description: listing_description,
      image_urls: image_urls_db,
      badge_labels: badge_labels_db,
      shipping_group_id,
    },
  })
  if (!logRes.ok) {
    console.error(
      '[createListingFull] admin_logs insert failed — product and listing are already committed:',
      logRes.error,
    )
  }

  revalidatePath('/admin/commerce/products')
  return { success: true, data: { listing_id, product_id } }
}

export async function getProducts(search?: string): Promise<ActionResult<{ products: ProductPickRow[] }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const { data: listedRows, error: lErr } = await supabase
    .from('commerce_product_listings')
    .select('product_id, commerce_price')
    .eq('owner_type', 'platform')
    .is('deleted_at', null)

  if (lErr) return { success: false, error: lErr.message }

  const listedIds = new Set<string>()
  const listingPriceByProductId = new Map<string, number>()
  for (const r of listedRows ?? []) {
    const row = r as { product_id: string | null; commerce_price: unknown }
    const pid = row.product_id
    if (!pid) continue
    listedIds.add(pid)
    const cp = row.commerce_price
    if (typeof cp === 'number' && Number.isFinite(cp) && !listingPriceByProductId.has(pid)) {
      listingPriceByProductId.set(pid, Math.round(cp))
    }
  }

  const term = search?.trim()

  let q = supabase
    .from('products')
    .select('id, name, category_id, tenant_id')
    .is('deleted_at', null)

  if (term) {
    q = q.ilike('name', `%${term}%`)
  }

  const limit = term ? 2000 : 500
  q = q.order('name', { ascending: true }).limit(limit)

  const { data: products, error: pErr } = await q
  if (pErr) return { success: false, error: pErr.message }

  const rows: ProductPickRow[] = (products ?? []).map((p: Record<string, unknown>) => {
    const id = p.id as string
    return {
      id,
      name: (p.name as string | null) ?? null,
      category_id: (p.category_id as string | null) ?? null,
      tenant_id: p.tenant_id as string,
      listing_commerce_price: listingPriceByProductId.get(id) ?? null,
      already_listed: listedIds.has(id),
    }
  })

  rows.sort((a, b) => {
    if (a.already_listed !== b.already_listed) return a.already_listed ? 1 : -1
    return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ko')
  })

  return { success: true, data: { products: rows } }
}

// --- COMMERCE-003: 주문 처리 ---

export type CommerceOrderSummaryRow = {
  id: string
  order_number: string | null
  tenant_id: string
  tenant_name: string | null
  status: CommerceOrderStatus
  payment_method: CommercePaymentMethod
  payment_status: string
  total_amount: number
  shipping_name: string
  shipping_phone: string
  shipping_address: string
  delivery_memo: string | null
  refund_required: boolean
  refund_pending_at: string | null
  created_at: string
  updated_at: string
  items_count: number
}

export type CommerceOrderItemRow = {
  id: string
  listing_title: string
  quantity: number
  unit_price: number
  total_price: number
}

export type CommerceAllocationDetailRow = {
  id: string
  commerce_order_item_id: string
  supplier_tenant_id: string
  supplier_name: string | null
  item_amount: number
  platform_fee_rate: number
  platform_fee_amount: number
  supplier_payable_amount: number
  status: string
  cancelled_at: string | null
  cancelled_by: string | null
  cancelled_by_display: string | null
}

export type CommerceOrderDetail = Omit<CommerceOrderSummaryRow, 'items_count'> & {
  source: string
  rfq_request_id: string | null
  items: CommerceOrderItemRow[]
  allocations: CommerceAllocationDetailRow[]
}

const ORDER_LIST_SELECT = `
  id,
  order_number,
  tenant_id,
  status,
  payment_method,
  payment_status,
  total_amount,
  shipping_name,
  shipping_phone,
  shipping_address,
  delivery_memo,
  refund_required,
  refund_pending_at,
  created_at,
  updated_at,
  commerce_order_items ( count )
`

function normalizeOrderRow(row: Record<string, unknown>): Omit<CommerceOrderSummaryRow, 'tenant_name'> {
  const nested = row.commerce_order_items as { count?: number }[] | undefined
  const items_count = Array.isArray(nested) ? Number(nested[0]?.count ?? 0) : 0
  const { commerce_order_items: _c, ...rest } = row as Record<string, unknown> & {
    commerce_order_items?: unknown
  }
  return { ...rest, items_count } as Omit<CommerceOrderSummaryRow, 'tenant_name'>
}

function sortCommerceOrdersList(rows: CommerceOrderSummaryRow[]): CommerceOrderSummaryRow[] {
  const manualPending = (o: CommerceOrderSummaryRow) =>
    o.status === 'pending_payment' &&
    (o.payment_method === 'bank_transfer' || o.payment_method === 'kakao_manual')

  const a = rows.filter(manualPending)
  const b = rows.filter((o) => !manualPending(o))
  a.sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime())
  b.sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime())
  return [...a, ...b]
}

async function attachTenantNames(supabase: any, rows: CommerceOrderSummaryRow[]): Promise<void> {
  const ids = [...new Set(rows.map((r) => r.tenant_id).filter(Boolean))]
  if (ids.length === 0) return
  const { data: tenants, error } = await supabase.from('tenants').select('id, name').in('id', ids)
  if (error) return
  const pairs = ((tenants ?? []) as { id: string; name: string | null }[]).map(
    (t) => [t.id, t.name ?? null] as const,
  )
  const map = new Map<string, string | null>(pairs)
  for (const r of rows) {
    r.tenant_name = map.get(r.tenant_id) ?? null
  }
}

export async function getCommerceOrders(filters?: {
  status?: string
  payment_method?: string
}): Promise<
  ActionResult<{ manualReviewQueue: CommerceOrderSummaryRow[]; orders: CommerceOrderSummaryRow[] }>
> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  let manualQ = supabase
    .from('commerce_orders')
    .select(ORDER_LIST_SELECT)
    .eq('status', 'pending_payment')
    .in('payment_method', ['bank_transfer', 'kakao_manual'])
    .order('created_at', { ascending: true })

  let mainQ = supabase.from('commerce_orders').select(ORDER_LIST_SELECT)

  const st = filters?.status?.trim()
  if (st && st !== 'all' && (COMMERCE_ORDER_STATUSES as readonly string[]).includes(st)) {
    mainQ = mainQ.eq('status', st)
  }

  const pm = filters?.payment_method?.trim()
  if (pm && pm !== 'all' && (COMMERCE_PAYMENT_METHODS as readonly string[]).includes(pm)) {
    mainQ = mainQ.eq('payment_method', pm)
  }

  const [manualRes, mainRes] = await Promise.all([manualQ, mainQ])

  if (manualRes.error) return { success: false, error: manualRes.error.message }
  if (mainRes.error) return { success: false, error: mainRes.error.message }

  const manualRows = (manualRes.data ?? []).map((r: Record<string, unknown>) => {
    const base = normalizeOrderRow(r)
    return { ...base, tenant_name: null as string | null } as CommerceOrderSummaryRow
  })
  const mainRows = (mainRes.data ?? []).map((r: Record<string, unknown>) => {
    const base = normalizeOrderRow(r)
    return { ...base, tenant_name: null as string | null } as CommerceOrderSummaryRow
  })

  await attachTenantNames(supabase, manualRows)
  await attachTenantNames(supabase, mainRows)

  return {
    success: true,
    data: {
      manualReviewQueue: manualRows,
      orders: sortCommerceOrdersList(mainRows),
    },
  }
}

const SUPPLIER_EXPORT_ORDER_SELECT = `
  id,
  order_number,
  tenant_id,
  created_at,
  shipping_name,
  shipping_phone,
  shipping_address,
  delivery_memo,
  payment_status,
  commerce_order_items ( listing_title, quantity )
`

const SUPPLIER_EXPORT_MAX_IDS = 3000
const SUPPLIER_EXPORT_CHUNK = 80

function formatSupplierExportOrderWhen(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'medium' })
  } catch {
    return String(iso ?? '')
  }
}

/** `commerce_orders.payment_status` 및 `updateCommerceOrderStatus`에서 설정되는 값 기준 */
function formatSupplierExportPaymentStatus(paymentStatus: string | null | undefined): string {
  const v = String(paymentStatus ?? '').trim()
  if (v === 'paid') return '결제완료'
  if (v === 'unpaid') return '미결제'
  if (v === 'refunded') return '환불완료'
  return v
}

async function buildTenantDisplayMapForExport(
  supabase: any,
  tenantIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(tenantIds.filter(Boolean))]
  for (const id of unique) {
    map.set(id, id)
  }
  if (unique.length === 0) return map
  const { data, error } = await supabase.from('tenants').select('id, name').in('id', unique)
  if (error) return map
  for (const t of (data ?? []) as { id: string; name: string | null }[]) {
    const nm = t.name?.trim()
    if (nm) map.set(t.id, nm)
  }
  return map
}

type RawExportOrderRow = {
  id: string
  order_number: string | null
  tenant_id: string
  created_at: string
  shipping_name: string | null
  shipping_phone: string | null
  shipping_address: string | null
  delivery_memo: string | null
  payment_status: string | null
  commerce_order_items: { listing_title: string | null; quantity: number | null }[] | null
}

/**
 * 화면에 표시된 주문 ID 집합 기준, `commerce_orders` + `commerce_order_items` 조인 후 품목당 1행 flatten.
 * 식당명은 `tenants.name`(기존 `getCommerceOrders`와 동일), 실패·빈 이름 시 `tenant_id` 문자열.
 */
export async function getCommerceOrderSupplierExportRows(
  orderIds: string[],
): Promise<ActionResult<{ rows: SupplierExportRow[] }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const rawIds = (orderIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean)
  const uniqueOrdered: string[] = []
  const seen = new Set<string>()
  for (const id of rawIds) {
    if (seen.has(id)) continue
    seen.add(id)
    uniqueOrdered.push(id)
  }

  if (uniqueOrdered.length === 0) {
    return { success: true, data: { rows: [] } }
  }
  if (uniqueOrdered.length > SUPPLIER_EXPORT_MAX_IDS) {
    return { success: false, error: `한 번에 보낼 수 있는 주문은 최대 ${SUPPLIER_EXPORT_MAX_IDS}건입니다` }
  }

  const byId = new Map<string, RawExportOrderRow>()
  for (let i = 0; i < uniqueOrdered.length; i += SUPPLIER_EXPORT_CHUNK) {
    const slice = uniqueOrdered.slice(i, i + SUPPLIER_EXPORT_CHUNK)
    const { data, error } = await supabase
      .from('commerce_orders')
      .select(SUPPLIER_EXPORT_ORDER_SELECT)
      .in('id', slice)

    if (error) return { success: false, error: error.message }
    for (const row of (data ?? []) as RawExportOrderRow[]) {
      byId.set(row.id, row)
    }
  }

  const orderedRows: RawExportOrderRow[] = []
  for (const id of uniqueOrdered) {
    const r = byId.get(id)
    if (r) orderedRows.push(r)
  }

  const tenantMap = await buildTenantDisplayMapForExport(
    supabase,
    orderedRows.map((r) => r.tenant_id),
  )

  const flat: SupplierExportRow[] = []
  for (const o of orderedRows) {
    const orderNo = String(o.order_number ?? '').trim() || o.id
    const orderedAt = formatSupplierExportOrderWhen(o.created_at)
    const restaurant = tenantMap.get(o.tenant_id) ?? o.tenant_id
    const recipient = String(o.shipping_name ?? '')
    const phone = String(o.shipping_phone ?? '')
    const address = String(o.shipping_address ?? '')
    const deliveryNote = String(o.delivery_memo ?? '')
    const payLabel = formatSupplierExportPaymentStatus(o.payment_status)

    const items = Array.isArray(o.commerce_order_items) ? o.commerce_order_items : []
    if (items.length === 0) {
      flat.push({
        주문번호: orderNo,
        주문일시: orderedAt,
        식당명: restaurant,
        받는사람: recipient,
        연락처: phone,
        배송지: address,
        상품명: '',
        수량: 0,
        배송메시지: deliveryNote,
        결제상태: payLabel,
      })
      continue
    }
    for (const it of items) {
      const title = String(it.listing_title ?? '')
      const qty = Number(it.quantity)
      flat.push({
        주문번호: orderNo,
        주문일시: orderedAt,
        식당명: restaurant,
        받는사람: recipient,
        연락처: phone,
        배송지: address,
        상품명: title,
        수량: Number.isFinite(qty) ? qty : 0,
        배송메시지: deliveryNote,
        결제상태: payLabel,
      })
    }
  }

  return { success: true, data: { rows: flat } }
}

export async function getCommerceOrderDetail(id: string): Promise<ActionResult<{ order: CommerceOrderDetail }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const oid = String(id ?? '').trim()
  if (!oid) return { success: false, error: '주문 ID가 필요합니다' }

  const { data: row, error } = await supabase
    .from('commerce_orders')
    .select(
      `
      id,
      order_number,
      tenant_id,
      source,
      rfq_request_id,
      status,
      payment_method,
      payment_status,
      total_amount,
      shipping_name,
      shipping_phone,
      shipping_address,
      delivery_memo,
      refund_required,
      refund_pending_at,
      created_at,
      updated_at,
      commerce_order_items ( id, listing_title, quantity, unit_price, total_price )
    `,
    )
    .eq('id', oid)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!row) return { success: false, error: '주문을 찾을 수 없습니다' }

  const rawItems = (row as any).commerce_order_items as (CommerceOrderItemRow & { id?: string })[] | undefined
  const items = (Array.isArray(rawItems) ? rawItems : []).map((it) => ({
    id: String(it.id ?? ''),
    listing_title: it.listing_title,
    quantity: it.quantity,
    unit_price: it.unit_price,
    total_price: it.total_price,
  }))

  const { commerce_order_items: _i, ...orderRest } = row as Record<string, unknown> & {
    commerce_order_items?: unknown
  }

  const summary: CommerceOrderSummaryRow = {
    id: orderRest.id as string,
    order_number: (orderRest.order_number as string | null) ?? null,
    tenant_id: orderRest.tenant_id as string,
    tenant_name: null,
    status: orderRest.status as CommerceOrderStatus,
    payment_method: orderRest.payment_method as CommercePaymentMethod,
    payment_status: orderRest.payment_status as string,
    total_amount: orderRest.total_amount as number,
    shipping_name: orderRest.shipping_name as string,
    shipping_phone: orderRest.shipping_phone as string,
    shipping_address: orderRest.shipping_address as string,
    delivery_memo: (orderRest.delivery_memo as string | null) ?? null,
    refund_required: Boolean(orderRest.refund_required),
    refund_pending_at: (orderRest.refund_pending_at as string | null) ?? null,
    created_at: orderRest.created_at as string,
    updated_at: orderRest.updated_at as string,
    items_count: items.length,
  }

  await attachTenantNames(supabase, [summary])

  const order: CommerceOrderDetail = {
    id: summary.id,
    order_number: summary.order_number,
    tenant_id: summary.tenant_id,
    tenant_name: summary.tenant_name,
    status: summary.status,
    payment_method: summary.payment_method,
    payment_status: summary.payment_status,
    total_amount: summary.total_amount,
    shipping_name: summary.shipping_name,
    shipping_phone: summary.shipping_phone,
    shipping_address: summary.shipping_address,
    delivery_memo: summary.delivery_memo,
    refund_required: summary.refund_required,
    refund_pending_at: summary.refund_pending_at,
    created_at: summary.created_at,
    updated_at: summary.updated_at,
    source: String(orderRest.source ?? 'direct'),
    rfq_request_id: (orderRest.rfq_request_id as string | null) ?? null,
    items,
    allocations: [],
  }

  const { data: allocData, error: allocErr } = await supabase
    .from('commerce_order_allocations')
    .select(
      'id, commerce_order_item_id, supplier_tenant_id, item_amount, platform_fee_rate, platform_fee_amount, supplier_payable_amount, status, cancelled_at, cancelled_by',
    )
    .eq('commerce_order_id', oid)

  if (!allocErr && allocData && allocData.length > 0) {
    const supIds = [...new Set((allocData as { supplier_tenant_id: string }[]).map((a) => a.supplier_tenant_id))]
    const allocNameMap = new Map<string, string | null>()
    if (supIds.length) {
      const { data: tn } = await supabase.from('tenants').select('id, name').in('id', supIds)
      for (const t of (tn ?? []) as { id: string; name: string | null }[]) {
        allocNameMap.set(t.id, t.name ?? null)
      }
    }
    const cancelByIds = [
      ...new Set(
        (allocData as { cancelled_by?: string | null }[])
          .map((a) => a.cancelled_by)
          .filter((x): x is string => typeof x === 'string' && x.length > 0),
      ),
    ]
    const userDisp = new Map<string, string>()
    if (cancelByIds.length) {
      const { data: usersRows } = await supabase.from('users').select('id, email').in('id', cancelByIds)
      for (const u of (usersRows ?? []) as { id: string; email?: string | null }[]) {
        const em = u.email != null ? String(u.email).trim() : ''
        userDisp.set(u.id, em || `${u.id.slice(0, 8)}…`)
      }
    }
    order.allocations = (allocData as Record<string, unknown>[]).map((a) => {
      const cancelled_by = typeof a.cancelled_by === 'string' ? a.cancelled_by : null
      return {
        id: String(a.id),
        commerce_order_item_id: String(a.commerce_order_item_id),
        supplier_tenant_id: String(a.supplier_tenant_id),
        supplier_name: allocNameMap.get(String(a.supplier_tenant_id)) ?? null,
        item_amount: Number(a.item_amount),
        platform_fee_rate: Number(a.platform_fee_rate),
        platform_fee_amount: Number(a.platform_fee_amount),
        supplier_payable_amount: Number(a.supplier_payable_amount),
        status: String(a.status),
        cancelled_at: typeof a.cancelled_at === 'string' ? a.cancelled_at : null,
        cancelled_by,
        cancelled_by_display: cancelled_by ? userDisp.get(cancelled_by) ?? null : null,
      }
    })
  }

  return { success: true, data: { order } }
}

function validateOrderTransition(
  before: CommerceOrderStatus,
  after: CommerceOrderStatus,
  refundRequired: boolean,
): string | null {
  if (before === after) return '동일한 상태입니다'

  if (before === 'completed') return '완료된 주문은 변경할 수 없습니다'

  if (after === 'refunded' && before === 'paid') {
    return '환불은 cancelled 상태를 거쳐야 합니다'
  }

  if (before === 'shipped' && after === 'cancelled') {
    return '배송 중인 주문은 취소할 수 없습니다'
  }

  const allowed: Partial<Record<CommerceOrderStatus, CommerceOrderStatus[]>> = {
    pending_payment: ['paid', 'cancelled'],
    paid: ['preparing', 'cancelled'],
    preparing: ['shipped'],
    shipped: ['completed'],
    cancelled: ['refunded'],
  }

  const next = allowed[before]
  if (!next || !next.includes(after)) return '허용되지 않는 상태 전이입니다'

  if (before === 'cancelled' && after === 'refunded' && !refundRequired) {
    return '환불 대기 중인 주문만 환불 완료 처리할 수 있습니다'
  }

  return null
}

function kstTodayDateStringForPlatformPayment(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
}

/**
 * storefront `commerce_orders`가 `paid`로 확정된 뒤, 플랫폼 미수 해소용 `payments` inbound 1건을 best-effort로 기록한다.
 * INSERT 실패·로그 실패는 주문 성공을 막지 않는다 (PLATFORM-ERP-P0-001).
 */
async function tryRecordPlatformReceivablePayment(
  supabase: any,
  adminUserId: string,
  order: {
    id: string
    tenant_id: string
    order_number: string | null
    total_amount: number
    payment_method: string
  },
): Promise<void> {
  const { data: dup } = await supabase
    .from('payments')
    .select('id')
    .eq('commerce_order_id', order.id)
    .is('reversal_of_id', null)
    .maybeSingle()
  if (dup?.id) return

  const amt = typeof order.total_amount === 'number' && Number.isFinite(order.total_amount) ? order.total_amount : NaN
  if (!Number.isFinite(amt) || amt <= 0) {
    console.error('[platform storefront payment] invalid total_amount', order.total_amount)
    const logRes = await insertAdminLog(supabase, {
      admin_id: adminUserId,
      tenant_id: order.tenant_id,
      action_type: 'platform_payment_insert_failed',
      target_table: 'payments',
      target_id: null,
      new_value: {
        commerce_order_id: order.id,
        order_number: order.order_number,
        error: 'invalid total_amount for platform payment',
      },
    })
    if (!logRes.ok) console.error('[platform storefront payment] admin_logs insert failed', logRes.error)
    return
  }

  const pm = String(order.payment_method ?? '')
  if (pm !== 'bank_transfer' && pm !== 'kakao_manual' && pm !== 'card') {
    console.error('[platform storefront payment] unsupported payment_method', pm)
    const logRes = await insertAdminLog(supabase, {
      admin_id: adminUserId,
      tenant_id: order.tenant_id,
      action_type: 'platform_payment_insert_failed',
      target_table: 'payments',
      target_id: null,
      new_value: {
        commerce_order_id: order.id,
        order_number: order.order_number,
        error: `unsupported payment_method: ${pm}`,
      },
    })
    if (!logRes.ok) console.error('[platform storefront payment] admin_logs insert failed', logRes.error)
    return
  }

  const paymentDate = kstTodayDateStringForPlatformPayment()
  const label = `storefront 주문 ${order.order_number ?? order.id}`

  const payload: Record<string, unknown> = {
    tenant_id: PLATFORM_OWNER_TENANT,
    payer_tenant_id: order.tenant_id,
    payee_tenant_id: PLATFORM_OWNER_TENANT,
    direction: 'inbound',
    status: 'confirmed',
    amount: amt,
    commerce_order_id: order.id,
    payment_method: pm,
    payment_date: paymentDate,
    due_date: paymentDate,
    deposit_amount: 0,
    order_id: null,
    counterparty_name: label,
    memo: label,
    created_by: adminUserId,
  }

  const { data: inserted, error } = await supabase.from('payments').insert(payload).select('id').maybeSingle()

  if (error) {
    const code = (error as { code?: string }).code
    if (code === '23505') return
    console.error('[platform storefront payment] insert failed', error)
    const logRes = await insertAdminLog(supabase, {
      admin_id: adminUserId,
      tenant_id: order.tenant_id,
      action_type: 'platform_payment_insert_failed',
      target_table: 'payments',
      target_id: null,
      new_value: {
        commerce_order_id: order.id,
        order_number: order.order_number,
        error: error.message,
      },
    })
    if (!logRes.ok) console.error('[platform storefront payment] admin_logs insert failed', logRes.error)
    return
  }

  const payId = (inserted as { id?: string } | null)?.id ?? null
  const okLog = await insertAdminLog(supabase, {
    admin_id: adminUserId,
    tenant_id: order.tenant_id,
    action_type: 'platform_payment_recorded',
    target_table: 'payments',
    target_id: payId,
    new_value: {
      commerce_order_id: order.id,
      amount: amt,
      order_number: order.order_number,
      payer_tenant_id: order.tenant_id,
      payment_id: payId,
    },
  })
  if (!okLog.ok) console.error('[platform storefront payment] platform_payment_recorded log failed', okLog.error)
}

export async function updateCommerceOrderStatus(
  id: string,
  status: string,
  expectedCurrentStatus: string,
): Promise<ActionResult<void>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const oid = String(id ?? '').trim()
  if (!oid) return { success: false, error: '주문 ID가 필요합니다' }

  if (!(COMMERCE_ORDER_STATUSES as readonly string[]).includes(status)) {
    return { success: false, error: '유효하지 않은 상태입니다' }
  }
  const nextStatus = status as CommerceOrderStatus

  if (!(COMMERCE_ORDER_STATUSES as readonly string[]).includes(expectedCurrentStatus)) {
    return { success: false, error: '유효하지 않은 현재 상태입니다' }
  }
  const expected = expectedCurrentStatus as CommerceOrderStatus

  const { data: row, error: fetchErr } = await supabase
    .from('commerce_orders')
    .select(
      'id, tenant_id, status, payment_method, payment_status, order_number, refund_required, refund_pending_at, total_amount',
    )
    .eq('id', oid)
    .maybeSingle()

  if (fetchErr) return { success: false, error: fetchErr.message }
  if (!row) return { success: false, error: '주문을 찾을 수 없습니다' }

  const beforeStatus = row.status as CommerceOrderStatus
  if (beforeStatus !== expected) {
    return { success: false, error: '주문 상태가 변경되었습니다. 새로고침 후 다시 시도해주세요.' }
  }

  const refundRequired = Boolean(row.refund_required)
  const transErr = validateOrderTransition(beforeStatus, nextStatus, refundRequired)
  if (transErr) return { success: false, error: transErr }

  const patch: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  }

  if (nextStatus === 'paid') patch.payment_status = 'paid'
  if (nextStatus === 'refunded') patch.payment_status = 'refunded'

  if (beforeStatus === 'paid' && nextStatus === 'cancelled') {
    patch.refund_required = true
    patch.refund_pending_at = new Date().toISOString()
  }

  if (beforeStatus === 'cancelled' && nextStatus === 'refunded') {
    patch.refund_required = false
    patch.refund_pending_at = null
  }

  const { data: updated, error: upErr } = await supabase
    .from('commerce_orders')
    .update(patch)
    .eq('id', oid)
    .eq('status', beforeStatus)
    .select('id')
    .maybeSingle()

  if (upErr) return { success: false, error: upErr.message }
  if (!updated) {
    return { success: false, error: '주문 상태가 변경되었습니다. 새로고침 후 다시 시도해주세요.' }
  }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: row.tenant_id,
    action_type: 'commerce_order_status_changed',
    target_table: 'commerce_orders',
    target_id: oid,
    new_value: {
      order_id: oid,
      order_number: row.order_number ?? null,
      before_status: beforeStatus,
      after_status: nextStatus,
      payment_method: row.payment_method,
    },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  if (nextStatus === 'paid') {
    await tryRecordPlatformReceivablePayment(supabase, auth.ctx.user_id, {
      id: oid,
      tenant_id: String(row.tenant_id),
      order_number: (row.order_number as string | null) ?? null,
      total_amount: Number((row as { total_amount?: number }).total_amount ?? 0),
      payment_method: String(row.payment_method ?? ''),
    })
    await createCommerceOrderAllocations(oid)
  }

  if (nextStatus === 'cancelled') {
    await cancelPendingCommerceOrderAllocationsForOrder(supabase, oid, auth.ctx.user_id)
    const recordPaymentReversal = String(row.payment_status ?? '') === 'paid'
    await processCommerceOrderCancelledAccountingP0(supabase, {
      commerce_order_id: oid,
      tenant_id: (row.tenant_id as string | null) ?? null,
      admin_user_id: auth.ctx.user_id,
      record_payment_reversal: recordPaymentReversal,
    })
  }

  if (nextStatus === 'refunded') {
    const paymentStatusAfter = 'refunded'
    let existingReversalExists = false
    const { data: inboundOrig } = await supabase
      .from('payments')
      .select('id')
      .eq('commerce_order_id', oid)
      .eq('direction', 'inbound')
      .is('reversal_of_id', null)

    const origPaymentIds = (inboundOrig ?? [])
      .map((r: { id: string }) => String(r.id ?? '').trim())
      .filter(Boolean)
    if (origPaymentIds.length) {
      const { data: revChild } = await supabase
        .from('payments')
        .select('id')
        .in('reversal_of_id', origPaymentIds)
        .limit(1)
      existingReversalExists = Boolean(revChild?.length)
    }

    const refundedLog = await insertAdminLog(supabase, {
      admin_id: auth.ctx.user_id,
      tenant_id: row.tenant_id,
      action_type: 'commerce_order_refunded',
      target_table: 'commerce_orders',
      target_id: oid,
      new_value: {
        commerce_order_id: oid,
        payment_status: paymentStatusAfter,
        refund_required: refundRequired,
        existing_reversal_exists: existingReversalExists,
      },
    })
    if (!refundedLog.ok && process.env.NODE_ENV === 'development') {
      console.warn('[commerce_order_refunded]', refundedLog.error)
    }

    const { data: paidPayables } = await supabase
      .from('supplier_payables')
      .select('id, payable_amount')
      .eq('commerce_order_id', oid)
      .eq('status', 'paid')

    for (const p of paidPayables ?? []) {
      const pid = String((p as { id: string }).id ?? '').trim()
      if (!pid) continue
      const warnLog = await insertAdminLog(supabase, {
        admin_id: auth.ctx.user_id,
        tenant_id: row.tenant_id,
        action_type: 'commerce_refund_paid_payable_exists',
        target_table: 'supplier_payables',
        target_id: pid,
        new_value: {
          commerce_order_id: oid,
          payable_id: pid,
          payable_amount: Number((p as { payable_amount?: number }).payable_amount ?? 0),
        },
      })
      if (!warnLog.ok && process.env.NODE_ENV === 'development') {
        console.warn('[commerce_refund_paid_payable_exists]', warnLog.error)
      }
    }
  }

  revalidatePath('/admin/commerce/orders')
  return { success: true }
}

export async function reorderCategory(
  id: string,
  direction: 'up' | 'down',
  siblings: { id: string; sort_order: number }[],
): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServer()
  const idx = siblings.findIndex((s) => s.id === id)
  if (idx < 0) return { success: false, error: '항목을 찾을 수 없습니다' }
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= siblings.length) return { success: false, error: '이미 끝입니다' }

  const a = siblings[idx]
  const b = siblings[swapIdx]

  // a의 sort_order를 b값으로, b의 sort_order를 a값으로 교체
  // 같은 값이면 인덱스로 강제 부여
  const orderA = a.sort_order === b.sort_order ? idx : a.sort_order
  const orderB = a.sort_order === b.sort_order ? swapIdx : b.sort_order

  const r1 = await supabase
    .from('product_categories')
    .update({ sort_order: orderB })
    .eq('id', a.id)

  if (r1.error) return { success: false, error: r1.error.message }

  const r2 = await supabase
    .from('product_categories')
    .update({ sort_order: orderA })
    .eq('id', b.id)

  if (r2.error) return { success: false, error: r2.error.message }

  revalidatePath('/admin/commerce/categories')
  return { success: true, data: null }
}

/**
 * Listing 삭제 — 물리 삭제가 아닌 soft delete(`deleted_at`)로 처리한다.
 * getListings 등 조회 경로가 모두 `deleted_at IS NULL`을 걸고 있어 목록에서는 동일하게 사라진다.
 */
export async function deleteListing(id: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const listing_id = String(id ?? '').trim()
  if (!listing_id) return { success: false, error: 'Listing ID가 필요합니다' }

  const { data: row, error: fetchErr } = await supabase
    .from('commerce_product_listings')
    .select('id, status, tenant_id')
    .eq('id', listing_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (fetchErr) return { success: false, error: fetchErr.message }
  if (!row) return { success: false, error: 'Listing 을 찾을 수 없습니다' }
  if ((row.tenant_id as string) !== PLATFORM_OWNER_TENANT) {
    return { success: false, error: 'Listing 을 찾을 수 없습니다' }
  }

  const deletedAt = new Date().toISOString()

  const { error: delErr } = await supabase
    .from('commerce_product_listings')
    .update({ deleted_at: deletedAt, is_visible: false, updated_at: deletedAt })
    .eq('id', listing_id)
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .is('deleted_at', null)

  if (delErr) return { success: false, error: delErr.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: row.tenant_id as string,
    action_type: 'listing_deleted',
    target_table: 'commerce_product_listings',
    target_id: listing_id,
    old_value: { listing_id, status: row.status, deleted_at: null },
    new_value: { listing_id, deleted_at: deletedAt },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/products')
  return { success: true, data: null }
}

export async function bulkPublishListings(
  ids: string[],
): Promise<{ success: boolean; error?: string }> {
  await requireAdminAuth()
  const supabase = await createSupabaseAdmin()

  if (ids.length === 0) return { success: true }

  const { error } = await supabase
    .from('commerce_product_listings')
    .update({ status: 'visible', is_visible: true })
    .in('id', ids)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/commerce/products')
  return { success: true }
}
