/** 실행센터·연락 로그 옵션 상수 — `'use server'` 파일(contact)에서는 객체 export 불가. */

export const OUTCOME_TYPES = [
  { value: 'interested', label: '관심있음' },
  { value: 'potential', label: '잠재고객' },
  { value: 'maintained', label: '관계유지' },
  { value: 'churn_risk', label: '이탈위험' },
  { value: 'competitor', label: '경쟁사사용' },
  { value: 'rejected', label: '거절' },
  { value: 'no_answer', label: '부재중' },
  { value: 'callback_requested', label: '콜백요청' },
  { value: 'order_placed', label: '주문성사' },
] as const

export type OutcomeType = (typeof OUTCOME_TYPES)[number]['value']

export const CUSTOMER_STATUS_OPTIONS = [
  { value: 'regular', label: '단골' },
  { value: 'new', label: '신규' },
  { value: 'churn', label: '이탈' },
  { value: 'dormant', label: '휴면' },
] as const

export type CustomerStatusType = (typeof CUSTOMER_STATUS_OPTIONS)[number]['value']
