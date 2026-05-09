-- COMMERCE-003: commerce_orders 컬럼 추가
-- 운영 DB 적용 완료 (2026-05-09)

ALTER TABLE public.commerce_orders
  ADD COLUMN IF NOT EXISTS order_number text UNIQUE;

ALTER TABLE public.commerce_orders
  ADD COLUMN IF NOT EXISTS refund_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.commerce_orders
  ADD COLUMN IF NOT EXISTS refund_pending_at timestamptz;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS text AS $$
BEGIN
  RETURN 'ORD-' || TO_CHAR(now(), 'YYYYMMDD') || '-' ||
         LPAD(FLOOR(RANDOM() * 100000)::text, 5, '0');
END;
$$ LANGUAGE plpgsql;
