-- SUP-PARTIAL-006-D: 영업이력 성과 연결
-- 이 영업 → 주문 발생 여부 추적
ALTER TABLE public.contact_logs
  ADD COLUMN IF NOT EXISTS converted_order_id uuid
    REFERENCES public.orders(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.contact_logs.converted_order_id IS
  '이 영업 활동으로 발생한 주문 ID (영업→주문 전환 추적)';

