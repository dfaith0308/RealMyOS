-- 구독 자동 재청구 (매일 1회 Vercel Cron) — 2026-09-02
--
-- 배경: 첫 결제만 자동이고 매달 재청구가 없었다. tenants.billing_key 로
-- 만료된 구독을 매일 재청구하되, 아래 두 가지가 이 마이그레이션의 핵심이다.
--   1) 무한 재시도 금지 → billing_failed_count / billing_status
--   2) 하루 이중청구 금지 → subscription_billing_attempts 의 (tenant_id, attempt_date) UNIQUE

-- 1) tenants 재청구 상태 -----------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS billing_failed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_last_error text;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_billing_status_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_billing_status_check
  CHECK (billing_status IN ('active', 'retrying', 'failed'));

COMMENT ON COLUMN public.tenants.billing_status IS
  'active = 정상 / retrying = 재청구 실패, 재시도 남음 / failed = 재시도 소진(더 이상 자동 청구하지 않음, 관리자 수동 처리)';
COMMENT ON COLUMN public.tenants.billing_failed_count IS
  '연속 재청구 실패 횟수. 성공하면 0으로 초기화. 3 도달 시 billing_status=failed';
COMMENT ON COLUMN public.tenants.billing_last_error IS
  '마지막 재청구 실패 사유 (토스 응답 message). 관리자 화면 표시용';

-- 2) 재청구 시도 이력 --------------------------------------------------------
-- 결제 호출 "전에" pending 행을 먼저 넣어 자리를 잡는다(claim). UNIQUE 가 걸려 있어
-- 크론이 중복 실행되거나 수동 호출이 겹쳐도 같은 테넌트를 같은 날 두 번 청구할 수 없다.
CREATE TABLE IF NOT EXISTS public.subscription_billing_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  attempt_date date NOT NULL,
  attempt_no integer NOT NULL DEFAULT 1,
  plan text,
  amount integer,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'failed', 'skipped')),
  order_id text,
  payment_key text,
  error_code text,
  error_message text,
  prev_expires_at timestamptz,
  next_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 중복청구 방지의 핵심. 하루에 테넌트당 시도 1건.
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_attempt_tenant_day
  ON public.subscription_billing_attempts (tenant_id, attempt_date);

CREATE INDEX IF NOT EXISTS idx_billing_attempt_created
  ON public.subscription_billing_attempts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_attempt_status
  ON public.subscription_billing_attempts (status, created_at DESC);

COMMENT ON TABLE public.subscription_billing_attempts IS
  '구독 자동 재청구 시도 이력. (tenant_id, attempt_date) UNIQUE 가 하루 이중청구를 막는 잠금 역할을 겸한다';
COMMENT ON COLUMN public.subscription_billing_attempts.attempt_date IS
  'KST 기준 시도 날짜. 크론이 하루 1회 도는 기준일';
COMMENT ON COLUMN public.subscription_billing_attempts.order_id IS
  '토스에 넘긴 orderId. Idempotency-Key 로도 사용해 네트워크 재시도 시 이중승인을 막는다';

-- 3) 만료 임박/경과 구독 조회용 인덱스 --------------------------------------
CREATE INDEX IF NOT EXISTS idx_tenants_renewal_due
  ON public.tenants (plan_expires_at)
  WHERE billing_key IS NOT NULL;

-- 4) RLS — 결제 이력이므로 기본 차단 ------------------------------------------
-- 정책을 하나도 두지 않으면 anon/authenticated 는 PostgREST 로 이 테이블에 닿을 수 없다.
-- 크론과 검증 스크립트는 service_role(RLS 우회)로 접근하고, 관리자는 admin_logs 화면으로 본다.
ALTER TABLE public.subscription_billing_attempts ENABLE ROW LEVEL SECURITY;
