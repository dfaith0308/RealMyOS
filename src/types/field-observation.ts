/** 현장 관찰기록 — 공용 타입/상수 (서버 액션과 클라이언트 컴포넌트가 함께 쓴다) */

export type FieldObservationStatus = 'unclassified' | 'converted' | 'discarded'

export const FIELD_OBSERVATION_STATUS_VALUES: FieldObservationStatus[] = [
  'unclassified',
  'converted',
  'discarded',
]

/**
 * "보관만(콘텐츠 소재)" 표시용 태그.
 * status 값을 늘리지 않고 태그로 구분한다 — 마이그레이션 SQL 의 리터럴과 같은 값이어야 한다.
 */
export const CONTENT_TAG = '콘텐츠소재'

/** 목록 화면의 보기 모드 */
export type ObservationView = 'unclassified' | 'content' | 'converted' | 'discarded'

export const OBSERVATION_VIEW_OPTIONS: Array<{ value: ObservationView; label: string }> = [
  { value: 'unclassified', label: '미분류' },
  { value: 'content', label: '콘텐츠 소재' },
  { value: 'converted', label: '전환됨' },
  { value: 'discarded', label: '버림' },
]

export type FieldObservationRow = {
  id: string
  photo_urls: string[]
  memo: string
  location: string | null
  tags: string[]
  status: FieldObservationStatus
  created_by: string | null
  created_at: string
}

/** 확정 요청 1건 — 관찰기록 하나에 대해 체크된 처리들 */
export type ObservationAction = {
  observation_id: string
  /** 'restaurant' · 'supplier' 중복 선택 가능 (둘 다 체크하면 리드가 2건 생긴다) */
  lead_types: Array<'restaurant' | 'supplier'>
  /** 리드로 전환할 때만 필요 */
  company_name: string
  keep_as_content: boolean
  discard: boolean
}

/** 메모 첫 줄을 업체명 기본값으로 쓴다 — 화면에서 고칠 수 있다 */
export function suggestCompanyName(memo: string): string {
  const first = (memo ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  return (first ?? '').slice(0, 40)
}
