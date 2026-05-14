-- ACCOUNTING-REVERSAL-P0-001: append-only reversal 메타 + storefront payments 다건 허용(원본 1건 + reversal row)
-- 운영 DB 적용은 별도 승인.

-- ---------------------------------------------------------------------------
-- 1) payments: reversal 링크·사유·주체·시각 (nullable)
-- ---------------------------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS reversal_of_id uuid REFERENCES public.payments (id);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS reversal_reason text;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS reversed_by uuid;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz;

-- 기존 UNIQUE: 동일 commerce_order_id 에 복수 행 불가 → reversal row 추가 불가
DROP INDEX IF EXISTS public.payments_commerce_order_id_unique;

-- 원본 입금 row(reversal_of_id IS NULL)만 주문당 1건 유지; reversal row 는 동일 주문 ID 허용
CREATE UNIQUE INDEX IF NOT EXISTS payments_commerce_order_id_primary_unique
  ON public.payments (commerce_order_id)
  WHERE commerce_order_id IS NOT NULL AND reversal_of_id IS NULL;

-- 동일 원본에 대한 reversal 중복 방지(선택적 P0 방어)
CREATE UNIQUE INDEX IF NOT EXISTS payments_reversal_of_id_unique
  ON public.payments (reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_reversal_of_id_idx
  ON public.payments (reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

COMMENT ON COLUMN public.payments.reversal_of_id IS
  'ACCOUNTING-REVERSAL-P0-001: 상쇄 대상 원본 payments.id (append-only reversal row).';

-- ---------------------------------------------------------------------------
-- 2) supplier_payables: 취소·역처리 메타 (nullable; reversal_of_id 는 P0 비포함)
-- ---------------------------------------------------------------------------
ALTER TABLE public.supplier_payables
  ADD COLUMN IF NOT EXISTS reversal_reason text;

ALTER TABLE public.supplier_payables
  ADD COLUMN IF NOT EXISTS reversed_by uuid;

ALTER TABLE public.supplier_payables
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz;

CREATE INDEX IF NOT EXISTS supplier_payables_reversed_at_idx
  ON public.supplier_payables (reversed_at)
  WHERE reversed_at IS NOT NULL;
