import type { DeliveryMessageChannels } from './channels'
import { normalizeMobilePhone, type SendSafety } from './safety'

/**
 * 알림톡 우선 → 실패 시 문자 대체 → 최종 상태 결정.
 *
 * 채널과 안전장치를 인자로 받는 순수 조립 함수다(외부 호출은 channels 가 한다).
 * 이 함수는 배송 업체도 주문 흐름도 모른다. "누구에게 무엇을"만 받는다.
 */

export type AttemptRecord = {
  channel: 'kakao' | 'sms'
  result: 'success' | 'failed' | 'skipped' | 'simulated'
  failure_reason?: string
  external_message_id?: string
  test_mode: boolean
  attempted_at: string
}

export type FinalStatus = 'kakao_success' | 'sms_fallback_success' | 'both_failed' | 'failed' | 'test_simulated'

export type SendOutcome = {
  status: FinalStatus
  recipientPhone: string | null
  attempts: AttemptRecord[]
}

export async function sendWithFallback(input: {
  rawPhone: string | null
  text: string
  variables: Record<string, string>
  safety: SendSafety
  channels: DeliveryMessageChannels
  now?: () => string
}): Promise<SendOutcome> {
  const now = input.now ?? (() => new Date().toISOString())
  const test = input.safety.testMode
  const attempts: AttemptRecord[] = []

  // 5번 — 번호 형식이 이상하면 어떤 채널로도 보내지 않는다
  const phone = normalizeMobilePhone(input.rawPhone)
  if (!phone) {
    attempts.push({ channel: 'sms', result: 'skipped', failure_reason: '휴대전화 번호 형식 아님', test_mode: test, attempted_at: now() })
    return { status: 'failed', recipientPhone: input.rawPhone, attempts }
  }

  // 1~3번 — 테스트 모드: 어떤 순서로 나갔을지 기록만
  if (test) {
    attempts.push(
      input.safety.kakao
        ? { channel: 'kakao', result: 'simulated', failure_reason: input.safety.testReason ?? undefined, test_mode: true, attempted_at: now() }
        : { channel: 'kakao', result: 'skipped', failure_reason: '알림톡 템플릿 없음', test_mode: true, attempted_at: now() },
    )
    attempts.push({ channel: 'sms', result: 'simulated', failure_reason: input.safety.testReason ?? undefined, test_mode: true, attempted_at: now() })
    return { status: 'test_simulated', recipientPhone: phone, attempts }
  }

  // 알림톡 우선 (4번 — 템플릿 없으면 건너뜀)
  if (input.safety.kakao) {
    const k = await input.channels.sendKakao({
      to: phone,
      pfId: input.safety.kakao.pfId,
      templateId: input.safety.kakao.templateId,
      variables: input.variables,
    })
    attempts.push({
      channel: 'kakao',
      result: k.ok ? 'success' : 'failed',
      failure_reason: k.ok ? undefined : k.error,
      external_message_id: k.messageId,
      test_mode: false,
      attempted_at: now(),
    })
    if (k.ok) return { status: 'kakao_success', recipientPhone: phone, attempts }
  } else {
    attempts.push({ channel: 'kakao', result: 'skipped', failure_reason: '알림톡 템플릿 없음', test_mode: false, attempted_at: now() })
  }

  // 문자 대체
  const s = await input.channels.sendSms({ to: phone, text: input.text })
  attempts.push({
    channel: 'sms',
    result: s.ok ? 'success' : 'failed',
    failure_reason: s.ok ? undefined : s.error,
    external_message_id: s.messageId,
    test_mode: false,
    attempted_at: now(),
  })
  return { status: s.ok ? 'sms_fallback_success' : 'both_failed', recipientPhone: phone, attempts }
}
