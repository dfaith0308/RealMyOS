'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

const PLATFORM_OWNER_TENANT = '00000000-0000-0000-0000-000000000000'

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

/** `admin_settings.platform_fee_rate` 정수 퍼센트(예: 3 = 3%). 파싱 실패 시 0. */
async function loadPlatformFeePercentNumerator(supabase: any): Promise<number> {
  const { data, error } = await supabase.from('admin_settings').select('value').eq('key', 'platform_fee_rate').maybeSingle()
  if (error) return 0
  const n = Number((data as { value?: unknown } | null)?.value)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

type ListingRow = {
  id: string
  supplier_tenant_id: string | null
  owner_type: string
  owner_tenant_id: string
  product_id: string | null
}

async function fetchUserDisplayMap(supabase: any, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.map((x) => String(x ?? '').trim()).filter(Boolean))]
  if (!ids.length) return new Map()
  const { data, error } = await supabase.from('users').select('id, email').in('id', ids)
  if (error || !data) return new Map()
  const m = new Map<string, string>()
  for (const u of data as { id: string; email?: string | null }[]) {
    const em = u.email != null ? String(u.email).trim() : ''
    m.set(u.id, em || `${u.id.slice(0, 8)}…`)
  }
  return m
}

/**
 * storefront 주문이 취소될 때 **pending** allocation만 `cancelled`로 바꾸고 audit 기록.
 * `confirmed` 행은 갱신하지 않음(cancelled_at 미기록).
 */
export async function cancelPendingCommerceOrderAllocationsForOrder(
  supabase: any,
  commerce_order_id: string,
  admin_user_id: string,
): Promise<void> {
  const oid = String(commerce_order_id ?? '').trim()
  if (!oid || !admin_user_id) return
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('commerce_order_allocations')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by: admin_user_id,
      updated_at: now,
    })
    .eq('commerce_order_id', oid)
    .eq('status', 'pending')

  if (error) {
    await insertAdminLog(supabase, {
      admin_id: admin_user_id,
      action_type: 'commerce_allocation_cancel_failed',
      target_table: 'commerce_orders',
      target_id: oid,
      new_value: { error: error.message },
    }).catch(() => {})
    return
  }

  revalidatePath('/admin/commerce/allocations')
  revalidatePath('/admin/commerce/orders')
}

function resolveSupplierTenantId(listing: ListingRow, product: { tenant_id: string } | null): string | null {
  const P = PLATFORM_OWNER_TENANT
  if (listing.supplier_tenant_id && listing.supplier_tenant_id !== P) return listing.supplier_tenant_id
  if (listing.owner_type === 'approved_supplier' && listing.owner_tenant_id && listing.owner_tenant_id !== P) {
    return listing.owner_tenant_id
  }
  if (product?.tenant_id && product.tenant_id !== P) return product.tenant_id
  return null
}

export type CommerceAllocationListRow = {
  id: string
  commerce_order_id: string
  order_number: string | null
  commerce_order_item_id: string
  supplier_tenant_id: string
  supplier_name: string | null
  item_amount: number
  platform_fee_rate: number
  platform_fee_amount: number
  supplier_payable_amount: number
  status: string
  created_at: string
  cancelled_at: string | null
  cancelled_by: string | null
  /** `users` 조회 성공 시 표시용(실패 시 null — UUID는 cancelled_by 에 유지) */
  cancelled_by_display: string | null
  /** `supplier_payables` (PLATFORM-ERP-P2-003), 없으면 null */
  supplier_payable_id: string | null
  supplier_payable_status: string | null
}

export type SupplierPayableSummaryRow = {
  supplier_tenant_id: string
  supplier_name: string | null
  pending_payable: number
  confirmed_payable: number
}

