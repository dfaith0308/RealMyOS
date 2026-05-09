'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import {
  COMMERCE_ORDER_STATUSES,
  COMMERCE_PAYMENT_METHODS,
  type CommerceOrderStatus,
  type CommercePaymentMethod,
} from '@/lib/commerce-constants'
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
  thumbnail_url: string | null
  image_urls: string[] | null
  description: string | null
  products: { name: string | null; category_id: string | null } | null
}

export type ProductPickRow = {
  id: string
  name: string | null
  category_id: string | null
  tenant_id: string
  selling_price: number | null
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
      status,
      is_visible,
      created_at,
      thumbnail_url,
      image_urls,
      description,
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
    thumbnail_url: row.thumbnail_url ?? null,
    image_urls: row.image_urls ?? null,
    description: row.description ?? null,
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
  thumbnail_url?: string | null
  description?: string | null
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
    new_value: { listing_id, product_id, thumbnail_url, description },
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

  const term = search?.trim()

  let q = supabase
    .from('products')
    .select('id, name, category_id, tenant_id, selling_price')
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
      selling_price: (p.selling_price as number | null) ?? null,
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
