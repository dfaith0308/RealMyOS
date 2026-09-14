'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { buildManualDedupeKey, isUuid, recordDeliveryObservation } from '@/lib/delivery-tracking/gateway'
import {
  DELIVERY_MIGRATION_HINT,
  isMissingDeliverySchema,
  loadOrderDeliveryDetail,
  validateManualDeliveryInput,
  type ManualDeliveryInput,
  type ManualDeliveryResult,
  type OrderDeliveryDetail,
} from '@/lib/delivery-tracking/read'
import { isDeliveryStatus, type DeliveryStatus } from '@/lib/delivery-tracking/status'

/**
 * 공급자OS — storefront 주문 배송 상태 입력.
 *
 * 공급자는 commerce_orders 를 RLS 로 읽을 수 없다(구매자 tenant·관리자만). 그래서 service role 로
 * 읽되, **반드시 commerce_order_allocations.supplier_tenant_id = 로그인 공급자** 로 스코프를 건다.
 * 공급자가 볼 수 있는 주문 = 자기에게 지급 예정(allocation)이 잡힌 주문뿐이다.
 *
 * 입력 권한은 더 좁다: 취소되지 않은 allocation 이 **전부 자기 것**인 주문(단독 공급)만 입력할 수 있다.
 * 배송 상태는 주문 단위 하나라, 공급자 둘이 따로 보내는 주문을 한 공급자가 "배송 완료"로 만들면
 * 다른 공급자 몫까지 완료로 보인다. 그런 주문은 읽기만 하고 관리자가 입력한다(transfer-audit-log 1-05).
 */

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

const ACTIVE_ORDER_STATUSES = ['paid', 'preparing', 'shipped', 'completed'] as const

async function requireSupplier() {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false as const, error: '로그인 필요' }
  const admin = await createSupabaseAdmin()
  // tenants.role 이 역할의 SSOT 다 (users.role 은 계정 권한 축)
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, role, name')
    .eq('id', ctx.tenant_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!tenant || (tenant as { role?: string }).role !== 'supplier') {
    return { ok: false as const, error: '공급자 계정만 사용할 수 있습니다' }
  }
  return { ok: true as const, ctx, admin }
}

export type SupplierDeliveryOrderRow = {
  id: string
  order_number: string | null
  order_status: string
  restaurant_name: string | null
  shipping_name: string | null
  shipping_phone: string | null
  shipping_address: string | null
  delivery_memo: string | null
  delivery_status: DeliveryStatus | null
  delivery_carrier: string | null
  delivery_tracking_no: string | null
  created_at: string
  /** 이 공급자에게 잡힌 품목만 */
  my_items: { title: string; quantity: number }[]
  /** 취소 안 된 allocation 이 전부 이 공급자 것 → 입력 가능 */
  sole_supplier: boolean
}

export async function getSupplierDeliveryOrders(): Promise<ActionResult<{ orders: SupplierDeliveryOrderRow[] }>> {
  const auth = await requireSupplier()
  if (!auth.ok) return { success: false, error: auth.error }
  const { admin, ctx } = auth

  // 1) 내 allocation → 주문 id (한 번)
  const { data: mine, error: mineErr } = await admin
    .from('commerce_order_allocations')
    .select('commerce_order_id, commerce_order_item_id')
    .eq('supplier_tenant_id', ctx.tenant_id)
    .neq('status', 'cancelled')
    .limit(2000)
  if (mineErr) return { success: false, error: mineErr.message }

  const myItemIds = new Set(((mine ?? []) as { commerce_order_item_id: string }[]).map((a) => a.commerce_order_item_id))
  const orderIds = [...new Set(((mine ?? []) as { commerce_order_id: string }[]).map((a) => a.commerce_order_id))]
  if (orderIds.length === 0) return { success: true, data: { orders: [] } }

  // 2) 주문·품목·전체 allocation 을 한 번씩 (주문 수만큼 돌지 않는다)
  const [ordersRes, allAllocRes] = await Promise.all([
    admin
      .from('commerce_orders')
      .select(
        'id, order_number, tenant_id, status, shipping_name, shipping_phone, shipping_address, delivery_memo, delivery_status, delivery_carrier, delivery_tracking_no, created_at, commerce_order_items ( id, listing_title, quantity )',
      )
      .in('id', orderIds)
      .in('status', [...ACTIVE_ORDER_STATUSES])
      .order('created_at', { ascending: false }),
    admin
      .from('commerce_order_allocations')
      .select('commerce_order_id, supplier_tenant_id')
      .in('commerce_order_id', orderIds)
      .neq('status', 'cancelled'),
  ])

  if (ordersRes.error) {
    return {
      success: false,
      error: isMissingDeliverySchema(ordersRes.error.message) ? DELIVERY_MIGRATION_HINT : ordersRes.error.message,
    }
  }
  if (allAllocRes.error) return { success: false, error: allAllocRes.error.message }

  const suppliersByOrder = new Map<string, Set<string>>()
  for (const a of (allAllocRes.data ?? []) as { commerce_order_id: string; supplier_tenant_id: string }[]) {
    const set = suppliersByOrder.get(a.commerce_order_id) ?? new Set<string>()
    set.add(a.supplier_tenant_id)
    suppliersByOrder.set(a.commerce_order_id, set)
  }

  const rows = (ordersRes.data ?? []) as Record<string, unknown>[]
  const tenantIds = [...new Set(rows.map((r) => String(r.tenant_id ?? '')).filter(Boolean))]
  const nameMap = new Map<string, string | null>()
  if (tenantIds.length) {
    const { data: tn } = await admin.from('tenants').select('id, name').in('id', tenantIds)
    for (const t of (tn ?? []) as { id: string; name: string | null }[]) nameMap.set(t.id, t.name ?? null)
  }

  const orders: SupplierDeliveryOrderRow[] = rows.map((r) => {
    const items = Array.isArray(r.commerce_order_items)
      ? (r.commerce_order_items as { id: string; listing_title: string; quantity: number }[])
      : []
    const sups = suppliersByOrder.get(String(r.id)) ?? new Set<string>()
    return {
      id: String(r.id),
      order_number: (r.order_number as string | null) ?? null,
      order_status: String(r.status ?? ''),
      restaurant_name: nameMap.get(String(r.tenant_id ?? '')) ?? null,
      shipping_name: (r.shipping_name as string | null) ?? null,
      shipping_phone: (r.shipping_phone as string | null) ?? null,
      shipping_address: (r.shipping_address as string | null) ?? null,
      delivery_memo: (r.delivery_memo as string | null) ?? null,
      delivery_status: isDeliveryStatus(r.delivery_status) ? r.delivery_status : null,
      delivery_carrier: (r.delivery_carrier as string | null) ?? null,
      delivery_tracking_no: (r.delivery_tracking_no as string | null) ?? null,
      created_at: String(r.created_at ?? ''),
      my_items: items
        .filter((it) => myItemIds.has(it.id))
        .map((it) => ({ title: it.listing_title, quantity: it.quantity })),
      sole_supplier: sups.size === 1 && sups.has(ctx.tenant_id),
    }
  })

  return { success: true, data: { orders } }
}

