'use server'

// ============================================================
// 리스팅 판매자 이관 (플랫폼 직판 → 외부 공급자) — P3 방식
//
// 식당이 보는 상품은 commerce_product_listings 행이고, 식당OS 재주문 목록의
// 중복제거 키는 listing_id 하나뿐이다
// (restaurant-os src/actions/buy.ts getRecentOrderItems 의 seen.add(lid)).
// 따라서 리스팅을 지우고 다시 만들면 listing_id 가 바뀌어 식당의 재주문 이력과
// 가격 이력이 그 지점에서 끊긴다. 그래서 리스팅 행은 제자리에서 갱신한다.
//
// [P1 을 폐기하고 P3 로 바꾼 이유]
// P1 은 product_id 를 그대로 둔 채 소유 컬럼만 바꿨다. 그러면 이관 후에도 리스팅이
// 플랫폼 상품을 가리키고, restaurant-os calcCartDiscount(buy.ts:1471)가
//   listing.product_id → product_costs(end_date IS NULL)
// 순서로 원가를 읽기 때문에 디닷페이스 매입가가 새 공급자 상품의 할인 계산 기준이 된다.
// 할인액은 마진율 공식의 연속 함수라 역산으로 매입가가 드러난다.
// 플랫폼 매입가는 어떤 경로로도 다른 tenant 에 닿으면 안 된다.
//
// [P3 가 하는 일]
//   1) 새 공급자 tenant 로 products 행을 새로 만든다 (표시 정보만 복사)
//   2) 새 상품에 product_costs 를 새로 넣는다 (매입가는 화면에서 입력받는다)
//   3) 리스팅의 product_id 를 새 상품으로 교체하고 소유 컬럼을 갱신한다
//   4) 교체 후 listing_id 불변과 product_id 교체를 다시 읽어 확인한다
//
// 이렇게 하면 이관된 리스팅에서 플랫폼 product_costs 로 가는 경로가 구조적으로
// 사라진다 — calcCartDiscount 가 service role 로 읽으므로 RLS 가 아니라
// "리스팅이 그 product_id 를 더 이상 가리키지 않는다"는 사실이 차단 근거다.
//
// id / tenant_id 는 건드리지 않는다. 과거 commerce_order_items 도 손대지 않는다 —
// 주문 라인은 listing_id 와 당시 스냅샷(listing_title, unit_price)을 이미 들고 있어
// 이관 후에도 그대로 읽힌다.
// 옛 플랫폼 products 행과 그 product_costs 는 지우지 않는다. 디닷페이스의 과거
// 원가·마진 기록이다. 대신 다시 리스팅되지 않도록 getProducts 가 이관 이력을 보고
// 걸러낸다 (admin/commerce.ts, LISTING_TRANSFER_ACTION_TYPE 참조).
// ============================================================

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import {
  LISTING_TRANSFER_ACTION_TYPE,
  MAX_BUSINESS_COST_PRICE,
  MAX_COST_PRICE,
  normalizeCostPriceInput,
} from '@/lib/commerce-constants'
import type { ActionResult } from '@/types/order'

const PLATFORM_OWNER_TENANT = '00000000-0000-0000-0000-000000000000'

/**
 * 새 공급자 상품으로 복사할 products 컬럼.
 *
 * 여기 없는 것과 그 이유:
 * - cost_price 계열 : products 에 없다. 원가는 product_costs 로만 관리되고,
 *                     이관 시 반드시 새로 입력받는다 (플랫폼 값 복사 금지).
 * - product_code    : 새로 채번한다 (아래 issueProductCode).
 * - category_id     : product_categories 는 tenant 스코프다(운영 실측: 플랫폼 16행 /
 *                     공급자 13행). 그대로 복사하면 새 상품이 플랫폼 카테고리를
 *                     가리켜 tenant 경계를 넘는다. null 로 두고 공급자가 지정한다.
 * - supplier_id / default_supplier_id / supplier_contact_id
 *                   : 옛 tenant 의 customers / supplier_contacts 를 가리키는 FK 다.
 *                     복사하면 새 공급자가 플랫폼 거래처를 참조하게 된다. null.
 */
