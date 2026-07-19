-- 주문 등록 시 예치금 자동 차감
-- - orders.deposit_used: 예치금으로 상계한 금액
-- - final_amount: total - discount - point - deposit_used
-- - deposit_logs.order_id: 주문 연결(append-only)

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS deposit_used integer NOT NULL DEFAULT 0
  CHECK (deposit_used >= 0);

COMMENT ON COLUMN public.orders.deposit_used IS
  '예치금 자동/수동 상계액. final_amount에서 차감. 적립금(point_used)과 별개.';

ALTER TABLE public.orders DROP COLUMN IF EXISTS final_amount;

ALTER TABLE public.orders
  ADD COLUMN final_amount integer
  GENERATED ALWAYS AS (
    GREATEST(
      0,
      COALESCE(total_amount, 0)
        - COALESCE(discount_amount, 0)
        - COALESCE(point_used, 0)
        - COALESCE(deposit_used, 0)
    )
  ) STORED;

COMMENT ON COLUMN public.orders.final_amount IS
  '실청구액 = total_amount - discount_amount - point_used - deposit_used (generated)';

ALTER TABLE public.deposit_logs
  ADD COLUMN IF NOT EXISTS order_id uuid
  REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS deposit_logs_order_idx
  ON public.deposit_logs (order_id)
  WHERE order_id IS NOT NULL;

COMMENT ON COLUMN public.deposit_logs.order_id IS
  '주문 예치금 차감/복구 시 연결(선택). payment_id와 병행 가능.';
