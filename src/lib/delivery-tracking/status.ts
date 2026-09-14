/**
 * 자체 배송 상태 체계 — 식식이OS 배송 추적의 단일 출처.
 *
 * 택배사·조회 업체·관리자·공급자 누가 알려주든 서비스 로직은 이 코드값만 쓴다.
 * 외부 상태값을 그대로 쓰지 않는다 (doc/transfer-brief-siksiki.md 2-2절).
 *
 * DB 쪽 동일 정의: supabase/migrations/20260915100000_commerce_delivery_tracking.sql
 * (CHECK 값, commerce_delivery_progress_rank). 값을 늘리면 두 곳을 같이 고친다.
 * 식당OS 복제본: resturant_os/src/lib/delivery-status.ts
 *
 * 판정(후퇴 금지·중복 방지·완료 후 불변)은 DB 함수 apply_commerce_delivery_event() 한 곳에서만 한다.
 * 이 파일의 rank/옵션 함수는 **버튼을 보여줄지 말지** 정하는 화면용 힌트다. 서버가 최종 판정한다.
 */

/** 진행 6단계 — 순서가 곧 순위다 */
export const DELIVERY_PROGRESS_STATUSES = [
  'not_registered',
  'ready',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
] as const

/** 예외 2개 — 진행 단계가 아니다 */
export const DELIVERY_EXCEPTION_STATUSES = ['attention', 'lookup_error'] as const

export const DELIVERY_STATUSES = [...DELIVERY_PROGRESS_STATUSES, ...DELIVERY_EXCEPTION_STATUSES] as const

export type DeliveryProgressStatus = (typeof DELIVERY_PROGRESS_STATUSES)[number]
export type DeliveryExceptionStatus = (typeof DELIVERY_EXCEPTION_STATUSES)[number]
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  not_registered: '송장 등록 전',
  ready: '배송 준비',
  picked_up: '집화',
  in_transit: '배송 중',
  out_for_delivery: '배달 중',
  delivered: '배송 완료',
  attention: '확인 필요',
  lookup_error: '조회 오류',
}

export function isDeliveryStatus(v: unknown): v is DeliveryStatus {
  return typeof v === 'string' && (DELIVERY_STATUSES as readonly string[]).includes(v)
}

export function isDeliveryException(v: unknown): v is DeliveryExceptionStatus {
  return typeof v === 'string' && (DELIVERY_EXCEPTION_STATUSES as readonly string[]).includes(v)
}

/** 진행 순위. 예외·모르는 값은 null (DB commerce_delivery_progress_rank 와 같은 값) */
export function deliveryProgressRank(v: string | null | undefined): number | null {
  const i = (DELIVERY_PROGRESS_STATUSES as readonly string[]).indexOf(String(v ?? ''))
  return i >= 0 ? i : null
}

/**
 * 수동 입력 화면에 보여줄 버튼 목록 (화면용 힌트).
 * - 배송 완료면 아무것도 없다
 * - 진행 단계는 이미 도달한 가장 높은 단계 이상만 (같은 단계 재입력은 현재 상태가 예외일 때만 — 복귀용)
 * - 확인 필요는 완료 전 언제든. 조회 오류는 사람이 고르는 값이 아니므로 버튼에 없다
 */
export function manualDeliveryOptions(
  current: string | null | undefined,
  maxReachedRank: number | null,
): DeliveryStatus[] {
  if (current === 'delivered') return []
  const curRank = deliveryProgressRank(current)
  const floor = Math.max(maxReachedRank ?? -1, curRank ?? -1)
  const inException = isDeliveryException(current)
  const progress = DELIVERY_PROGRESS_STATUSES.filter((s, i) => {
    if (i > floor) return true
    return inException && i === floor
  })
  const out: DeliveryStatus[] = [...progress]
  if (current !== 'attention') out.push('attention')
  return out
}

/** DB 이벤트 outcome 코드 → 화면 문구 */
export const DELIVERY_EVENT_OUTCOME_LABEL: Record<string, string> = {
  applied: '반영',
  ignored_same: '같은 상태라 변경 없음',
  ignored_regress: '이전 단계라 반영 안 함',
  ignored_terminal: '이미 배송 완료',
}
