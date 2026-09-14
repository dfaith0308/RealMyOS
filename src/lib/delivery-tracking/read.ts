import type { SupabaseClient } from '@supabase/supabase-js'
import { buildManualDedupeKey, isUuid } from './gateway'
import { deliverySourceLabel } from './provider'
import { deliveryProgressRank, isDeliveryStatus, type DeliveryStatus } from './status'

/**
 * 배송 상태 읽기 + 수동 입력 검증 — 관리자·공급자 서버 액션이 같이 쓴다.
 * ('use server' 파일은 async 함수만 export 할 수 있고, 거기 둔 함수는 전부 호출 가능한
 *  엔드포인트가 되므로 클라이언트를 인자로 받는 함수는 여기 둔다.)
 */

export const DELIVERY_MIGRATION_HINT = '배송 추적 마이그레이션(20260915100000)이 아직 적용되지 않았습니다'

/** 컬럼/테이블이 아직 없을 때(마이그레이션 전) PostgREST 가 주는 오류인지 */
export function isMissingDeliverySchema(message: string | undefined): boolean {
  const m = String(message ?? '')
  return (
    /delivery_status|delivery_carrier|delivery_tracking_no|commerce_order_delivery_events/.test(m) &&
    /does not exist|could not find|schema cache/i.test(m)
  )
}

export type DeliveryEventRow = {
  id: string
  source_label: string
  raw_status: string | null
  mapped_status: DeliveryStatus
  outcome: string
  occurred_at: string
  carrier: string | null
  tracking_no: string | null
  note: string | null
}

export type OrderDeliveryDetail = {
  order_id: string
  order_status: string
  delivery_status: DeliveryStatus | null
  delivery_carrier: string | null
  delivery_tracking_no: string | null
  /** 이미 도달한 최고 진행 순위 — 버튼 힌트용. 이벤트에서 매번 계산한다(저장하지 않음) */
  max_reached_rank: number | null
  events: DeliveryEventRow[]
}

type Result<T> = { success: boolean; data?: T; error?: string }

/** 주문 하나의 배송 상태 + 입력 기록. 호출자가 권한·스코프를 먼저 확인한 뒤 부른다 */
export async function loadOrderDeliveryDetail(
  admin: SupabaseClient,
  orderId: string,
): Promise<Result<OrderDeliveryDetail>> {
  const [orderRes, eventsRes] = await Promise.all([
    admin
      .from('commerce_orders')
      .select('id, status, delivery_status, delivery_carrier, delivery_tracking_no')
      .eq('id', orderId)
      .maybeSingle(),
    admin
      .from('commerce_order_delivery_events')
      .select('id, source, raw_status, mapped_status, outcome, occurred_at, created_at, carrier, tracking_no, note')
      .eq('commerce_order_id', orderId)
      .order('created_at', { ascending: true }),
  ])

  if (orderRes.error) {
    return {
      success: false,
      error: isMissingDeliverySchema(orderRes.error.message) ? DELIVERY_MIGRATION_HINT : orderRes.error.message,
    }
  }
  if (!orderRes.data) return { success: false, error: '주문을 찾을 수 없습니다' }
  if (eventsRes.error) {
    return {
      success: false,
      error: isMissingDeliverySchema(eventsRes.error.message) ? DELIVERY_MIGRATION_HINT : eventsRes.error.message,
    }
  }

  const o = orderRes.data as Record<string, unknown>
  const events: DeliveryEventRow[] = ((eventsRes.data ?? []) as Record<string, unknown>[]).map((e) => ({
    id: String(e.id),
    source_label: deliverySourceLabel(String(e.source ?? '')),
    raw_status: (e.raw_status as string | null) ?? null,
    mapped_status: isDeliveryStatus(e.mapped_status) ? e.mapped_status : 'lookup_error',
    outcome: String(e.outcome ?? ''),
    occurred_at: String(e.occurred_at ?? e.created_at ?? ''),
    carrier: (e.carrier as string | null) ?? null,
    tracking_no: (e.tracking_no as string | null) ?? null,
    note: (e.note as string | null) ?? null,
  }))

  let maxRank: number | null = null
  for (const e of events) {
    if (e.outcome !== 'applied') continue
    const r = deliveryProgressRank(e.mapped_status)
    if (r != null && (maxRank == null || r > maxRank)) maxRank = r
  }

  return {
    success: true,
    data: {
      order_id: String(o.id),
      order_status: String(o.status ?? ''),
      delivery_status: isDeliveryStatus(o.delivery_status) ? o.delivery_status : null,
      delivery_carrier: (o.delivery_carrier as string | null) ?? null,
      delivery_tracking_no: (o.delivery_tracking_no as string | null) ?? null,
      max_reached_rank: maxRank,
      events,
    },
  }
}

export type ManualDeliveryInput = {
  order_id: string
  status: string
  /** 화면이 버튼 한 번마다 새로 발급하는 UUID — 더블클릭·재전송은 같은 값이라 한 번만 반영된다 */
  submission_id: string
  carrier?: string | null
  tracking_no?: string | null
  note?: string | null
}

export type ManualDeliveryResult = {
  duplicate: boolean
  outcome: string
  status_after: DeliveryStatus | null
  became_delivered: boolean
}

/** 수동 입력 형식 검증 — 반영 여부 판정은 DB 함수가 한다 */
export function validateManualDeliveryInput(input: ManualDeliveryInput): string | null {
  if (!isUuid(input.order_id)) return '주문 ID가 올바르지 않습니다'
  // 조회 오류는 사람이 고르는 값이 아니다(업체 응답을 못 읽었을 때만 생긴다)
  if (!isDeliveryStatus(input.status) || input.status === 'lookup_error') return '선택할 수 없는 배송 상태입니다'
  if (!buildManualDedupeKey(input.submission_id)) return '제출 키가 올바르지 않습니다. 새로고침 후 다시 시도해 주세요'
  if ((input.carrier ?? '').length > 40) return '택배사는 40자 이하로 입력해 주세요'
  if ((input.tracking_no ?? '').length > 40) return '송장번호는 40자 이하로 입력해 주세요'
  if ((input.note ?? '').length > 300) return '메모는 300자 이하로 입력해 주세요'
  if (input.status === 'attention' && !(input.note ?? '').trim()) {
    return '확인 필요는 사유(지연·주소 오류·반송 등)를 함께 적어 주세요'
  }
  return null
}
