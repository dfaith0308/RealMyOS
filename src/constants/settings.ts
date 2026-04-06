// ============================================================
// RealMyOS - Settings 기본값 상수
// "use server" 파일에는 객체 export 불가 → 별도 분리
// ============================================================

export interface TenantSettings {
  vat_rate: number
  order_edit_lock_days: number
  margin_warning_threshold: number
  new_customer_days: number
  overdue_warning_amount: number
  warning_days: number
  danger_days: number
}

export const DEFAULT_SETTINGS: TenantSettings = {
  vat_rate: 10,
  order_edit_lock_days: 7,
  margin_warning_threshold: 5,
  new_customer_days: 30,
  overdue_warning_amount: 100000,
  warning_days: 14,
  danger_days: 30,
}
