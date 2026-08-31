-- 쿠폰 plan 값 체계 통일 — 2026-08-31
--
-- 배경: 같은 coupons 테이블에 두 관리자 화면이 서로 다른 값을 넣고 있었다.
--   - /admin/coupons        → 'earlybird' | 'pro' | 'annual'
--   - /admin/sales/promo    → 'any' | 'monthly' | 'annual'
--
-- 결제가 redeem_coupon(p_code, p_tenant_id, p_plan) 에 넘기는 p_plan 은
-- /api/toss/billing 의 VALID_PLANS = {monthly, annual} 뿐이다.
-- 매칭 조건이 `plan = 'any' OR plan = p_plan` 이므로 'earlybird' / 'pro' 로
-- 발급된 코드는 어떤 경우에도 사용될 수 없다(= 발급되는 순간 죽은 코드).
--
-- 따라서 값 체계를 'any' | 'monthly' | 'annual' 로 통일한다.
--
-- ※ 실행 전 확인 (2026-08-31 기준 운영 DB): coupons 0행 / coupon_uses 0행.
--    아래 1) UPDATE 는 그 시점 기준 대상이 없으나, 적용 시점에 남아 있을
--    레거시 행을 위해 그대로 둔다.

-- 1) 레거시 값 정규화 — 둘 다 월 구독을 의도한 값이므로 monthly 로 모은다
UPDATE public.coupons SET plan = 'monthly' WHERE plan IN ('earlybird', 'pro');

-- 2) CHECK 를 통일된 값으로 좁힌다
ALTER TABLE public.coupons
  DROP CONSTRAINT IF EXISTS coupons_plan_check;

ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_plan_check
  CHECK (plan IN ('any', 'monthly', 'annual'));

COMMENT ON COLUMN public.coupons.plan IS
  'any = 모든 구독 플랜에 적용. monthly/annual = 해당 플랜 전용. (2026-08-31 값 체계 통일 — 레거시 earlybird/pro 폐기)';
