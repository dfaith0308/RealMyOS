import type { SupabaseClient } from '@supabase/supabase-js'
import { solapiChannels } from '@/lib/delivery-message/channels'
import { runDeliveryCompletedEvents, type EventRunSummary } from '@/lib/delivery-message/processor'

/**
 * 자체 사건(commerce_domain_events) 처리 입구.
 *
 * 사건을 만드는 쪽(배송 추적)은 이 파일도, 메시지 모듈도 모른다 — DB 트리거가 사건 행만 남긴다.
 * 여기서 사건 종류별 처리기를 부른다. 결품·발주 마감 같은 사건이 생기면 이 목록에 처리기를 더한다.
 *
 * 부르는 곳: 배송 상태 입력 서버 액션(배송 완료가 반영된 직후, 실패해도 입력은 성공 처리),
 *           관리자 「지금 한 번 돌려보기」, /api/cron/domain-events (등록은 승인 대기).
 */
export async function drainDomainEvents(
  admin: SupabaseClient,
  actorUserId: string | null,
): Promise<{ ok: true; delivery_completed: EventRunSummary } | { ok: false; error: string }> {
  const res = await runDeliveryCompletedEvents(admin, {
    actorUserId,
    channels: solapiChannels,
    env: process.env,
  })
  if (!res.ok) return res
  return { ok: true, delivery_completed: res.summary }
}
