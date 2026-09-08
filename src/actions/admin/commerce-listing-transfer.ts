'use server'

// ============================================================
// 리스팅 판매자 이관 (플랫폼 직판 → 외부 공급자)
//
// 식당이 보는 상품은 commerce_product_listings 행이고, 식당OS 재주문 목록의
// 중복제거 키는 listing_id 하나뿐이다
// (restaurant-os src/actions/buy.ts getRecentOrderItems 의 seen.add(lid)).
// 따라서 리스팅을 지우고 다시 만들면 listing_id 가 바뀌어 식당의 재주문 이력과
// 가격 이력이 그 지점에서 끊긴다.
//
// 이 파일은 리스팅 행을 그대로 두고 소유 컬럼만 제자리에서 갱신한다.
//   owner_type       → 'approved_supplier'
//   owner_tenant_id  → 새 공급자 tenant
//   supplier_tenant_id → 새 공급자 tenant
//
// id / product_id / tenant_id 는 건드리지 않는다. 과거 commerce_order_items 도
// 손대지 않는다 — 주문 라인은 listing_id 와 당시 스냅샷(listing_title, unit_price)을
// 이미 들고 있어 이관 후에도 그대로 읽힌다.
// ============================================================

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

const PLATFORM_OWNER_TENANT = '00000000-0000-0000-0000-000000000000'

/**
 * 아직 allocation 이 만들어지지 않았고, 앞으로 'paid' 로 넘어가면서 정산이 생길 수 있는
 * 주문 상태. commerce.ts updateCommerceOrderStatus 는 nextStatus==='paid' 일 때
 * createCommerceOrderAllocations 를 부르고, 그 시점의 리스팅 소유자를 읽는다.
 */