const PRODUCT_CLONE_COLUMNS = [
  'name',
  'barcode',
  'tax_type',
  'procurement_type',
  'min_margin_rate',
  'ingredients',
  'item_report_number',
] as const

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
  from: {
    owner_type: string
    owner_tenant_id: string
    supplier_tenant_id: string | null
    /** 이관 전 리스팅이 가리키던 플랫폼 상품. 지우지 않고 그대로 남는다. */
    product_id: string | null
  }
  to: {
    owner_type: string
    owner_tenant_id: string
    supplier_tenant_id: string
    /** 새로 만든 공급자 상품 */
    product_id: string
    product_code: string
  }
}

/**
 * product_code 채번. product_code_seq 는 tenant 와 무관한 전역 시퀀스라
 * (tenant_id, product_code) UNIQUE 를 자동으로 만족한다.
 * 운영 실측(2026-09-09): products 199행에서 product_code 전역 중복 0건.
 * product.ts createProduct 와 같은 방식을 쓴다.
 */
async function issueProductCode(
  supabase: any,
  tenant_id: string,
): Promise<{ ok: true; product_code: string } | { ok: false; error: string }> {
  const { data: seqData } = await supabase.rpc('nextval_product_code')
  let seqNum = typeof seqData === 'number' ? seqData : Number(seqData)

  if (!Number.isFinite(seqNum) || seqNum <= 0) {
    // 시퀀스를 못 읽으면 그 tenant 안의 최대값 + 1 로 떨어진다 (product.ts 와 동일).
    const { data: last, error } = await supabase
      .from('products')
      .select('product_code')
      .eq('tenant_id', tenant_id)
      .like('product_code', 'P%')
      .order('product_code', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return { ok: false, error: `product_code 채번 실패: ${error.message}` }
    seqNum = last?.product_code
      ? (parseInt(String(last.product_code).replace(/[^0-9]/g, ''), 10) || 0) + 1
      : 1
  }

  return { ok: true, product_code: `P${String(seqNum).padStart(4, '0')}` }
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
  /** 새 공급자의 매입가. 필수 — 비우면 이관하지 않는다. 플랫폼 값을 복사하지 않는다. */
  new_cost_price: number | string
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

  // 새 공급자 매입가는 필수다. 자리값(1원)도 받지 않는다 — 원가 미확정 상태로 이관하면
  // 그 시점부터 새 공급자 상품의 마진 계산이 틀린 값으로 굳는다.
  const newCostPrice = normalizeCostPriceInput(input.new_cost_price)
  if (newCostPrice == null) {
    return { success: false, error: '새 공급자의 매입가를 입력해 주세요' }
  }
  if (newCostPrice <= 1) {
    return { success: false, error: '매입가는 1원보다 커야 합니다 (1원은 원가 미확정 자리값입니다)' }
  }
  // 상한이 없으면 product_costs.cost_price(int4) 범위를 넘는 값이 그대로 DB 까지 내려가
  // 22003 raw 에러로 터진다. 상품이 이미 만들어진 뒤라 보상 삭제가 돌긴 하지만,
  // 애초에 여기서 걸러 사용자에게 읽을 수 있는 메시지를 준다.
  if (newCostPrice > MAX_COST_PRICE) {
    return {
      success: false,
      error: `매입가가 너무 큽니다 (최대 ${MAX_COST_PRICE.toLocaleString()}원)`,
    }
  }
  // 업무 상한이 먼저 걸린다. int4 상한은 그 뒤를 받치는 기술적 방어선으로 남겨둔다.
  if (newCostPrice > MAX_BUSINESS_COST_PRICE) {
    return {
      success: false,
      error: `매입가가 업무 상한을 넘습니다 (최대 ${MAX_BUSINESS_COST_PRICE.toLocaleString()}원). 오타가 아닌지 확인해 주세요`,
    }
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

  if (!listing.product_id) {
    return { success: false, error: '리스팅에 연결된 상품이 없어 이관할 수 없습니다' }
  }

  // ── 1) 원본 플랫폼 상품에서 표시 정보만 읽는다 ──────────────────────────────
  // 원가는 읽지 않는다. product_costs 를 아예 조회하지 않으므로 플랫폼 매입가가
  // 이 함수의 어떤 변수에도 들어오지 않는다.
  const { data: srcProduct, error: spErr } = await supabase
    .from('products')
    .select(['id', 'tenant_id', ...PRODUCT_CLONE_COLUMNS].join(', '))
    .eq('id', listing.product_id)
    .maybeSingle()

  if (spErr) return { success: false, error: `원본 상품 조회 실패: ${spErr.message}` }
  if (!srcProduct) return { success: false, error: '원본 상품을 찾을 수 없습니다' }

  // select 문자열을 배열에서 조합하므로 supabase-js 가 행 타입을 좁히지 못한다.
  // 복사 대상 컬럼은 PRODUCT_CLONE_COLUMNS 로 고정되어 있어 여기서는 인덱싱만 한다.
  const src = srcProduct as unknown as Record<string, unknown>

  // ── 2) 새 공급자 tenant 에 상품 생성 ────────────────────────────────────────
  const codeRes = await issueProductCode(supabase, nextSupplierId)
  if (!codeRes.ok) return { success: false, error: codeRes.error }

  const clonePayload: Record<string, unknown> = {
    tenant_id: nextSupplierId,
    product_code: codeRes.product_code,
    // tenant 경계를 넘는 FK 는 명시적으로 비운다 (PRODUCT_CLONE_COLUMNS 주석 참조)
    category_id: null,
    supplier_id: null,
    default_supplier_id: null,
    supplier_contact_id: null,
  }
  for (const col of PRODUCT_CLONE_COLUMNS) clonePayload[col] = src[col] ?? null

  const { data: newProduct, error: npErr } = await supabase
    .from('products')
    .insert(clonePayload)
    .select('id, tenant_id, product_code')
    .single()

  if (npErr || !newProduct) {
    return { success: false, error: `새 공급자 상품 생성 실패: ${npErr?.message ?? '알 수 없는 오류'}` }
  }
  const newProductId = newProduct.id as string

  if (newProduct.tenant_id !== nextSupplierId) {
    await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', newProductId)
    return { success: false, error: '새 상품이 다른 tenant 로 생성되었습니다. 이관을 중단합니다' }
  }

  // ── 3) 새 상품의 매입가 이력 ────────────────────────────────────────────────
  // start_date = 이관일, end_date = null. 플랫폼 원가는 참조하지 않는다.
  const transferDate = new Date().toISOString().slice(0, 10)
  const { error: costErr } = await supabase.from('product_costs').insert({
    product_id: newProductId,
    cost_price: newCostPrice,
    start_date: transferDate,
    end_date: null,
  })

  if (costErr) {
    // 방금 만든 상품만 되돌린다 (commerce.ts createPlatformCommerceProduct 와 같은 보상 처리).
    // 리스팅은 아직 손대지 않았으므로 이 시점 실패는 리스팅에 아무 영향이 없다.
    await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', newProductId)
    return { success: false, error: `새 공급자 매입가 저장 실패: ${costErr.message}` }
  }

  const from = {
    owner_type: listing.owner_type,
    owner_tenant_id: listing.owner_tenant_id,
    supplier_tenant_id: listing.supplier_tenant_id,
    product_id: listing.product_id,
  }
  const to = {
    owner_type: 'approved_supplier',
    owner_tenant_id: nextSupplierId,
    supplier_tenant_id: nextSupplierId,
    product_id: newProductId,
    product_code: newProduct.product_code as string,
  }

  // ── 4) 제자리 UPDATE — id / tenant_id 는 payload 에 넣지 않는다 ─────────────
  // product_id 는 새 상품으로 교체한다. 조회 조건에 현재 소유자와 현재 product_id 를
  // 함께 걸어, 그 사이 다른 관리자가 바꿨으면 덮어쓰지 않는다.
  const { data: updated, error: uErr } = await supabase
    .from('commerce_product_listings')
    .update({
      owner_type: to.owner_type,
      owner_tenant_id: to.owner_tenant_id,
      supplier_tenant_id: to.supplier_tenant_id,
      product_id: to.product_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lid)
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .eq('owner_tenant_id', from.owner_tenant_id)
    .eq('product_id', from.product_id)
    .is('deleted_at', null)
    .select('id, owner_type, owner_tenant_id, supplier_tenant_id, product_id')
    .maybeSingle()

  if (uErr || !updated) {
    // 리스팅이 안 바뀌었으므로 새 상품은 아무도 가리키지 않는 고아다.
    // 리스팅 후보에 뜨지 않도록 되돌린다. product_costs 행은 append-only 라 남지만
    // 삭제된 상품에 붙어 있어 어떤 리스팅에서도 도달할 수 없다.
    await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', newProductId)
    return {
      success: false,
      error: uErr
        ? `리스팅 갱신 실패: ${uErr.message}`
        : '이관 중 리스팅이 변경되었습니다. 새로고침 후 다시 시도해 주세요',
    }
  }

  // ── 5) 교체 후 재확인 (요구사항 3) ──────────────────────────────────────────
  // UPDATE 응답만 믿지 않고 다시 읽어서 확인한다.
  const { data: verify, error: vErr } = await supabase
    .from('commerce_product_listings')
    .select('id, product_id, owner_tenant_id, supplier_tenant_id, tenant_id, products(tenant_id)')
    .eq('id', lid)
    .maybeSingle()

  if (vErr || !verify) {
    return { success: false, error: `이관 후 재확인 실패: ${vErr?.message ?? '리스팅을 다시 읽지 못했습니다'}` }
  }
  if (verify.id !== lid) {
    return { success: false, error: 'listing_id 가 보존되지 않았습니다. 이관을 중단합니다' }
  }
  if (verify.product_id !== newProductId) {
    return { success: false, error: `product_id 교체가 반영되지 않았습니다 (현재 ${verify.product_id})` }
  }
  if (verify.tenant_id !== PLATFORM_OWNER_TENANT) {
    return { success: false, error: '리스팅 tenant_id 가 변경되었습니다. 이관을 중단합니다' }
  }
  const verifiedProductTenant = (verify.products as { tenant_id?: string } | null)?.tenant_id ?? null
  if (verifiedProductTenant !== nextSupplierId) {
    return {
      success: false,
      error: `새 상품이 이관 대상 공급자 소유가 아닙니다 (${verifiedProductTenant}). 이관을 중단합니다`,
    }
  }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: nextSupplierId,
    action_type: LISTING_TRANSFER_ACTION_TYPE,
    reason: (input.reason ?? '').trim() || null,
    target_table: 'commerce_product_listings',
    target_id: lid,
    old_value: {
      listing_id: lid,
      owner_type: from.owner_type,
      owner_tenant_id: from.owner_tenant_id,
      supplier_tenant_id: from.supplier_tenant_id,
      owner_name: preview.current_owner_name,
      // 이관되어 나간 플랫폼 상품. 지우지 않고 남기되, getProducts 가 이 값을 보고
      // 다시 리스팅 후보에 올리지 않는다.
      from_product_id: from.product_id,
    },
    new_value: {
      listing_id: lid,
      owner_type: to.owner_type,
      owner_tenant_id: to.owner_tenant_id,
      supplier_tenant_id: to.supplier_tenant_id,
      owner_name: (target.name as string | null) ?? null,
      // P3: product_id 를 새 공급자 상품으로 교체했다.
      from_product_id: from.product_id,
      to_product_id: to.product_id,
      to_product_code: to.product_code,
      // 새로 입력받은 공급자 매입가. 플랫폼 매입가는 이 기록 어디에도 넣지 않는다.
      new_cost_price: newCostPrice,
      cost_start_date: transferDate,
      settled_order_item_count: preview.settled_order_item_count,
      order_item_count: preview.order_item_count,
    },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/products')
  revalidatePath('/admin/commerce/allocations')

  return { success: true, data: { listing_id: lid, from, to } }
}
