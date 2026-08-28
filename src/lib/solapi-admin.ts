import { SolapiMessageService } from 'solapi'
import { smsByteLength } from '@/lib/sms-byte-length'

/**
 * 관리자(플랫폼) 발송용 솔라피 저수준 래퍼.
 *
 * 기존 `sendAligo`(src/actions/message.ts)는 tenant_id + customer_id 에 묶여 있어
 * (message_logs 저장, 테넌트별 일일한도, 거래처 단위 중복차단) 영업 리드처럼
 * 거래처가 아닌 대상에는 그대로 쓸 수 없다. 그래서 발송 경로 자체는 건드리지 않고,
 * 동일한 SOLAPI_* 환경변수 · 동일한 발신번호 · 동일한 SMS/LMS 판정 규칙을 쓰는
 * 얇은 래퍼만 따로 둔다. 문자 발송 인프라를 새로 만드는 것이 아니다.
 */

export type SolapiEnv = { apiKey: string; apiSecret: string; sender: string }

export function normalizePhoneDigits(phone: string): string {
  return (phone ?? '').replace(/[^0-9]/g, '')
}

export function getSolapiEnv(): SolapiEnv | null {
  const apiKey = (process.env.SOLAPI_API_KEY ?? '').trim()
  const apiSecret = (process.env.SOLAPI_API_SECRET ?? '').trim()
  const sender = normalizePhoneDigits(process.env.SOLAPI_SENDER ?? '')
  if (!apiKey || !apiSecret || !sender) return null
  return { apiKey, apiSecret, sender }
}

export type SolapiSendResult = {
  ok: boolean
  messageId?: string
  smsType: 'SMS' | 'LMS'
  byteLen: number
  error?: string
}

/** 90바이트 초과면 LMS — sendAligo 와 동일 기준 */
export async function sendSolapiText(input: {
  to: string
  text: string
  subject?: string
}): Promise<SolapiSendResult> {
  const byteLen = smsByteLength(input.text)
  const smsType: 'SMS' | 'LMS' = byteLen <= 90 ? 'SMS' : 'LMS'

  const env = getSolapiEnv()
  if (!env) {
    return {
      ok: false,
      smsType,
      byteLen,
      error: '솔라피 설정이 필요합니다 (SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER)',
    }
  }

  const to = normalizePhoneDigits(input.to)
  if (!to) return { ok: false, smsType, byteLen, error: '수신번호가 올바르지 않습니다' }

  try {
    const solapi = new SolapiMessageService(env.apiKey, env.apiSecret)
    const result = await solapi.send({
      to,
      from: env.sender,
      text: input.text,
      ...(smsType === 'LMS' ? { subject: input.subject ?? '식식이OS' } : {}),
    })

    const groupId = result?.groupInfo?.groupId
    const messageId = result?.messageList?.[0]?.messageId ?? (result as any)?.messageId ?? undefined
    const mid = messageId || groupId || undefined

    const failedList = result?.failedMessageList ?? []
    const registered = result?.groupInfo?.count?.registeredSuccess ?? 0

    if (mid && (failedList.length === 0 || registered > 0)) {
      return { ok: true, messageId: mid, smsType, byteLen }
    }

    return {
      ok: false,
      smsType,
      byteLen,
      error:
        failedList[0]?.statusMessage ||
        (typeof (result as any)?.errorMessage === 'string'
          ? (result as any).errorMessage
          : '솔라피 발송 실패'),
    }
  } catch (e: any) {
    return {
      ok: false,
      smsType,
      byteLen,
      error: e?.message ?? e?.errorMessage ?? '솔라피 발송 오류',
    }
  }
}
