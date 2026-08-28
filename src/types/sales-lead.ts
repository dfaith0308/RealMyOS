/** 관리자 영업 리드 — 공용 타입/상수 (서버 액션과 클라이언트 컴포넌트가 함께 쓴다) */

export type LeadType = 'supplier' | 'restaurant'

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'interested'
  | 'meeting'
  | 'joined'
  | 'hold'
  | 'rejected'

export type ContactMethod = 'visit' | 'call' | 'sms' | 'kakao' | 'email'

export const LEAD_STATUS_OPTIONS: Array<{ value: LeadStatus; label: string; color: string }> = [
  { value: 'new', label: '신규발굴', color: '#6b7280' },
  { value: 'contacted', label: '1차접촉', color: '#2563eb' },
  { value: 'interested', label: '관심있음', color: '#0891b2' },
  { value: 'meeting', label: '미팅예정', color: '#7c3aed' },
  { value: 'joined', label: '가입완료', color: '#16a34a' },
  { value: 'hold', label: '보류', color: '#d97706' },
  { value: 'rejected', label: '거절', color: '#dc2626' },
]

export const CONTACT_METHOD_OPTIONS: Array<{ value: ContactMethod; label: string }> = [
  { value: 'visit', label: '방문' },
  { value: 'call', label: '전화' },
  { value: 'sms', label: '문자' },
  { value: 'kakao', label: '카톡' },
  { value: 'email', label: '이메일' },
]

export const INTEREST_LEVEL_OPTIONS: Array<{ value: 1 | 2 | 3; label: string }> = [
  { value: 1, label: '★☆☆ 낮음' },
  { value: 2, label: '★★☆ 보통' },
  { value: 3, label: '★★★ 높음' },
]

export const LEAD_STATUS_VALUES = LEAD_STATUS_OPTIONS.map((o) => o.value)
export const CONTACT_METHOD_VALUES = CONTACT_METHOD_OPTIONS.map((o) => o.value)

export function leadStatusLabel(status: string): string {
  return LEAD_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
}

export function leadStatusColor(status: string): string {
  return LEAD_STATUS_OPTIONS.find((o) => o.value === status)?.color ?? '#6b7280'
}

export function contactMethodLabel(method: string): string {
  return CONTACT_METHOD_OPTIONS.find((o) => o.value === method)?.label ?? method
}

export type SalesLeadRow = {
  id: string
  lead_type: LeadType
  company_name: string
  phone: string | null
  address: string | null
  region_sido: string | null
  region_sigungu: string | null
  contact_methods: ContactMethod[]
  status: LeadStatus
  interest_level: number
  naver_place_url: string | null
  linked_tenant_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type SalesLeadNoteRow = {
  id: string
  lead_id: string
  body: string
  tags: string[]
  created_by: string | null
  created_at: string
}

/** 목록 행 + 파생값 (N+1 없이 한 번에 계산해 내려준다) */
export type SalesLeadListRow = SalesLeadRow & {
  note_count: number
  last_note_at: string | null
  tags: string[]
}
