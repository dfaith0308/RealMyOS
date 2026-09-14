/**
 * 발송 안전장치 5겹 (doc/transfer-brief-siksiki.md 3-6절) — 순서대로 걸린다.
 *
 * 1. 발송 열쇠(SOLAPI_API_KEY/SECRET/SENDER)가 없으면 → 테스트 모드 (기록만)
 * 2. 실제 발송 스위치(DELIVERY_MESSAGE_LIVE_SEND=true)가 꺼져 있으면 → 테스트 모드
 * 3. 시험 배포 환경(VERCEL_ENV=preview)에서는 → 발송하지 않음(테스트 모드)
 * 4. 알림톡 템플릿(SOLAPI_KAKAO_PF_ID + SOLAPI_KAKAO_TEMPLATE_DELIVERY_COMPLETED)이 없으면 → 건너뛰고 문자로
 * 5. 번호 형식이 이상하면 → 발송하지 않음
 *
 * 스위치의 기본값은 전부 "안 보냄"이다. 환경변수를 하나도 안 넣으면 실제 발송은 절대 일어나지 않는다.
 */

/**
 * 읽는 환경변수: SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER, DELIVERY_MESSAGE_LIVE_SEND, VERCEL_ENV,
 * SOLAPI_KAKAO_PF_ID, SOLAPI_KAKAO_TEMPLATE_DELIVERY_COMPLETED. process.env 를 그대로 넘기면 된다.
 */
export type DeliveryMessageEnv = Record<string, string | undefined>

export type SendSafety = {
  /** true 면 외부 발송을 하지 않고 시도만 기록한다 */
  testMode: boolean
  /** 테스트 모드인 이유 (1~3번 중 처음 걸린 것) */
  testReason: string | null
  /** 4번 — 알림톡 템플릿이 있으면 값, 없으면 null(문자로 바로) */
  kakao: { pfId: string; templateId: string } | null
}

export function resolveSendSafety(env: DeliveryMessageEnv): SendSafety {
  const hasKeys =
    Boolean((env.SOLAPI_API_KEY ?? '').trim()) &&
    Boolean((env.SOLAPI_API_SECRET ?? '').trim()) &&
    Boolean((env.SOLAPI_SENDER ?? '').replace(/[^0-9]/g, ''))
  const pfId = (env.SOLAPI_KAKAO_PF_ID ?? '').trim()
  const templateId = (env.SOLAPI_KAKAO_TEMPLATE_DELIVERY_COMPLETED ?? '').trim()
  const kakao = pfId && templateId ? { pfId, templateId } : null

  let testReason: string | null = null
  if (!hasKeys) testReason = '발송 열쇠(SOLAPI_*) 없음'
  else if ((env.DELIVERY_MESSAGE_LIVE_SEND ?? '').trim() !== 'true') testReason = '실제 발송 스위치 꺼짐(DELIVERY_MESSAGE_LIVE_SEND)'
  else if ((env.VERCEL_ENV ?? '').trim() === 'preview') testReason = '시험 배포 환경(preview)'

  return { testMode: testReason !== null, testReason, kakao }
}

/** 5번 — 휴대전화만 받는다(문자·알림톡 모두 휴대전화 전용). 형식이 틀리면 null */
export function normalizeMobilePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/[^0-9]/g, '')
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null
}
