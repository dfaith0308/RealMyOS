import type { SupabaseClient } from '@supabase/supabase-js'
import type { DeliveryMessageChannels } from './channels'
import { resolveSendSafety, type DeliveryMessageEnv } from './safety'
import { sendWithFallback, type FinalStatus } from './send'
import { composeDeliveryCompletedMessage } from './template'

/**
 * 배송 완료 메시지 처리기 — DB 판정 함수(delivery_message_targets) 결과만 따른다.
 *
 * - runDeliveryCompletedEvents: 처리 안 된 delivery_completed 사건 → 발송 대기/발송 안 함 기록,
 *   자동 모드 주문은 바로 발송
 * - sendDeliveryMessages: 주문 id 목록 → 한 건씩 claim(한 요청만 잡음) → 알림톡/문자 → finish
 *
 * 발송은 건마다 외부 호출이 있어 주문별로 claim·finish 를 부른다. 화면 조회가 아니라 발송 루프라
 * N+1 금지 대상(조회 집계)과 성격이 다르다 — 한 번에 최대 MAX_SEND_BATCH 건으로 끊는다.
 */

export const MAX_SEND_BATCH = 50
const MIGRATION_HINT = '자동 메시지 마이그레이션(20260915120000)이 아직 적용되지 않았습니다'

export function isMissingMessageSchema(message: string | undefined): boolean {
  const m = String(message ?? '')
  return /delivery_message|commerce_domain_events|process_delivery_completed_events/.test(m) &&
    /does not exist|could not find|schema cache/i.test(m)
}

export type SendSummary = {
  requested: number
  claimed: number
  statuses: Partial<Record<FinalStatus, number>>
  not_claimed: { commerce_order_id: string; reason: string }[]
  test_mode: boolean
  test_reason: string | null
}

export async function sendDeliveryMessages(
  admin: SupabaseClient,
  orderIds: string[],
  opts: { actorUserId: string | null; channels: DeliveryMessageChannels; env: DeliveryMessageEnv },
): Promise<{ ok: true; summary: SendSummary } | { ok: false; error: string }> {
  const ids = [...new Set(orderIds)].slice(0, MAX_SEND_BATCH)
  const safety = resolveSendSafety(opts.env)
  const summary: SendSummary = {
    requested: ids.length,
    claimed: 0,
    statuses: {},
    not_claimed: [],
    test_mode: safety.testMode,
    test_reason: safety.testReason,
  }

  for (const orderId of ids) {
    const { data: claimData, error: claimErr } = await admin.rpc('claim_delivery_message_dispatch', {
      p_order_id: orderId,
      p_actor: opts.actorUserId,
    })
    if (claimErr) {
      return { ok: false, error: isMissingMessageSchema(claimErr.message) ? MIGRATION_HINT : claimErr.message }
    }
    const c = (claimData ?? {}) as Record<string, unknown>
    if (c.claimed !== true) {
      summary.not_claimed.push({ commerce_order_id: orderId, reason: String(c.reason ?? 'unknown') })
      continue
    }
    summary.claimed += 1

    const composed = composeDeliveryCompletedMessage({
      orderId,
      orderNumber: (c.order_number as string | null) ?? null,
      settingsSenderDisplay: (c.sender_display as string | null) ?? null,
      supplierName: (c.supplier_name as string | null) ?? null,
      thankYouMessage: (c.thank_you_message as string | null) ?? null,
    })

    let outcome
    try {
      outcome = await sendWithFallback({
        rawPhone: (c.recipient_phone as string | null) ?? null,
        text: composed.text,
        variables: composed.variables,
        safety,
        channels: opts.channels,
      })
    } catch (e) {
      // 채널 코드가 예외를 던져도 dispatch 가 'sending' 에 갇히지 않게 실패로 닫는다
      outcome = {
        status: 'both_failed' as FinalStatus,
        recipientPhone: (c.recipient_phone as string | null) ?? null,
        attempts: [
          {
            channel: 'sms' as const,
            result: 'failed' as const,
            failure_reason: e instanceof Error ? e.message : String(e),
            test_mode: safety.testMode,
            attempted_at: new Date().toISOString(),
          },
        ],
      }
    }

    const { data: finData, error: finErr } = await admin.rpc('finish_delivery_message_dispatch', {
      p_dispatch_id: c.dispatch_id,
      p_status: outcome.status,
      p_recipient_phone: outcome.recipientPhone,
      p_sender_display: composed.senderDisplay,
      p_body: composed.text,
      p_attempts: outcome.attempts,
      p_actor: opts.actorUserId,
    })
    const fin = (finData ?? {}) as Record<string, unknown>
    if (finErr || fin.success !== true) {
      // 발송은 됐는데 기록이 실패한 경우 — dispatch 가 'sending' 으로 남아 재발송 대상에서 빠진다(중복 발송보다 안전)
      console.error('[delivery-message] finish 기록 실패', orderId, finErr?.message ?? fin.error)
      summary.not_claimed.push({ commerce_order_id: orderId, reason: 'finish_failed' })
      continue
    }
    summary.statuses[outcome.status] = (summary.statuses[outcome.status] ?? 0) + 1
  }

  return { ok: true, summary }
}

export type EventRunSummary = {
  processed: number
  actions: Record<string, number>
  auto_send: SendSummary | null
}

export async function runDeliveryCompletedEvents(
  admin: SupabaseClient,
  opts: { actorUserId: string | null; channels: DeliveryMessageChannels; env: DeliveryMessageEnv; limit?: number },
): Promise<{ ok: true; summary: EventRunSummary } | { ok: false; error: string }> {
  const { data, error } = await admin.rpc('process_delivery_completed_events', { p_limit: opts.limit ?? 100 })
  if (error) return { ok: false, error: isMissingMessageSchema(error.message) ? MIGRATION_HINT : error.message }

  const rows = (Array.isArray(data) ? data : []) as { commerce_order_id: string; action: string }[]
  const actions: Record<string, number> = {}
  for (const r of rows) actions[r.action] = (actions[r.action] ?? 0) + 1

  const autoIds = rows.filter((r) => r.action === 'auto_send').map((r) => r.commerce_order_id)
  let auto_send: SendSummary | null = null
  if (autoIds.length) {
    const sent = await sendDeliveryMessages(admin, autoIds, opts)
    if (!sent.ok) return { ok: false, error: sent.error }
    auto_send = sent.summary
  }

  return { ok: true, summary: { processed: rows.length, actions, auto_send } }
}
