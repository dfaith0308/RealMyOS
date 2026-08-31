/** 쿠폰 / 구독료 프로모션 코드 — 공용 타입·상수 (서버 액션과 관리자 화면이 함께 쓴다) */

/**
 * 코드가 적용되는 구독 플랜.
 *
 * 결제가 실제로 넘기는 플랜은 monthly / annual 두 가지뿐이고
 * (`/api/toss/billing` 의 VALID_PLANS), 코드 매칭은 DB 함수
 * `redeem_coupon(p_code, p_tenant_id, p_plan)` 안의
 * `plan = 'any' OR plan = p_plan` 한 줄로 끝난다.
 * 따라서 신규 발급이 가능한 값은 아래 셋뿐이다.
 */
export type CouponPlan = 'any' | 'monthly' | 'annual'

export const COUPON_PLAN_OPTIONS: Array<{ value: CouponPlan; label: string }> = [
  { value: 'any', label: '모든 플랜' },
  { value: 'monthly', label: '월간 전용' },
  { value: 'annual', label: '연간 전용' },
]

export const COUPON_PLAN_VALUES = COUPON_PLAN_OPTIONS.map((o) => o.value)

/**
 * 레거시 값 — 2026-08-31 통일 이전 쿠폰 화면이 발급하던 플랜.
 * 결제가 p_plan 으로 넘기는 값이 아니라서 redeem_coupon() 이 절대 매칭하지 못한다.
 * 즉 발급되더라도 쓸 수 없는 코드이므로 신규 발급은 막고, 남아 있는 행을 읽어
 * 표시할 때만 라벨을 붙인다.
 */
const LEGACY_PLAN_LABEL: Record<string, string> = {
  earlybird: '얼리버드 (레거시·사용불가)',
  pro: '월간 (레거시·사용불가)',
}

export function couponPlanLabel(plan: string): string {
  return (
    COUPON_PLAN_OPTIONS.find((o) => o.value === plan)?.label ??
    LEGACY_PLAN_LABEL[plan] ??
    plan
  )
}

/** 신규 발급이 허용되는 값인지 — 레거시 값은 false */
export function isCouponPlan(v: unknown): v is CouponPlan {
  return typeof v === 'string' && (COUPON_PLAN_VALUES as string[]).includes(v)
}