const SETTLEMENT_PENDING_ORDER_STATUSES = ['pending_payment'] as const

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireAdmin(supabase: any) {
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false as const, error: '로그인 필요' }
  if (ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

/** admin_logs 는 append-only 로만 쓴다. 기존 행은 수정하지 않는다. */
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

export type ListingTransferBlocker = {
  order_id: string
  order_number: string | null
  status: string
  payment_status: string
  commerce_order_item_id: string
}

export type ListingTransferPreview = {
  listing_id: string
  listing_title: string | null
  product_id: string | null
  /** 리스팅이 가리키는 products 행의 tenant. 이관해도 이 값은 바뀌지 않는다. */
  product_tenant_id: string | null
  current_owner_type: string
  current_owner_tenant_id: string
  current_owner_name: string | null
  current_supplier_tenant_id: string | null
  /** 이 리스팅으로 팔린 주문 라인 수 (과거 데이터 — 이관해도 건드리지 않는다) */
  order_item_count: number
  /** 이미 정산(allocation)이 만들어져 소급 변경이 불가능한 주문 라인 수 */
  settled_order_item_count: number
  /**
   * 아직 정산이 만들어지지 않았고 앞으로 'paid' 가 되면 새 공급자에게 귀속될 주문.
   * 비어 있지 않으면 이관을 거부한다.
   */
  blockers: ListingTransferBlocker[]
}

export type ListingTransferResult = {
  listing_id: string
  from: { owner_type: string; owner_tenant_id: string; supplier_tenant_id: string | null }
  to: { owner_type: string; owner_tenant_id: string; supplier_tenant_id: string }
}

type ListingRow = {
  id: string
  tenant_id: string
  product_id: string | null
  owner_type: string
  owner_tenant_id: string
  supplier_tenant_id: string | null
  brand_name: string | null
  deleted_at: string | null
}

/**
 * 리스팅 1건과 그 이관 영향도를 읽는다. 실행 전 확인 단계와 실행 경로가 같은 근거를 쓴다.
 * 모든 조회는 PLATFORM_OWNER_TENANT 로 스코핑한다.
 */
async function loadTransferContext(
  supabase: any,
  listing_id: string,
): Promise<{ ok: true; listing: ListingRow; preview: ListingTransferPreview } | { ok: false; error: string }> {
  const { data: listing, error: lErr } = await supabase
    .from('commerce_product_listings')
    .select('id, tenant_id, product_id, owner_type, owner_tenant_id, supplier_tenant_id, brand_name, deleted_at')
    .eq('id', listing_id)
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .is('deleted_at', null)
    .maybeSingle()

  if (lErr) return { ok: false, error: lErr.message }
  if (!listing) return { ok: false, error: 'Listing 을 찾을 수 없습니다' }

  const row = listing as ListingRow

  // 리스팅이 가리키는 products 의 tenant — 이관해도 그대로 남는다. 화면에 그대로 보여준다.
  let product_tenant_id: string | null = null
  if (row.product_id) {
    const { data: prod, error: pErr } = await supabase
      .from('products')
      .select('tenant_id')
      .eq('id', row.product_id)
      .maybeSingle()
    if (pErr) return { ok: false, error: pErr.message }
    product_tenant_id = (prod?.tenant_id as string | null) ?? null
  }

  const { data: ownerTenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', row.owner_tenant_id)
    .maybeSingle()

  // 이 리스팅으로 팔린 주문 라인 — 과거 데이터는 읽기만 한다.
  const { data: items, error: iErr } = await supabase
    .from('commerce_order_items')
    .select('id, order_id, listing_title')
    .eq('listing_id', listing_id)

  if (iErr) return { ok: false, error: iErr.message }
  const itemRows = (items ?? []) as { id: string; order_id: string; listing_title: string | null }[]

  let settled_order_item_count = 0
  const blockers: ListingTransferBlocker[] = []

  if (itemRows.length > 0) {
    const itemIds = itemRows.map((r) => r.id)
    const { data: allocs, error: aErr } = await supabase
      .from('commerce_order_allocations')
      .select('commerce_order_item_id')
      .in('commerce_order_item_id', itemIds)

    if (aErr) return { ok: false, error: aErr.message }
    const allocatedItemIds = new Set(
      (allocs ?? []).map((a: { commerce_order_item_id: string }) => a.commerce_order_item_id),
    )
    settled_order_item_count = allocatedItemIds.size

    const unallocated = itemRows.filter((r) => !allocatedItemIds.has(r.id))
    if (unallocated.length > 0) {
      const orderIds = [...new Set(unallocated.map((r) => r.order_id))]
      const { data: orders, error: oErr } = await supabase
        .from('commerce_orders')
        .select('id, order_number, status, payment_status')
        .in('id', orderIds)

      if (oErr) return { ok: false, error: oErr.message }
      const orderMap = new Map(
        ((orders ?? []) as { id: string; order_number: string | null; status: string; payment_status: string }[]).map(
          (o) => [o.id, o],
        ),
      )

      for (const r of unallocated) {
        const o = orderMap.get(r.order_id)
        if (!o) continue
        if (!(SETTLEMENT_PENDING_ORDER_STATUSES as readonly string[]).includes(o.status)) continue
        blockers.push({
          order_id: o.id,
          order_number: o.order_number,
          status: o.status,
          payment_status: o.payment_status,
          commerce_order_item_id: r.id,
        })
      }
    }
  }

  return {
    ok: true,
    listing: row,
    preview: {
      listing_id: row.id,
      listing_title: itemRows[0]?.listing_title ?? row.brand_name ?? null,
      product_id: row.product_id,
      product_tenant_id,
      current_owner_type: row.owner_type,
      current_owner_tenant_id: row.owner_tenant_id,
      current_owner_name: (ownerTenant?.name as string | null) ?? null,
      current_supplier_tenant_id: row.supplier_tenant_id,
      order_item_count: itemRows.length,
      settled_order_item_count,
      blockers,
    },
  }
}

/**
 * 실행 전 확인 단계용 — 이관하면 무엇이 바뀌고 무엇이 막히는지 미리 보여준다.
 * 아무것도 쓰지 않는다.
 */
export async function getListingTransferPreview(
  listing_id: string,
): Promise<ActionResult<ListingTransferPreview>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const lid = String(listing_id ?? '').trim()
  if (!UUID_RE.test(lid)) return { success: false, error: 'Listing ID 가 올바르지 않습니다' }

  const ctx = await loadTransferContext(supabase, lid)
  if (!ctx.ok) return { success: false, error: ctx.error }
  return { success: true, data: ctx.preview }
}

/** 이관 대상으로 고를 수 있는 공급자 목록. */
export async function getTransferableSuppliers(): Promise<
  ActionResult<{ suppliers: { id: string; name: string }[] }>
> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('role', 'supplier')
    .eq('is_active', true)
    .is('deleted_at', null)
    .neq('id', PLATFORM_OWNER_TENANT)
    .order('name', { ascending: true })

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: {
      suppliers: ((data ?? []) as { id: string; name: string | null }[]).map((t) => ({
        id: t.id,
        name: t.name ?? t.id.slice(0, 8),
      })),
    },
  }
}

/**
 * 리스팅의 판매자를 교체한다. 행을 지우고 다시 만들지 않고 제자리에서 갱신하므로
 * listing_id 가 보존되고, 식당의 재주문 이력·가격 이력이 끊기지 않는다.
 */
