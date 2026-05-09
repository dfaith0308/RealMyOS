-- COMMERCE-001: 커머스 관련 테이블 생성
-- 운영 DB 적용 전 (미적용 상태)
-- 상태값은 docs/commerce/COMMERCE-FLOW.md 참조
-- Supabase에서 정무님이 직접 실행

-- 1. commerce_product_listings
CREATE TABLE IF NOT EXISTS public.commerce_product_listings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  product_id      uuid REFERENCES public.products(id),
  owner_type      text NOT NULL CHECK (owner_type IN ('platform','approved_supplier')),
  owner_tenant_id uuid NOT NULL,
  commerce_price  integer NOT NULL CHECK (commerce_price >= 0),
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','visible','hidden','sold_out','discontinued')),
  is_visible      boolean NOT NULL DEFAULT false,
  approved_by     uuid,
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS commerce_product_listings_tenant_idx
  ON public.commerce_product_listings (tenant_id, status)
  WHERE deleted_at IS NULL;

ALTER TABLE public.commerce_product_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commerce_listings_admin"
  ON public.commerce_product_listings FOR ALL
  USING (is_admin());

CREATE POLICY "commerce_listings_read"
  ON public.commerce_product_listings FOR SELECT
  USING (status = 'visible' AND is_visible = true AND deleted_at IS NULL);

-- 2. cart_items
CREATE TABLE IF NOT EXISTS public.cart_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  listing_id    uuid NOT NULL REFERENCES public.commerce_product_listings(id),
  quantity      integer NOT NULL CHECK (quantity > 0),
  cart_group_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cart_items_tenant_idx
  ON public.cart_items (tenant_id, cart_group_id);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cart_items_tenant"
  ON public.cart_items FOR ALL
  USING (tenant_id = get_my_tenant_id());

-- 3. commerce_orders
CREATE TABLE IF NOT EXISTS public.commerce_orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  source           text NOT NULL DEFAULT 'direct'
                   CHECK (source IN ('direct','rfq')),
  rfq_request_id   uuid,
  status           text NOT NULL DEFAULT 'pending_payment'
                   CHECK (status IN (
                     'pending_payment','paid','preparing',
                     'shipped','completed','cancelled','refunded'
                   )),
  payment_method   text NOT NULL
                   CHECK (payment_method IN ('card','bank_transfer','kakao_manual')),
  payment_status   text NOT NULL DEFAULT 'unpaid'
                   CHECK (payment_status IN ('unpaid','paid','refunded')),
  total_amount     integer NOT NULL CHECK (total_amount >= 0),
  shipping_name    text NOT NULL,
  shipping_phone   text NOT NULL,
  shipping_address text NOT NULL,
  delivery_memo    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commerce_orders_tenant_idx
  ON public.commerce_orders (tenant_id, status, created_at DESC);

ALTER TABLE public.commerce_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commerce_orders_tenant"
  ON public.commerce_orders FOR ALL
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "commerce_orders_admin"
  ON public.commerce_orders FOR ALL
  USING (is_admin());

-- 4. commerce_order_items
-- unit_price / total_price / listing_title 은 주문 시점 스냅샷
-- RULE-03: 이후 변경 금지
CREATE TABLE IF NOT EXISTS public.commerce_order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.commerce_orders(id),
  listing_id    uuid NOT NULL REFERENCES public.commerce_product_listings(id),
  quantity      integer NOT NULL CHECK (quantity > 0),
  unit_price    integer NOT NULL CHECK (unit_price >= 0),
  total_price   integer NOT NULL CHECK (total_price >= 0),
  listing_title text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commerce_order_items_order_idx
  ON public.commerce_order_items (order_id);

ALTER TABLE public.commerce_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commerce_order_items_tenant"
  ON public.commerce_order_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.commerce_orders o
      WHERE o.id = order_id
        AND o.tenant_id = get_my_tenant_id()
    )
  );

CREATE POLICY "commerce_order_items_admin"
  ON public.commerce_order_items FOR ALL
  USING (is_admin());
