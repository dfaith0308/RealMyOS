'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

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
    tenant_id?: string | null
    action_type: string
    reason?: string | null
    target_table?: string | null
    target_id?: string | null
    old_value?: unknown
    new_value?: unknown
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('admin_logs').insert({
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

export type CommerceListingRow = {
  id: string
  tenant_id: string
  product_id: string | null
  commerce_price: number
  status: ListingStatus
  is_visible: boolean
  created_at: string
  products: { name: string | null; category_id: string | null } | null
}

export type ProductPickRow = {
  id: string
  name: string | null
  category_id: string | null
  tenant_id: string
  selling_price: number | null
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
      status,
      is_visible,
      created_at,
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

  const listings = (data ?? []).map((row: any) => ({
    ...row,
    products: Array.isArray(row.products) ? row.products[0] ?? null : row.products ?? null,
  })) as CommerceListingRow[]

  return { success: true, data: { listings } }
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
}): Promise<ActionResult<{ listing_id: string }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const product_id = String(input.product_id ?? '').trim()
  if (!product_id) return { success: false, error: '상품을 선택해 주세요' }

  const price = input.commerce_price
  if (!Number.isFinite(price) || !Number.isInteger(price) || price <= 0) {
    return { success: false, error: '가격은 1원 이상의 정수여야 합니다' }
  }

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
      status: 'draft',
      is_visible: false,
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
    new_value: { listing_id, product_id },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/products')
  return { success: true, data: { listing_id } }
}

export async function getProducts(search?: string): Promise<ActionResult<{ products: ProductPickRow[] }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const { data: listedRows, error: lErr } = await supabase
    .from('commerce_product_listings')
    .select('product_id')
    .eq('owner_type', 'platform')
    .is('deleted_at', null)

  if (lErr) return { success: false, error: lErr.message }

  const listedIds = new Set(
    (listedRows ?? []).map((r: { product_id: string | null }) => r.product_id).filter(Boolean) as string[],
  )

  let q = supabase
    .from('products')
    .select('id, name, category_id, tenant_id, selling_price')
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(500)

  const term = search?.trim()
  if (term) q = q.ilike('name', `%${term}%`)

  const { data: products, error: pErr } = await q
  if (pErr) return { success: false, error: pErr.message }

  const filtered = (products ?? []).filter((p: { id: string }) => !listedIds.has(p.id)) as ProductPickRow[]

  return { success: true, data: { products: filtered } }
}
