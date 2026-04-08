// ============================================================
// RealMyOS - 결제조건 표시 유틸
// src/lib/payment-terms.ts
// ============================================================

export type PaymentTermsType = 'immediate' | 'monthly_end' | 'monthly_day' | 'days_after'

export interface PaymentTerms {
  type: PaymentTermsType
  days?: number   // days_after: N일
  day?: number    // monthly_day: N일
}

export function formatPaymentTerms(
  type: PaymentTermsType,
  day?: number | null,
): string {
  switch (type) {
    case 'immediate':   return '즉시결제'
    case 'monthly_end': return '말일결제'
    case 'monthly_day': return day ? `매월 ${day}일` : '매월 결제'
    case 'days_after':  return day ? `${day}일 후` : '기간 후'
    default:            return '즉시결제'
  }
}

// payment_terms_days(legacy) → type 추론
export function inferTermsType(days: number): PaymentTermsType {
  if (days === 0)  return 'immediate'
  if (days === 30) return 'days_after'
  if (days === 45) return 'days_after'
  if (days === 60) return 'days_after'
  return 'days_after'
}