export async function createCommerceOrderAllocations(commerce_order_id: string): Promise<ActionResult<{ created: number; skipped: number }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const oid = String(commerce_order_id ?? '').trim()
  if (!oid) return { success: false, error: '주문 ID가 필요합니다' }

  const { data: order, error: oErr } = await supabase
    .from('commerce_orders')
    .select('id, tenant_id, payment_status, order_number')
    .eq('id', oid)
    .maybeSingle()

  if (oErr) return { success: false, error: oErr.message }
  if (!order) return { success: false, error: '주문을 찾을 수 없습니다' }
  if (order.payment_status !== 'paid') {
    return { success: false, error: 'payment_status가 paid일 때만 allocation을 생성할 수 있습니다' }
  }

  const { data: items, error: iErr } = await supabase
    .from('commerce_order_items')
    .select('id, listing_id, quantity, unit_price, total_price')
    .eq('order_id', oid)

  if (iErr) return { success: false, error: iErr.message }
  const itemRows = (items ?? []) as {
    id: string
    listing_id: string
    quantity: number
    unit_price: number
    total_price: number
  }[]

  if (itemRows.length === 0) {
    const logRes = await insertAdminLog(supabase, {
      admin_id: auth.ctx.user_id,
      tenant_id: order.tenant_id,
      action_type: 'commerce_allocation_failed',
      target_table: 'commerce_orders',
      target_id: oid,
      new_value: { reason: 'no_order_items', order_number: order.order_number },
    })
    if (!logRes.ok) return { success: false, error: `allocation 실패 로그 기록 실패: ${logRes.error}` }
    return { success: false, error: '주문 품목이 없어 allocation을 만들 수 없습니다' }
  }

  const { data: existing, error: exErr } = await supabase
    .from('commerce_order_allocations')
    .select('commerce_order_item_id')
    .eq('commerce_order_id', oid)

  if (exErr) return { success: false, error: exErr.message }
  const existingItemIds = new Set((existing ?? []).map((r: { commerce_order_item_id: string }) => r.commerce_order_item_id))

  const toProcess = itemRows.filter((it) => !existingItemIds.has(it.id))
  const skipped = itemRows.length - toProcess.length
  if (toProcess.length === 0) {
    return { success: true, data: { created: 0, skipped } }
  }

  const listingIds = [...new Set(toProcess.map((t) => t.listing_id))]
  const { data: listings, error: lErr } = await supabase
    .from('commerce_product_listings')
    .select('id, supplier_tenant_id, owner_type, owner_tenant_id, product_id')
    .in('id', listingIds)

  if (lErr) return { success: false, error: lErr.message }
  const listingMap = new Map((listings ?? []).map((l: ListingRow) => [l.id, l as ListingRow]))

  const productIds = [
    ...new Set(
      (listings ?? [])
        .map((l: ListingRow) => l.product_id)
        .filter((x): x is string => typeof x === 'string' && x.length > 0),
    ),
  ]
  const productMap = new Map<string, { tenant_id: string }>()
  if (productIds.length) {
    const { data: products, error: pErr } = await supabase.from('products').select('id, tenant_id').in('id', productIds)
    if (pErr) return { success: false, error: pErr.message }
    for (const p of (products ?? []) as { id: string; tenant_id: string }[]) {
      productMap.set(p.id, { tenant_id: p.tenant_id })
    }
  }

  const feeNum = await loadPlatformFeePercentNumerator(supabase)
  const feeRateDecimal = Number((feeNum / 100).toFixed(4))

  type Planned = {
    commerce_order_item_id: string
    supplier_tenant_id: string
    item_amount: number
    platform_fee_rate: number
    platform_fee_amount: number
    supplier_payable_amount: number
  }

  const planned: Planned[] = []
  const resolutionErrors: { item_id: string; listing_id: string; reason: string }[] = []

  for (const it of toProcess) {
    const listing = listingMap.get(it.listing_id)
    if (!listing) {
      resolutionErrors.push({ item_id: it.id, listing_id: it.listing_id, reason: 'listing_not_found' })
      continue
    }
    const product = listing.product_id ? productMap.get(listing.product_id) ?? null : null
    const supplierId = resolveSupplierTenantId(listing, product)
    if (!supplierId) {
      resolutionErrors.push({ item_id: it.id, listing_id: it.listing_id, reason: 'supplier_unresolved' })
      continue
    }

    const item_amount =
      typeof it.total_price === 'number' && Number.isFinite(it.total_price) && it.total_price >= 0
        ? it.total_price
        : Math.max(0, Math.round((it.unit_price ?? 0) * (it.quantity ?? 0)))

    const platform_fee_amount = Math.round((item_amount * feeNum) / 100)
    const supplier_payable_amount = item_amount - platform_fee_amount
    if (supplier_payable_amount < 0 || platform_fee_amount < 0) {
      resolutionErrors.push({ item_id: it.id, listing_id: it.listing_id, reason: 'invalid_amounts' })
      continue
    }

    planned.push({
      commerce_order_item_id: it.id,
      supplier_tenant_id: supplierId,
      item_amount,
      platform_fee_rate: feeRateDecimal,
      platform_fee_amount,
      supplier_payable_amount,
    })
  }

  if (resolutionErrors.length || planned.length !== toProcess.length) {
    const logRes = await insertAdminLog(supabase, {
      admin_id: auth.ctx.user_id,
      tenant_id: order.tenant_id,
      action_type: 'commerce_allocation_failed',
      target_table: 'commerce_orders',
      target_id: oid,
      new_value: {
        order_number: order.order_number,
        errors: resolutionErrors,
        fee_percent_numerator: feeNum,
        expected_items: toProcess.length,
        planned_items: planned.length,
      },
    })
    if (!logRes.ok) return { success: false, error: `allocation 실패 로그 기록 실패: ${logRes.error}` }
    return {
      success: false,
      error: `공급자 식별 또는 금액 계산 실패 (${resolutionErrors.length || toProcess.length - planned.length}건). listing에 supplier_tenant_id 설정 또는 approved_supplier / 상품 tenant를 확인하세요.`,
    }
  }

  const insertedIds: string[] = []
  try {
    for (const row of planned) {
      const payload = {
        commerce_order_id: oid,
        commerce_order_item_id: row.commerce_order_item_id,
        supplier_tenant_id: row.supplier_tenant_id,
        item_amount: row.item_amount,
        platform_fee_rate: row.platform_fee_rate,
        platform_fee_amount: row.platform_fee_amount,
        supplier_payable_amount: row.supplier_payable_amount,
        status: 'pending' as const,
      }
      const { data: ins, error: insErr } = await supabase.from('commerce_order_allocations').insert(payload).select('id').maybeSingle()
      if (insErr || !ins?.id) {
        if (insertedIds.length) {
          await supabase.from('commerce_order_allocations').delete().in('id', insertedIds)
        }
        const logRes = await insertAdminLog(supabase, {
          admin_id: auth.ctx.user_id,
          tenant_id: order.tenant_id,
          action_type: 'commerce_allocation_failed',
          target_table: 'commerce_orders',
          target_id: oid,
          new_value: {
            order_number: order.order_number,
            reason: 'insert_failed',
            message: insErr?.message ?? 'no id',
            rolled_back_ids: insertedIds,
          },
        })
        if (!logRes.ok) return { success: false, error: logRes.error }
        return { success: false, error: insErr?.message ?? 'allocation INSERT 실패' }
      }
      insertedIds.push(ins.id as string)
    }
  } catch (e) {
    if (insertedIds.length) await supabase.from('commerce_order_allocations').delete().in('id', insertedIds)
    const msg = e instanceof Error ? e.message : String(e)
    await insertAdminLog(supabase, {
      admin_id: auth.ctx.user_id,
      tenant_id: order.tenant_id,
      action_type: 'commerce_allocation_failed',
      target_table: 'commerce_orders',
      target_id: oid,
      new_value: { order_number: order.order_number, reason: 'exception', message: msg },
    })
    return { success: false, error: msg }
  }

  if (planned.length > 0) {
    const logOk = await insertAdminLog(supabase, {
      admin_id: auth.ctx.user_id,
      tenant_id: order.tenant_id,
      action_type: 'commerce_allocation_created',
      target_table: 'commerce_orders',
      target_id: oid,
      new_value: {
        order_number: order.order_number,
        created: planned.length,
        skipped,
        allocation_ids: insertedIds,
      },
    })
    if (!logOk.ok) return { success: false, error: `allocation 성공 후 로그 실패: ${logOk.error}` }
  }

  revalidatePath('/admin/commerce/orders')
  revalidatePath('/admin/commerce/allocations')
  return { success: true, data: { created: planned.length, skipped } }
}

