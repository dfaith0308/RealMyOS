import type { SupabaseClient } from '@supabase/supabase-js'
import { getDeliveryProvider } from './provider'
import { isDeliveryStatus, type DeliveryStatus } from './status'

/**
 * 조회 창구 — 배송 상태를 기록하는 유일한 입구.
 *
 * 흐름: 원본 값 → provider.mapRawStatus(자체 상태로 옮김) → DB 판정 함수(apply_commerce_delivery_event)
 * - 옮기는 규칙은 provider 가, 반영 여부 판정은 DB 함수가 한다. 창구는 둘을 잇기만 한다.
 * - 이 모듈은 주문·메시지 흐름을 모른다. 배송 완료 여부(became_delivered)만 돌려준다.
 *   완료 이후의 일(3단계 자동 메시지)은 DB 에 남는 자체 사건(delivery_completed)을 본다.
 *
 * 반드시 service role 클라이언트로 부른다. 판정 함수 EXECUTE 는 service_role 에만 열려 있다.
 */

export type DeliveryObservationInput = {
  orderId: string
  /** provider.source — 'manual_admin' | 'manual_supplier' | 'provider:<id>' */
  source: string
  rawStatus: string
  /**
   * 중복 방지 키.
   * 수동 입력: 화면이 버튼 한 번마다 발급한 제출 UUID (`manual:<uuid>`로 감싼다)
   * 업체 조회: buildProviderDedupeKey() 결과
   */
  dedupeKey: string
  occurredAt?: string | null
  actorUserId?: string | null
  actorTenantId?: string | null
  carrier?: string | null
  trackingNo?: string | null
  rawPayload?: Record<string, unknown>
  note?: string | null
}

export type DeliveryObservationResult =
  | {
      ok: true
      duplicate: boolean
      outcome: 'applied' | 'ignored_same' | 'ignored_regress' | 'ignored_terminal'
      mappedStatus: DeliveryStatus
      statusBefore: DeliveryStatus | null
      statusAfter: DeliveryStatus | null
      becameDelivered: boolean
    }
  | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

/** 수동 입력 제출 UUID → 중복 방지 키 */
export function buildManualDedupeKey(submissionId: string): string | null {
  return isUuid(submissionId) ? `manual:${submissionId.toLowerCase()}` : null
}

/** 업체 조회 이벤트 → 중복 방지 키. 같은 송장·같은 원본 상태·같은 시각이면 같은 사건이다 */
export function buildProviderDedupeKey(input: {
  source: string
  trackingNo: string
  rawStatus: string
  occurredAt: string
}): string {
  return [input.source, input.trackingNo.trim(), input.rawStatus.trim(), input.occurredAt.trim()]
    .join(':')
    .slice(0, 300)
}

export async function recordDeliveryObservation(
  admin: SupabaseClient,
  input: DeliveryObservationInput,
): Promise<DeliveryObservationResult> {
  const provider = getDeliveryProvider(input.source)
  if (!provider) return { ok: false, error: '알 수 없는 배송 정보 출처입니다' }
  if (!isUuid(input.orderId)) return { ok: false, error: '주문 ID가 올바르지 않습니다' }

  const mapped = provider.mapRawStatus(input.rawStatus)

  const { data, error } = await admin.rpc('apply_commerce_delivery_event', {
    p_order_id: input.orderId,
    p_mapped_status: mapped,
    p_raw_status: input.rawStatus,
    p_source: provider.source,
    p_dedupe_key: input.dedupeKey,
    p_occurred_at: input.occurredAt ?? null,
    p_actor_user_id: input.actorUserId ?? null,
    p_actor_tenant_id: input.actorTenantId ?? null,
    p_carrier: input.carrier ?? null,
    p_tracking_no: input.trackingNo ?? null,
    p_raw_payload: input.rawPayload ?? {},
    p_note: input.note ?? null,
  })

  if (error) {
    // 마이그레이션 미적용 환경에서도 화면이 죽지 않고 이유를 보여준다
    if (/apply_commerce_delivery_event/.test(error.message) && /not find|does not exist/i.test(error.message)) {
      return { ok: false, error: '배송 추적 마이그레이션(20260915100000)이 아직 적용되지 않았습니다' }
    }
    return { ok: false, error: error.message }
  }

  const r = (data ?? {}) as Record<string, unknown>
  if (r.success !== true) return { ok: false, error: String(r.error ?? '배송 상태 기록 실패') }

  const before = isDeliveryStatus(r.status_before) ? r.status_before : null
  const after = isDeliveryStatus(r.status_after) ? r.status_after : null
  const outcome = String(r.outcome ?? '') as Extract<DeliveryObservationResult, { ok: true }>['outcome']

  return {
    ok: true,
    duplicate: r.duplicate === true,
    outcome,
    mappedStatus: mapped,
    statusBefore: before,
    statusAfter: after,
    becameDelivered: r.became_delivered === true,
  }
}
