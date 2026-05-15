-- PLATFORM-ERP-P2: allocation 취소 audit (confirmed_at / confirmed_by 와 동일 목적)
-- pending → cancelled 시에만 cancelled_at / cancelled_by 기록. confirmed 행은 자동 취소 대상 아님.

ALTER TABLE public.commerce_order_allocations
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.commerce_order_allocations
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

COMMENT ON COLUMN public.commerce_order_allocations.cancelled_at IS
  'status=pending → cancelled 전환 시각(자동/관리자 실행). confirmed 자동 취소 시 기록하지 않음.';

COMMENT ON COLUMN public.commerce_order_allocations.cancelled_by IS
  'pending → cancelled 처리를 실행한 관리자 users.id.';