export async function transferListingSupplier(input: {
  listing_id: string
  supplier_tenant_id: string
  reason?: string | null
}): Promise<ActionResult<ListingTransferResult>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const lid = String(input.listing_id ?? '').trim()
  const nextSupplierId = String(input.supplier_tenant_id ?? '').trim()

  if (!UUID_RE.test(lid)) return { success: false, error: 'Listing ID 가 올바르지 않습니다' }
  if (!UUID_RE.test(nextSupplierId)) return { success: false, error: '공급자를 선택해 주세요' }
  if (nextSupplierId === PLATFORM_OWNER_TENANT) {
    return { success: false, error: '플랫폼 자신에게는 이관할 수 없습니다' }
  }

  const ctx = await loadTransferContext(supabase, lid)
  if (!ctx.ok) return { success: false, error: ctx.error }
  const { listing, preview } = ctx

  if (listing.owner_tenant_id === nextSupplierId && listing.supplier_tenant_id === nextSupplierId) {
    return { success: false, error: '이미 이 공급자의 상품입니다' }
  }

  const { data: target, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, role, is_active, deleted_at')
    .eq('id', nextSupplierId)
    .maybeSingle()

  if (tErr) return { success: false, error: tErr.message }
  if (!target || target.deleted_at || target.is_active === false) {
    return { success: false, error: '이관 대상 공급자를 찾을 수 없습니다' }
  }
  if (target.role !== 'supplier') {
    return { success: false, error: '공급자 tenant 가 아닙니다' }
  }

  // 정산 소급 방지 — 아직 allocation 이 없고 앞으로 'paid' 가 될 수 있는 주문이 남아 있으면
  // 이관을 거부한다. 그대로 진행하면 이관 전에 들어온 주문의 정산이 새 공급자에게 귀속된다.
  if (preview.blockers.length > 0) {
    const labels = preview.blockers
      .map((b) => b.order_number ?? b.order_id.slice(0, 8))
      .join(', ')
    return {
      success: false,
      error:
        `정산이 확정되지 않은 주문이 ${preview.blockers.length}건 남아 있어 이관할 수 없습니다 (${labels}). ` +
        '이 주문들이 결제 완료되면 이관 전 주문인데도 새 공급자에게 정산됩니다. ' +
        '해당 주문을 결제 완료 또는 취소로 정리한 뒤 다시 시도해 주세요.',
    }
  }

  const from = {
    owner_type: listing.owner_type,
    owner_tenant_id: listing.owner_tenant_id,
    supplier_tenant_id: listing.supplier_tenant_id,
  }
  const to = {
    owner_type: 'approved_supplier',
    owner_tenant_id: nextSupplierId,
    supplier_tenant_id: nextSupplierId,
  }

  // 제자리 UPDATE — id / product_id / tenant_id 는 payload 에 넣지 않는다.
  // 조회 조건에 현재 소유자를 함께 걸어, 그 사이 다른 관리자가 바꿨으면 덮어쓰지 않는다.
  const { data: updated, error: uErr } = await supabase
    .from('commerce_product_listings')
    .update({
      owner_type: to.owner_type,
      owner_tenant_id: to.owner_tenant_id,
      supplier_tenant_id: to.supplier_tenant_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lid)
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .eq('owner_tenant_id', from.owner_tenant_id)
    .is('deleted_at', null)
    .select('id, owner_type, owner_tenant_id, supplier_tenant_id, product_id')
    .maybeSingle()

  if (uErr) return { success: false, error: uErr.message }
  if (!updated) {
    return { success: false, error: '이관 중 리스팅이 변경되었습니다. 새로고침 후 다시 시도해 주세요' }
  }
  if (updated.id !== lid) {
    return { success: false, error: 'listing_id 가 보존되지 않았습니다. 이관을 중단합니다' }
  }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: nextSupplierId,
    action_type: 'listing_supplier_transferred',
    reason: (input.reason ?? '').trim() || null,
    target_table: 'commerce_product_listings',
    target_id: lid,
    old_value: {
      listing_id: lid,
      owner_type: from.owner_type,
      owner_tenant_id: from.owner_tenant_id,
      supplier_tenant_id: from.supplier_tenant_id,
      owner_name: preview.current_owner_name,
    },
    new_value: {
      listing_id: lid,
      owner_type: to.owner_type,
      owner_tenant_id: to.owner_tenant_id,
      supplier_tenant_id: to.supplier_tenant_id,
      owner_name: (target.name as string | null) ?? null,
      // product_id 는 이관 대상이 아니다. 어디를 가리킨 채 넘어갔는지 기록만 남긴다.
      product_id_unchanged: updated.product_id,
      product_tenant_id: preview.product_tenant_id,
      settled_order_item_count: preview.settled_order_item_count,
      order_item_count: preview.order_item_count,
    },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/products')
  revalidatePath('/admin/commerce/allocations')

  return { success: true, data: { listing_id: lid, from, to } }
}
