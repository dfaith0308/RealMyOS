// ============================================================
// RealMyOS - Settings 기본값 상수
// src/constants/settings.ts
// ============================================================

export interface TenantSettings {
  vat_rate: number
  order_edit_lock_days: number
  margin_warning_threshold: number
  new_customer_days: number
  overdue_warning_amount: number
  overdue_danger_amount: number          // 연체금 위험 기준 (원)
  warning_days: number
  danger_days: number
  warning_cycle_multiplier: number       // 주문주기 × N 초과 시 주의
  danger_cycle_multiplier: number        // 주문주기 × N 초과 시 위험
  default_target_monthly_revenue: number  // 기본 목표 월매출 (원)
}

export const DEFAULT_SETTINGS: TenantSettings = {
  vat_rate: 10,
  order_edit_lock_days: 7,
  margin_warning_threshold: 5,
  new_customer_days: 30,
  overdue_warning_amount: 100000,
  overdue_danger_amount: 500000,
  warning_days: 14,
  danger_days: 30,
  warning_cycle_multiplier: 1.5,         // 주문주기 × 1.5 초과 시 주의
  danger_cycle_multiplier: 2.0,          // 주문주기 × 2.0 초과 시 위험
  default_target_monthly_revenue: 0,      // 0 = 목표 없음
}
