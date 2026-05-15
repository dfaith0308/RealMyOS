-- P0 storefront ERP bridge
-- RFQ/orders settlement flow must remain untouched
--
-- PLATFORM-ERP-P0-001: commerce_orders → payments 최소 연결
-- 운영 적용은 별도 승인·절차에 따름 (파일만 추가)

-- 1-1. commerce_order_id 컬럼 추가
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS commerce_order_id uuid
  REFERENCES public.commerce_orders(id);

-- 1-2. UNIQUE 부분 인덱스 (동일 storefront 주문 중복 payments 방지)
CREATE UNIQUE INDEX IF NOT EXISTS payments_commerce_order_id_unique
  ON public.payments (commerce_order_id)
  WHERE commerce_order_id IS NOT NULL;

-- 1-3. order_id / commerce_order_id 배타 CHECK
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_order_id_exclusive;
ALTER TABLE public.payments
  ADD CONSTRAINT chk_order_id_exclusive
  CHECK (
    NOT (
      order_id IS NOT NULL
      AND commerce_order_id IS NOT NULL
    )
  );

-- 1-4. payment_method CHECK 확장 (기존 transfer/cash/card/platform 유지 + storefront)
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_method_check
  CHECK (
    (payment_method::text) = ANY (ARRAY[
      'transfer',
      'cash',
      'card',
      'platform',
      'bank_transfer',
      'kakao_manual'
    ]::text[])
  );
