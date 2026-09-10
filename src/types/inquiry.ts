/** 고객 문의(CS) — 공용 타입/상수 (서버 액션과 클라이언트 컴포넌트가 함께 쓴다) */

/**
 * 문의유형·응대방식의 허용값 단일 출처.
 * DB 에 CHECK 를 걸지 않고 여기서만 검증한다 — 선택지 추가는 이 배열에 한 줄이면 끝난다.
 * (마이그레이션 20260910100000_create_inquiries.sql 주석 참고)
 *
 * 코드값은 한 번 정하면 바꾸지 않는다. 이미 저장된 행이 라벨을 잃기 때문이다.
 * 라벨만 고치는 것은 안전하다.
 */
export const INQUIRY_TYPES = [
  { value: 'product', label: '상품문의' },
  { value: 'price', label: '가격문의' },
  { value: 'delivery', label: '배송문의' },
  { value: 'return', label: '반품·교환' },
  { value: 'other', label: '기타' },
] as const

export const RESPONSE_METHODS = [
  { value: 'phone', label: '전화' },
  { value: 'sms', label: '문자' },
  { value: 'kakao', label: '카카오톡' },
  { value: 'instagram', label: '인스타 DM' },
  { value: 'visit', label: '방문' },
  { value: 'other', label: '기타' },
] as const

export type InquiryType = (typeof INQUIRY_TYPES)[number]['value']
export type ResponseMethod = (typeof RESPONSE_METHODS)[number]['value']

/** '기타'를 고른 경우에만 직접입력 칸이 열린다 */
export const ETC_VALUE = 'other'

export function isInquiryType(v: unknown): v is InquiryType {
  return INQUIRY_TYPES.some((t) => t.value === v)
}

export function isResponseMethod(v: unknown): v is ResponseMethod {
  return RESPONSE_METHODS.some((m) => m.value === v)
}

/** 코드 → 라벨. '기타'는 직접입력한 내용을 괄호로 붙여 보여준다 */
export function inquiryTypeLabel(type: string, etc?: string | null): string {
  const found = INQUIRY_TYPES.find((t) => t.value === type)
  const base = found?.label ?? type
  if (type === ETC_VALUE && etc?.trim()) return `${base} (${etc.trim()})`
  return base
}

export function responseMethodLabel(method: string, etc?: string | null): string {
  const found = RESPONSE_METHODS.find((m) => m.value === method)
  const base = found?.label ?? method
  if (method === ETC_VALUE && etc?.trim()) return `${base} (${etc.trim()})`
  return base
}

export type MatchStatus = 'unmatched' | 'matched'

/** 목록 화면의 보기 모드 */
export type InquiryView = 'all' | 'unmatched' | 'matched'

export const INQUIRY_VIEW_OPTIONS: Array<{ value: InquiryView; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'unmatched', label: '미매칭' },
  { value: 'matched', label: '매칭됨' },
]

export type InquiryRow = {
  id: string
  inquiry_type: string
  inquiry_type_etc: string | null
  response_method: string
  response_method_etc: string | null
  price_guided: boolean
  price_guide_note: string | null
  payment_guided: boolean
  payment_guide_note: string | null
  shipped: boolean
  shipping_note: string | null
  memo: string
  photo_urls: string[]
  customer_name: string | null
  customer_phone: string | null
  inquired_at: string
  handled_by: string | null
  match_status: MatchStatus
  matched_tenant_id: string | null
  matched_at: string | null
  matched_by: string | null
  created_at: string
  /**
   * 아래 두 개는 DB 컬럼이 아니라 목록·상세를 만들 때 한 번에 붙여주는 표시용 값이다.
   * 행마다 tenants/users 를 다시 조회하지 않기 위해(RULE-05) 서버에서 묶어 채운다.
   */
  matched_tenant_name: string | null
  handled_by_email: string | null
}

/** 수동 매칭 후보 — 검색 결과 한 줄 */
export type MatchCandidate = {
  id: string
  name: string | null
  role: string | null
  owner_name: string | null
  representative_name: string | null
  phone: string | null
  contact_phone: string | null
  /** 어느 칸이 검색어와 맞았는지. 관리자가 "왜 이게 나왔는지" 보고 판단할 수 있게 한다 */
  matched_on: string[]
}

export const TENANT_ROLE_LABELS: Record<string, string> = {
  restaurant: '식당',
  supplier: '공급자',
}

export function tenantRoleLabel(role: string | null): string {
  if (!role) return '—'
  return TENANT_ROLE_LABELS[role] ?? role
}

/**
 * 연락처 비교용 정규화 — 숫자만 남긴다.
 * 010-1234-5678 / 01012345678 / 010 1234 5678 이 같은 번호로 취급되어야 한다.
 */
export function digitsOnly(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '')
}

/**
 * KST 고정 포맷.
 * toLocaleString 계열은 서버(UTC)와 브라우저(로컬)가 다른 문자열을 만들어 하이드레이션이 깨진다.
 * 오프셋을 직접 더해 양쪽이 같은 결과를 내게 한다 (FieldObservationsClient 와 동일).
 */
export function formatInquiryDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}. ${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`
}

/** datetime-local 입력값(브라우저 로컬 = KST 가정)을 저장용 ISO 로 바꾼다 */
export function kstLocalInputToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim())
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) - 9 * 60 * 60 * 1000
  const dt = new Date(utcMs)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

/** 지금 시각을 datetime-local 기본값(KST)으로 */
export function nowKstLocalInput(): string {
  const k = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}T${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`
}
