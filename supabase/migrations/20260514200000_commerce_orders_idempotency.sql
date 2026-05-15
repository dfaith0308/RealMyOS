-- Storefront 주문 멱등성: 동일 checkout 제출 재시도 시 주문 1건만 유지
-- COMMERCE-005 / createCommerceOrder (resturant_os) — 운영 적용 시 배포 절차에 따름

ALTER TABLE public.commerce_orders
  ADD COLUMN IF NOT EXISTS checkout_submission_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

COMMENT ON COLUMN public.commerce_orders.checkout_submission_id IS
  '식당OS 클라이언트가 주문 제출 시마다 발급하는 UUID; 동일 값 재전송 시 기존 주문을 반환';
COMMENT ON COLUMN public.commerce_orders.idempotency_key IS
  'tenant·user·장바구니·배송·결제 스냅샷 기반 SHA256(hex); checkout_submission_id와 함께 유일';

CREATE UNIQUE INDEX IF NOT EXISTS commerce_orders_tenant_checkout_submission_uq
  ON public.commerce_orders (tenant_id, checkout_submission_id)
  WHERE checkout_submission_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS commerce_orders_tenant_idempotency_key_uq
  ON public.commerce_orders (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