export type ConfirmAllocationPayableData = {
  payable_linked: boolean
  supplier_payable_id: string | null
  /** allocation 확정은 되었으나 원장 INSERT 실패 등 */
  payable_error?: string
}

export async function createSupplierPayableFromAllocation(allocation_id: string): Promise<
  ActionResult<{ payable_id: string | null; created: boolean }>
> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const aid = String(allocation_id ?? '').trim()
  if (!aid) return { success: false, error: 'allocation ID가 필요합니다' }

  const { data: dup, error: dErr } = await supabase
    .from('supplier_payables')
    .select('id')
    .eq('commerce_order_allocation_id', aid)
    .maybeSingle()

  if (dErr) return { success: false, error: dErr.message }
  if (dup?.id) {
    return { success: true, data: { payable_id: dup.id as string, created: false } }
  }

  const { data: a, error: aErr } = await supabase
    .from('commerce_order_allocations')
    .select(
      'id, commerce_order_id, commerce_order_item_id, supplier_tenant_id, item_amount, platform_fee_amount, supplier_payable_amount, status',
    )
    .eq('id', aid)
    .maybeSingle()

  if (aErr) return { success: false, error: aErr.message }
  if (!a) return { success: false, error: 'allocation을 찾을 수 없습니다' }
  if ((a as { status?: string }).status !== 'confirmed') {
    return { success: false, error: 'confirmed allocation만 supplier_payables 원장을 만들 수 있습니다' }
  }

  const now = new Date().toISOString()
  const note = `storefront allocation payable ${aid}`
  const row = a as {
    commerce_order_id: string
    commerce_order_item_id: string
    supplier_tenant_id: string
    item_amount: number
    platform_fee_amount: number
    supplier_payable_amount: number
  }

  const payload = {
    commerce_order_allocation_id: aid,
    commerce_order_id: row.commerce_order_id,
    commerce_order_item_id: row.commerce_order_item_id,
    supplier_tenant_id: row.supplier_tenant_id,
    payer_tenant_id: PLATFORM_OWNER_TENANT,
    payee_tenant_id: row.supplier_tenant_id,
    item_amount: row.item_amount,
    platform_fee_amount: row.platform_fee_amount,
    payable_amount: row.supplier_payable_amount,
    status: 'unpaid' as const,
    confirmed_at: now,
    confirmed_by: auth.ctx.user_id,
    note,
  }

  const { data: ins, error: insErr } = await supabase.from('supplier_payables').insert(payload).select('id').maybeSingle()

  if (insErr) {
    const code = (insErr as { code?: string }).code
    if (code === '23505') {
      const { data: again } = await supabase.from('supplier_payables').select('id').eq('commerce_order_allocation_id', aid).maybeSingle()
      if (again?.id) return { success: true, data: { payable_id: again.id as string, created: false } }
    }
    return { success: false, error: insErr.message }
  }

  const payableId = (ins as { id?: string } | null)?.id ?? null

  const logPay = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: row.supplier_tenant_id,
    action_type: 'supplier_payable_created',
    target_table: 'supplier_payables',
    target_id: payableId,
    new_value: {
      commerce_order_allocation_id: aid,
      commerce_order_id: row.commerce_order_id,
      payable_amount: row.supplier_payable_amount,
    },
  })
  if (!logPay.ok) {
    // 감사 로그만 실패한 경우 — supplier_payables 행은 이미 커밋됨.
  }

  revalidatePath('/admin/commerce/payables')
  return { success: true, data: { payable_id: payableId, created: true } }
}

