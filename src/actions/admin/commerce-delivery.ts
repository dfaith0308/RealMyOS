'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { buildManualDedupeKey, isUuid, recordDeliveryObservation } from '@/lib/delivery-tracking/gateway'
import { drainDomainEvents } from '@/lib/domain-events/drain'
import {
  DELIVERY_MIGRATION_HINT,
  isMissingDeliverySchema,
  loadOrderDeliveryDetail,
  validateManualDeliveryInput,
  type ManualDeliveryInput,
  type ManualDeliveryResult,
  type OrderDeliveryDetail,
} from '@/lib/delivery-tracking/read'
import { DELIVERY_STATUSES, isDeliveryStatus, type DeliveryStatus } from '@/lib/delivery-tracking/status'

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

const PLATFORM_OWNER_TENANT = '00000000-0000-0000-0000-000000000000'

async function requireAdmin() {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false as const, error: '로그인 필요' }
  if (ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

export async function getAdminOrderDelivery(orderId: string): Promise<ActionResult<OrderDeliveryDetail>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!isUuid(orderId)) return { success: false, error: '주문 ID가 올바르지 않습니다' }
  const admin = await createSupabaseAdmin()
  return loadOrderDeliveryDetail(admin, orderId)
}

/** 관리자 수동 입력 — 창구(gateway) → 판정 함수. admin_logs 는 판정 함수가 같은 트랜잭션에서 남긴다 */
export async function recordAdminDeliveryStatus(
  input: ManualDeliveryInput,
): Promise<ActionResult<ManualDeliveryResult>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const invalid = validateManualDeliveryInput(input)
  if (invalid) return { success: false, error: invalid }

  const admin = await createSupabaseAdmin()
  const res = await recordDeliveryObservation(admin, {
    orderId: input.order_id,
    source: 'manual_admin',
    rawStatus: input.status,
    dedupeKey: buildManualDedupeKey(input.submission_id)!,
    actorUserId: auth.ctx.user_id,
    actorTenantId: PLATFORM_OWNER_TENANT,
    carrier: input.carrier ?? null,
    trackingNo: input.tracking_no ?? null,
    note: input.note ?? null,
  })
  if (!res.ok) return { success: false, error: res.error }

  // 배송 완료가 처음 반영됐으면 자체 사건(delivery_completed)을 바로 처리한다.
  // 이 액션은 메시지 규칙을 모른다 — 사건 처리기를 깨울 뿐이다. 실패해도 배송 입력은 성공이다
  // (사건 행이 남아 있어 관리자 「지금 한 번 돌려보기」·크론이 다시 줍는다).
  if (res.becameDelivered) {
    try {
      const drained = await drainDomainEvents(admin, auth.ctx.user_id)
      if (!drained.ok) console.error('[delivery] delivery_completed 처리 보류', drained.error)
    } catch (e) {
      console.error('[delivery] delivery_completed 처리 예외', e instanceof Error ? e.message : e)
    }
  }

  revalidatePath('/admin/commerce/orders')
  revalidatePath('/admin/commerce/deliveries')

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

export type DeliveryBoardRow = {
  id: string
  order_number: string | null
  tenant_name: string | null
  status: string
  delivery_status: DeliveryStatus | null
  delivery_carrier: string | null
  delivery_tracking_no: string | null
  created_at: string
}

export type DeliveryBoard = {
  counts: Record<DeliveryStatus, number>
  untracked: number
  rows: DeliveryBoardRow[]
}

/**
 * 배송 현황판 — "배송완료 83 / 배송중 12 / 확인필요 5".
 * 결제 확인 이후(paid/preparing/shipped/completed) 주문만 본다. 한 번 읽어 서버에서 집계한다(N+1 없음).
 */
export async function getDeliveryBoard(filter?: string): Promise<ActionResult<DeliveryBoard>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = await createSupabaseAdmin()
  const { data, error } = await admin
    .from('commerce_orders')
    .select('id, order_number, tenant_id, status, delivery_status, delivery_carrier, delivery_tracking_no, created_at')
    .in('status', ['paid', 'preparing', 'shipped', 'completed'])
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) return { success: false, error: isMissingDeliverySchema(error.message) ? DELIVERY_MIGRATION_HINT : error.message }

  const all = (data ?? []) as Record<string, unknown>[]
  const counts = Object.fromEntries(DELIVERY_STATUSES.map((s) => [s, 0])) as Record<DeliveryStatus, number>
  let untracked = 0
  for (const r of all) {
    if (isDeliveryStatus(r.delivery_status)) counts[r.delivery_status] += 1
    else untracked += 1
  }

  const f = String(filter ?? '').trim()
  const picked = all.filter((r) => {
    if (!f || f === 'open') return r.delivery_status !== 'delivered'
    if (f === 'all') return true
    if (f === 'untracked') return !isDeliveryStatus(r.delivery_status)
    return r.delivery_status === f
  })

  const tenantIds = [...new Set(picked.map((r) => String(r.tenant_id ?? '')).filter(Boolean))]
  const nameMap = new Map<string, string | null>()
  if (tenantIds.length) {
    const { data: tn } = await admin.from('tenants').select('id, name').in('id', tenantIds)
    for (const t of (tn ?? []) as { id: string; name: string | null }[]) nameMap.set(t.id, t.name ?? null)
  }

  return {
    success: true,
    data: {
      counts,
      untracked,
      rows: picked.map((r) => ({
        id: String(r.id),
        order_number: (r.order_number as string | null) ?? null,
        tenant_name: nameMap.get(String(r.tenant_id ?? '')) ?? null,
        status: String(r.status ?? ''),
        delivery_status: isDeliveryStatus(r.delivery_status) ? r.delivery_status : null,
        delivery_carrier: (r.delivery_carrier as string | null) ?? null,
        delivery_tracking_no: (r.delivery_tracking_no as string | null) ?? null,
        created_at: String(r.created_at ?? ''),
      })),
    },
  }
}
