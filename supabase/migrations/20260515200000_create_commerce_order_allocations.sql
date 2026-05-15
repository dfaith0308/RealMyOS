-- PLATFORM-ERP-P2-001: storefront 주문 라인별 공급자 payable allocation (최소 구조)
-- 운영 적용은 별도 승인

-- 0. Listing 단위 fulfillment 공급자(선택). NULL 이면 아래 식별 규칙으로 보완.
ALTER TABLE public.commerce_product_listings
  ADD COLUMN IF NOT EXISTS supplier_tenant_id uuid REFERENCES public.tenants (id);

COMMENT ON COLUMN public.commerce_product_listings.supplier_tenant_id IS
  'Fulfillment 공급자 테넌트(선택). NULL 일 때는 approved_supplier owner_tenant_id 또는 products.tenant_id 규칙으로 allocation 시도.';

-- 1. commerce_order_allocations
CREATE TABLE IF NOT EXISTS public.commerce_order_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  commerce_order_id uuid NOT NULL REFERENCES public.commerce_orders (id) ON DELETE CASCADE,
  commerce_order_item_id uuid NOT NULL REFERENCES public.commerce_order_items (id) ON DELETE CASCADE,

  supplier_tenant_id uuid NOT NULL REFERENCES public.tenants (id),

  item_amount integer NOT NULL,
  platform_fee_rate numeric(6, 4) NOT NULL DEFAULT 0,
  platform_fee_amount integer NOT NULL DEFAULT 0,
  supplier_payable_amount integer NOT NULL,

  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),

  confirmed_at timestamptz,
  confirmed_by uuid,
  note text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT commerce_order_allocations_amounts_nonneg CHECK (
    item_amount >= 0
    AND platform_fee_amount >= 0
    AND supplier_payable_amount >= 0
  ),
  CONSTRAINT commerce_order_allocations_fee_split CHECK (
    supplier_payable_amount + platform_fee_amount = item_amount
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS commerce_order_allocations_item_unique
  ON public.commerce_order_allocations (commerce_order_item_id);

CREATE INDEX IF NOT EXISTS commerce_order_allocations_order_idx
  ON public.commerce_order_allocations (commerce_order_id);

CREATE INDEX IF NOT EXISTS commerce_order_allocations_supplier_idx
  ON public.commerce_order_allocations (supplier_tenant_id);

CREATE INDEX IF NOT EXISTS commerce_order_allocations_status_idx
  ON public.commerce_order_allocations (status);

ALTER TABLE public.commerce_order_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commerce_order_allocations_admin_all"
  ON public.commerce_order_allocations
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "commerce_order_allocations_supplier_select"
  ON public.commerce_order_allocations
  FOR SELECT
  TO authenticated
  USING (supplier_tenant_id = public.get_my_tenant_id());

COMMENT ON TABLE public.commerce_order_allocations IS
  'Storefront paid 주문 품목별 공급자 지급 예정액 스냅샷. 자동 지급·정산 확정 아님.';
