// ============================================================
// contact-utils.ts — contact_method 표준화 유틸
// DB CHECK: call | visit | message | payment
// ============================================================

export type SafeContactMethod = 'call' | 'visit' | 'message' | 'payment'

/**
 * methods 배열의 첫 번째 값을 DB 허용 contact_method로 변환
 * call_attempt, sms, kakao 등 비표준 값 → 안전한 값으로 매핑
 */
export function normalizeContactMethod(methods?: string[]): SafeContactMethod {
  const first = methods?.[0]
  if (first === 'call')    return 'call'
  if (first === 'visit')   return 'visit'
  if (first === 'payment') return 'payment'
  return 'message'  // message / kakao / sms / call_attempt / undefined 전부
}