export async function confirmCommerceAllocation(allocation_id: string): Promise<ActionResult<ConfirmAllocationPayableData>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const aid = String(allocation_id ?? '').trim()
  if (!aid) return { success: false, error: 'allocation ID가 필요합니다' }

  const { data: row, error: fErr } = await supabase
    .from('commerce_order_allocations')
    .select('id, status, commerce_order_id, commerce_orders(tenant_id, order_number)')
    .eq('id', aid)
    .maybeSingle()

  if (fErr) return { success: false, error: fErr.message }
  if (!row) return { success: false, error: 'allocation을 찾을 수 없습니다' }
  if ((row as { status?: string }).status !== 'pending') {
    return { success: false, error: 'pending 상태만 지급 예정 확정할 수 있습니다' }
  }

  const co = (row as { commerce_orders?: { tenant_id?: string; order_number?: string | null } }).commerce_orders
  const tenantId = co?.tenant_id ?? null

  const { data: updated, error: uErr } = await supabase
    .from('commerce_order_allocations')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_by: auth.ctx.user_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', aid)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (uErr) return { success: false, error: uErr.message }
  if (!updated) return { success: false, error: '이미 처리되었거나 상태가 맞지 않습니다' }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: tenantId,
    action_type: 'commerce_allocation_confirmed',
    target_table: 'commerce_order_allocations',
    target_id: aid,
    new_value: { commerce_order_id: (row as { commerce_order_id?: string }).commerce_order_id },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  const payRes = await createSupplierPayableFromAllocation(aid)
  const payload: ConfirmAllocationPayableData = {
    payable_linked: Boolean(payRes.success && payRes.data?.payable_id),
    supplier_payable_id: payRes.success ? (payRes.data?.payable_id ?? null) : null,
  }

  if (!payRes.success) {
    payload.payable_error = payRes.error ?? 'supplier_payables 생성 실패'
    await insertAdminLog(supabase, {
      admin_id: auth.ctx.user_id,
      tenant_id: tenantId,
      action_type: 'supplier_payable_create_failed',
      target_table: 'commerce_order_allocations',
      target_id: aid,
      new_value: { error: payload.payable_error },
    })
  }

  revalidatePath('/admin/commerce/allocations')
  revalidatePath('/admin/commerce/orders')
  revalidatePath('/admin/commerce/payables')
  return { success: true, data: payload }
}

