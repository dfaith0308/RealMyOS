/** 050 계열 안심번호 여부 (숫자만 추출 후 판별) */
export function isSafeNumber(phone: string): boolean {
  return (phone ?? '').replace(/[^0-9]/g, '').startsWith('050')
}
