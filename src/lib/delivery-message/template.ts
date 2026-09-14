/**
 * 배송 완료 메시지 — 문구 틀 + 광고 금지 검증.
 *
 * 발신 명의는 "식식이" 하나로 통일하고(첫 줄 [식식이]), 실제 보낸 사람은 본문의 「보내는 분」 줄로 보여준다
 * (doc/transfer-brief-siksiki.md 3-3절).
 *
 * 알림톡 템플릿 심사에 올릴 문구는 ALIMTALK_TEMPLATE_TEXT 그대로다. 문자 대체 발송도 같은 틀에 값을 채워
 * 보내므로, 카카오로 받든 문자로 받든 내용이 같다.
 */

export const BRAND_NAME = '식식이'

export const DEFAULT_THANK_YOU = '주문해 주셔서 감사합니다. 받으신 상품에 이상이 있으면 주문 상세의 문의하기로 알려주세요.'

/** 알림톡 템플릿 등록용 원문 — 변수 이름을 바꾸면 템플릿을 다시 심사받아야 한다 */
export const ALIMTALK_TEMPLATE_TEXT = [
  `[${BRAND_NAME}] 배송 완료 안내`,
  '주문하신 상품이 도착했습니다.',
  '',
  '주문번호: #{주문번호}',
  '보내는 분: #{보내는분}',
  '',
  '#{감사메시지}',
].join('\n')

export type ComposedMessage = {
  text: string
  variables: Record<string, string>
  senderDisplay: string
}

/**
 * 보내는 분: 설정의 표기 → 단독 공급자 상호 → 식식이.
 * 감사 메시지: 설정 → 기본 문구.
 */
export function composeDeliveryCompletedMessage(input: {
  orderNumber: string | null
  orderId: string
  settingsSenderDisplay: string | null
  supplierName: string | null
  thankYouMessage: string | null
}): ComposedMessage {
  const senderDisplay =
    (input.settingsSenderDisplay ?? '').trim() || (input.supplierName ?? '').trim() || BRAND_NAME
  const orderNo = (input.orderNumber ?? '').trim() || input.orderId.slice(0, 8).toUpperCase()
  const thankYou = (input.thankYouMessage ?? '').trim() || DEFAULT_THANK_YOU
  const variables = {
    '#{주문번호}': orderNo,
    '#{보내는분}': senderDisplay,
    '#{감사메시지}': thankYou,
  }
  let text = ALIMTALK_TEMPLATE_TEXT
  for (const [k, v] of Object.entries(variables)) text = text.split(k).join(v)
  return { text, variables, senderDisplay }
}

// ── 광고 금지 원칙 (3-4절) — 저장 단계에서 거절 ──────────────────────────────────────

const LINK_RE = /(https?:\/\/|www\.|bit\.ly|han\.gl|me2\.kr|\b[a-z0-9-]+\.(com|net|org|kr|co|io|me|ly|shop|store|site|link|app|biz|info)\b)/i
// 010-1234-5678 / 02 123 4567 / 1588-1234 / 01012345678 등. 숫자 사이 구분자는 - . 공백
const PHONE_RE = /(\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b)|(\b1[5-9]\d{2}[-.\s]?\d{4}\b)/
// 판매·유도 문구. 공급자 명의로 나가는 메시지에 우리 판매 문구를 넣지 않는다
export const AD_WORDS = [
  '특가', '할인', '세일', 'sale', '이벤트', '쿠폰', '증정', '사은품', '무료', '공짜', '1+1', '최저가',
  '한정', '적립', '포인트', '혜택', '프로모션', '광고', '재구매', '구매하기', '주문하기', '지금 바로',
  '추천인', '특별가', '% off', '떨이', '반값',
]

export type ContentViolation = { kind: 'link' | 'phone' | 'ad_word'; match: string }

export function findContentViolation(text: string | null | undefined): ContentViolation | null {
  const v = String(text ?? '')
  if (!v.trim()) return null
  const link = LINK_RE.exec(v)
  if (link) return { kind: 'link', match: link[0] }
  const phone = PHONE_RE.exec(v)
  if (phone) return { kind: 'phone', match: phone[0] }
  const lower = v.toLowerCase()
  const word = AD_WORDS.find((w) => lower.includes(w.toLowerCase()))
  if (word) return { kind: 'ad_word', match: word }
  return null
}

export function contentViolationMessage(label: string, v: ContentViolation): string {
  const why =
    v.kind === 'link'
      ? '링크'
      : v.kind === 'phone'
        ? '전화번호'
        : '광고성 단어'
  return `${label}에 ${why}(「${v.match}」)는 넣을 수 없습니다 — 공급자 명의 메시지에 판매·연락 유도 문구를 넣지 않습니다 (알림톡 심사 조건)`
}