/** 이 공급자가 이 주문을 볼 수 있는가 / 입력할 수 있는가 — 한 곳에서만 판단 */
async function resolveSupplierOrderAccess(
  admin: Awaited<ReturnType<typeof createSupabaseAdmin>>,
  supplierTenantId: string,
  orderId: string,
): Promise<{ canRead: boolean; canWrite: boolean; error?: string }> {
  const { data, error } = await admin
    .from('commerce_order_allocations')
    .select('supplier_tenant_id')
    .eq('commerce_order_id', orderId)
    .neq('status', 'cancelled')
  if (error) return { canRead: false, canWrite: false, error: error.message }
  const sups = new Set(((data ?? []) as { supplier_tenant_id: string }[]).map((a) => a.supplier_tenant_id))
  const canRead = sups.has(supplierTenantId)
  return { canRead, canWrite: canRead && sups.size === 1 }
}

export async function getSupplierOrderDelivery(orderId: string): Promise<ActionResult<OrderDeliveryDetail>> {
  const auth = await requireSupplier()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!isUuid(orderId)) return { success: false, error: '주문 ID가 올바르지 않습니다' }

  const access = await resolveSupplierOrderAccess(auth.admin, auth.ctx.tenant_id, orderId)
  if (access.error) return { success: false, error: access.error }
  if (!access.canRead) return { success: false, error: '주문을 찾을 수 없습니다' }

  return loadOrderDeliveryDetail(auth.admin, orderId)
}

export async function recordSupplierDeliveryStatus(
  input: ManualDeliveryInput,
): Promise<ActionResult<ManualDeliveryResult>> {
  const auth = await requireSupplier()
  if (!auth.ok) return { success: false, error: auth.error }

  const invalid = validateManualDeliveryInput(input)
  if (invalid) return { success: false, error: invalid }

  const access = await resolveSupplierOrderAccess(auth.admin, auth.ctx.tenant_id, input.order_id)
  if (access.error) return { success: false, error: access.error }
  if (!access.canRead) return { success: false, error: '주문을 찾을 수 없습니다' }
  if (!access.canWrite) {
    return { success: false, error: '여러 공급자가 함께 보내는 주문이라 관리자가 배송 상태를 입력합니다' }
  }

  const res = await recordDeliveryObservation(auth.admin, {
    orderId: input.order_id,
    source: 'manual_supplier',
    rawStatus: input.status,
    dedupeKey: buildManualDedupeKey(input.submission_id)!,
    actorUserId: auth.ctx.user_id,
    actorTenantId: auth.ctx.tenant_id,
    carrier: input.carrier ?? null,
    trackingNo: input.tracking_no ?? null,
    note: input.note ?? null,
  })
  if (!res.ok) return { success: false, error: res.error }

  revalidatePath('/storefront-deliveries')

  return {
    success: true,
    data: {
      duplicate: res.duplicate,
      outcome: res.outcome,
      status_after: res.statusAfter,
      became_delivered: res.becameDelivered,
    },
  }
}
