-- orders.final_amount: generated 식이 할인·적립금을 빼지 않아
-- point_used/discount_amount 저장 후에도 final_amount = total_amount 로 남던 문제 수정.
--
-- 기존: (추정) total_amount 만 반영 또는 잘못된 expression
-- 변경: total_amount - discount_amount - point_used (0 미만 방지)

ALTER TABLE public.orders DROP COLUMN IF EXISTS final_amount;

ALTER TABLE public.orders
  ADD COLUMN final_amount integer
  GENERATED ALWAYS AS (
    GREATEST(
      0,
      COALESCE(total_amount, 0) - COALESCE(discount_amount, 0) - COALESCE(point_used, 0)
    )
  ) STORED;

COMMENT ON COLUMN public.orders.final_amount IS
  '실청구액 = total_amount - discount_amount - point_used (generated)';
