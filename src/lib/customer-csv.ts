// ============================================================
// RealMyOS - 거래처 CSV 양식 생성
// src/lib/customer-csv.ts
// ============================================================

export const CUSTOMER_CSV_HEADERS = [
  'business_number',
  'customer_type',
  'name',
  'representative_name',
  'phone',
  'address',
  'business_type',
  'payment_terms_type',
  'payment_day',
  'payment_terms_days',
  'opening_balance',
  'opening_balance_date',
  'target_monthly_revenue',
  'acquisition_channel',
] as const

export type CustomerCsvHeader = typeof CUSTOMER_CSV_HEADERS[number]

// payment_terms_type 허용값
export const VALID_TERMS_TYPES = ['immediate', 'monthly_end', 'monthly_day', 'days_after'] as const
// customer_type 허용값
export const VALID_CUSTOMER_TYPES = ['business', 'individual', 'prospect'] as const

const EXAMPLE_ROWS = [
  [
    '1234567890', 'business', '정무식당', '홍길동', '010-1234-5678',
    '서울시 강남구', '음식점업', 'monthly_day', '15', '0',
    '100000', '2024-01-01', '500000', '직접',
  ],
  [
    '', 'individual', '김개인', '', '010-9999-8888',
    '', '', 'immediate', '', '0',
    '0', '', '', '소개',
  ],
]

const COMMENTS = [
  '# customer_type: business(사업자) / individual(개인) / prospect(예비)',
  '# payment_terms_type: immediate(즉시) / monthly_end(말일) / monthly_day(매월N일) / days_after(N일후)',
  '# payment_day: monthly_day → 1~31 / days_after → 일수 / 나머지 → 비워두기',
  '# business_number 있으면 중복 시 업데이트, 없으면 항상 신규 등록',
  '# opening_balance_date 형식: YYYY-MM-DD',
  '# acquisition_channel: 유입경로 이름 (없으면 자동 생성)',
]

export function generateCustomerCsvTemplate(): string {
  const lines: string[] = [
    ...COMMENTS,
    CUSTOMER_CSV_HEADERS.join(','),
    ...EXAMPLE_ROWS.map((row) => row.join(',')),
  ]
  return lines.join('\n')
}

export function downloadCustomerCsvTemplate(): void {
  const csv = generateCustomerCsvTemplate()
  const bom = '\uFEFF' // 한글 깨짐 방지
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '거래처_대량등록_양식.csv'
  a.click()
  URL.revokeObjectURL(url)
}