export type CommerceAllocationsAdminPayload = {
  summaries: SupplierPayableSummaryRow[]
  rows: CommerceAllocationListRow[]
}

export async function getCommerceAllocationsAdminData(status: 'all' | 'pending' | 'confirmed' | 'cancelled'): Promise<ActionResult<CommerceAllocationsAdminPayload>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const { data: aggRaw, error: aggErr } = await supabase
    .from('commerce_order_allocations')
    .select('supplier_tenant_id, status, supplier_payable_amount')
    .limit(25000)

  if (aggErr) return { success: false, error: aggErr.message }

  let q = supabase
    .from('commerce_order_allocations')
    .select(
      `
      id,
      commerce_order_id,
      commerce_order_item_id,
      supplier_tenant_id,
      item_amount,
      platform_fee_rate,
      platform_fee_amount,
      supplier_payable_amount,
      status,
      created_at,
      cancelled_at,
      cancelled_by,
      commerce_orders ( order_number )
    `,
    )
    .order('created_at', { ascending: false })
    .limit(2000)

  if (status !== 'all') {
    q = q.eq('status', status)
  }

  const { data, error } = await q
  if (error) return { success: false, error: error.message }

  const raw = (data ?? []) as {
    id: string
    commerce_order_id: string
    commerce_order_item_id: string
    supplier_tenant_id: string
    item_amount: number
    platform_fee_rate: number
    platform_fee_amount: number
    supplier_payable_amount: number
    status: string
    created_at: string
    cancelled_at: string | null
    cancelled_by: string | null
    commerce_orders: { order_number: string | null } | { order_number: string | null }[] | null
  }[]

  const cancelledByIds = [...new Set(raw.map((r) => r.cancelled_by).filter((x): x is string => Boolean(x)))]
  const userDisplayMap = await fetchUserDisplayMap(supabase, cancelledByIds)

  const aggRows = (aggRaw ?? []) as { supplier_tenant_id: string; status: string; supplier_payable_amount: number }[]
  const sumMap = new Map<string, { pending: number; confirmed: number }>()
  for (const r of aggRows) {
    const cur = sumMap.get(r.supplier_tenant_id) ?? { pending: 0, confirmed: 0 }
    if (r.status === 'pending') cur.pending += r.supplier_payable_amount
    if (r.status === 'confirmed') cur.confirmed += r.supplier_payable_amount
    sumMap.set(r.supplier_tenant_id, cur)
  }

  const supplierIds = [...new Set([...aggRows.map((r) => r.supplier_tenant_id), ...raw.map((r) => r.supplier_tenant_id)])]
  const nameMap = new Map<string, string | null>()
  if (supplierIds.length) {
    const { data: tenants, error: tErr } = await supabase.from('tenants').select('id, name').in('id', supplierIds)
    if (tErr) return { success: false, error: tErr.message }
    for (const t of (tenants ?? []) as { id: string; name: string | null }[]) {
      nameMap.set(t.id, t.name ?? null)
    }
  }

  const allocIds = raw.map((r) => r.id)
  const payableByAlloc = new Map<string, { id: string; status: string }>()
  if (allocIds.length) {
    const { data: spRows, error: spErr } = await supabase
      .from('supplier_payables')
      .select('id, commerce_order_allocation_id, status')
      .in('commerce_order_allocation_id', allocIds)
    if (spErr) return { success: false, error: spErr.message }
    for (const p of (spRows ?? []) as { id: string; commerce_order_allocation_id: string; status: string }[]) {
      payableByAlloc.set(p.commerce_order_allocation_id, { id: p.id, status: p.status })
    }
  }

  const rows: CommerceAllocationListRow[] = raw.map((r) => {
    const on = r.commerce_orders
    const order_number = Array.isArray(on) ? on[0]?.order_number ?? null : on?.order_number ?? null
    const sp = payableByAlloc.get(r.id)
    return {
      id: r.id,
      commerce_order_id: r.commerce_order_id,
      order_number,
      commerce_order_item_id: r.commerce_order_item_id,
      supplier_tenant_id: r.supplier_tenant_id,
      supplier_name: nameMap.get(r.supplier_tenant_id) ?? null,
      item_amount: r.item_amount,
      platform_fee_rate: Number(r.platform_fee_rate),
      platform_fee_amount: r.platform_fee_amount,
      supplier_payable_amount: r.supplier_payable_amount,
      status: r.status,
      created_at: r.created_at,
      cancelled_at: r.cancelled_at ?? null,
      cancelled_by: r.cancelled_by ?? null,
      cancelled_by_display: r.cancelled_by ? userDisplayMap.get(r.cancelled_by) ?? null : null,
      supplier_payable_id: sp?.id ?? null,
      supplier_payable_status: sp?.status ?? null,
    }
  })

  const summaries: SupplierPayableSummaryRow[] = [...sumMap.entries()].map(([supplier_tenant_id, v]) => ({
    supplier_tenant_id,
    supplier_name: nameMap.get(supplier_tenant_id) ?? null,
    pending_payable: v.pending,
    confirmed_payable: v.confirmed,
  }))
  summaries.sort((a, b) => (b.pending_payable + b.confirmed_payable) - (a.pending_payable + a.confirmed_payable))

  return { success: true, data: { summaries, rows } }
}
