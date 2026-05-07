-- SUP-MISSING-007: 예치금 시스템
-- PRODUCT §6-8 수금관리
-- 예치금 = 부채(liability) 개념 (고객에게 돌려줘야 할 금액)

-- ============================================================
-- customer_deposits: 고객별 현재 예치금 잔액(스냅샷)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.customer_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL
    REFERENCES public.customers(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0
    CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- tenant + customer 단위 1행 SSOT
CREATE UNIQUE INDEX IF NOT EXISTS customer_deposits_tenant_customer_uidx
  ON public.customer_deposits (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS customer_deposits_tenant_idx
  ON public.customer_deposits (tenant_id, updated_at DESC);

ALTER TABLE public.customer_deposits
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_deposits_tenant"
  ON public.customer_deposits
  FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

COMMENT ON TABLE public.customer_deposits IS
  '고객 예치금 잔액 스냅샷(부채). deposit_logs 합산값을 캐시/SSOT로 유지.';
COMMENT ON COLUMN public.customer_deposits.balance IS
  '현재 예치금 잔액(>=0).';

-- ============================================================
-- deposit_logs: 예치금 변동 이력(원장)
-- - credit: 예치금 증가(수금 초과분 발생 등)
-- - debit : 예치금 감소(예치금 사용/환불 등)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.deposit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL
    REFERENCES public.customers(id) ON DELETE CASCADE,
  amount integer NOT NULL
    CHECK (amount > 0),
  type text NOT NULL
    CHECK (type IN ('credit', 'debit')),
  reason text,
  payment_id uuid
    REFERENCES public.payments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deposit_logs_tenant_idx
  ON public.deposit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS deposit_logs_customer_idx
  ON public.deposit_logs (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS deposit_logs_payment_idx
  ON public.deposit_logs (payment_id);

ALTER TABLE public.deposit_logs
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deposit_logs_tenant"
  ON public.deposit_logs
  FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

COMMENT ON TABLE public.deposit_logs IS
  '예치금 변동 이력(credit/debit). 고객 예치금은 부채로 취급하며 물리 삭제하지 않는다.';
COMMENT ON COLUMN public.deposit_logs.payment_id IS
  '수금(payments)로부터 예치금이 발생/사용된 경우 연결(선택).';

