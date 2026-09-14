import { SolapiMessageService } from 'solapi'
import { getSolapiEnv, sendSolapiText } from '@/lib/solapi-admin'

/**
 * 메시지 채널 — 알림톡(신규) + 문자(기존 솔라피 래퍼 재사용).
 *
 * 문자 발송은 새로 만들지 않고 `lib/solapi-admin.ts sendSolapiText` 를 그대로 쓴다(리드 문자와 같은 경로·발신번호).
 * `actions/message.ts`(거래처 SMS)는 건드리지 않는다 — tenant·customer 에 묶여 있어 이 흐름에 맞지 않는다.
 * 알림톡도 같은 SOLAPI_* 열쇠·발신번호를 쓰고, 카카오 옵션만 더한다.
 */

export type ChannelResult = { ok: boolean; messageId?: string; error?: string }

export interface DeliveryMessageChannels {
  sendKakao(input: {
    to: string
    pfId: string
    templateId: string
    variables: Record<string, string>
  }): Promise<ChannelResult>
  sendSms(input: { to: string; text: string }): Promise<ChannelResult>
}

export const solapiChannels: DeliveryMessageChannels = {
  async sendKakao({ to, pfId, templateId, variables }) {
    const env = getSolapiEnv()
    if (!env) return { ok: false, error: '솔라피 설정이 필요합니다' }
    try {
      const solapi = new SolapiMessageService(env.apiKey, env.apiSecret)
      const result = await solapi.send({
        to,
        from: env.sender,
        // disableSms: 솔라피 자체 대체발송을 끈다. 대체 발송은 우리가 결과를 기록하며 직접 한다
        kakaoOptions: { pfId, templateId, variables, disableSms: true },
      })
      const mid = result?.messageList?.[0]?.messageId ?? result?.groupInfo?.groupId
      const failed = result?.failedMessageList ?? []
      const registered = result?.groupInfo?.count?.registeredSuccess ?? 0
      if (mid && (failed.length === 0 || registered > 0)) return { ok: true, messageId: mid }
      return { ok: false, error: failed[0]?.statusMessage || '알림톡 발송 실패' }
    } catch (e: unknown) {
      const err = e as { message?: string; errorMessage?: string }
      return { ok: false, error: err?.message ?? err?.errorMessage ?? '알림톡 발송 오류' }
    }
  },

  async sendSms({ to, text }) {
    const r = await sendSolapiText({ to, text, subject: '식식이' })
    return r.ok ? { ok: true, messageId: r.messageId } : { ok: false, error: r.error }
  },
}
