-- 구독 플랜 관리 (운영 DB 적용 완료 2026-06-16)
-- WARNING: Already applied via Supabase SQL Editor. Do not re-run.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS subscription_plan text
    DEFAULT 'free'
    CHECK (subscription_plan IN ('free', 'earlybird', 'pro', 'annual')),
  ADD COLUMN IF NOT EXISTS subscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

COMMENT ON COLUMN public.tenants.subscription_plan IS '구독 플랜: free / earlybird(9900) / pro(29000) / annual(19900)';
COMMENT ON COLUMN public.tenants.subscribed_at IS '구독 시작일';
COMMENT ON COLUMN public.tenants.plan_expires_at IS '구독 만료일 (쿠폰/얼리버드 기간 종료일)';
