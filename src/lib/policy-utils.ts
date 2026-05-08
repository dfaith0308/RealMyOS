/** 순수 유틸 — `'use server'` 모듈에서 분리 (Server Action은 async만 export 가능). */

export interface TrustLevelThresholds {
  supplier: { l1: number; l2: number; l3: number }
  restaurant: { l1: number; l2: number; l3: number }
}

export function policySettingReasonKey(key: string): string {
  return `admin_setting:key:${key}`
}

export function resolveTrustLevel(
  role: 'supplier' | 'restaurant',
  score: number,
  t: TrustLevelThresholds,
): number {
  if (role === 'supplier') {
    if (score <= t.supplier.l3) return 3
    if (score <= t.supplier.l2) return 2
    if (score <= t.supplier.l1) return 1
    return 0
  }
  if (score <= t.restaurant.l3) return 3
  if (score <= t.restaurant.l2) return 2
  if (score <= t.restaurant.l1) return 1
  return 0
}
