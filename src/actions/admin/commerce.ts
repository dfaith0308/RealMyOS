'use server'

import { revalidatePath } from 'next/cache'
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

function buildPlatformProductDisplayName(
  brand_name: string | null,
  product_name: string,
  spec: string | null,
): string {
  const parts: string[] = []
  const b = brand_name?.trim()
  const n = product_name.trim()
  const sp = spec?.trim()
  if (b) parts.push(b)
  parts.push(n)
  if (sp) parts.push(sp)
  return parts.join(' ')
}

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
      barcode: null,
      ingredients: null,
      item_report_number: null,
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
      spec,
      admin_memo,
      shipping_group_id,
    })
    .select('id')
    .single()

  if (lErr || !insertedListing) {
    await supabase.from('product_costs').delete().eq('product_id', product_id)
    await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', product_id)
    return { success: false, error: lErr?.message ?? 'Listing 저장 실패' }
  }

  const listing_id = insertedListing.id as string

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
  listing_title: string
  quantity: number
  unit_price: number
  total_price: number
}

export type CommerceOrderDetail = Omit<CommerceOrderSummaryRow, 'items_count'> & {
  source: string
  rfq_request_id: string | null
  items: CommerceOrderItemRow[]
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
      commerce_order_items ( listing_title, quantity, unit_price, total_price )
    `,
    )
    .eq('id', oid)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!row) return { success: false, error: '주문을 찾을 수 없습니다' }

  const rawItems = (row as any).commerce_order_items as CommerceOrderItemRow[] | undefined
  const items = (Array.isArray(rawItems) ? rawItems : []).map((it) => ({
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
      'id, tenant_id, status, payment_method, payment_status, order_number, refund_required, refund_pending_at',
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

  revalidatePath('/admin/commerce/orders')
  return { success: true }
}
