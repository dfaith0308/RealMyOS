-- PLATFORM-ERP-P2-003: confirmed allocation 기반 공급자 지급 예정 원장 (supplier_payables)
-- 실제 지급·payments SSOT 변경 없음. 운영 적용은 별도 승인.

CREATE TABLE IF NOT EXISTS public.supplier_payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  commerce_order_allocation_id uuid NOT NULL
    REFERENCES public.commerce_order_allocations (id) ON DELETE CASCADE,

  commerce_order_id uuid NOT NULL
    REFERENCES public.commerce_orders (id) ON DELETE CASCADE,

  commerce_order_item_id uuid NOT NULL
    REFERENCES public.commerce_order_items (id) ON DELETE CASCADE,

  supplier_tenant_id uuid NOT NULL
    REFERENCES public.tenants (id),

  payer_tenant_id uuid NOT NULL
    REFERENCES public.tenants (id),

  payee_tenant_id uuid NOT NULL
    REFERENCES public.tenants (id),

  item_amount integer NOT NULL,
  platform_fee_amount integer NOT NULL DEFAULT 0,
  payable_amount integer NOT NULL,

  status text NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('unpaid', 'paid', 'cancelled')),

  created_from text NOT NULL DEFAULT 'commerce_allocation',
  confirmed_at timestamptz,
  confirmed_by uuid,

  paid_at timestamptz,
  paid_by uuid,

  cancelled_at timestamptz,
  cancelled_by uuid,

  note text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT supplier_payables_amounts_nonneg CHECK (
    item_amount >= 0
    AND platform_fee_amount >= 0
    AND payable_amount >= 0
  ),
  CONSTRAINT supplier_payables_fee_split CHECK (
    payable_amount + platform_fee_amount = item_amount
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_payables_allocation_unique
  ON public.supplier_payables (commerce_order_allocation_id);

CREATE INDEX IF NOT EXISTS supplier_payables_supplier_idx
  ON public.supplier_payables (supplier_tenant_id);

CREATE INDEX IF NOT EXISTS supplier_payables_status_idx
  ON public.supplier_payables (status);

CREATE INDEX IF NOT EXISTS supplier_payables_order_idx
  ON public.supplier_payables (commerce_order_id);

ALTER TABLE public.supplier_payables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_payables_admin_all"
  ON public.supplier_payables
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "supplier_payables_supplier_select"
  ON public.supplier_payables
  FOR SELECT
  TO authenticated
  USING (supplier_tenant_id = public.get_my_tenant_id());

COMMENT ON TABLE public.supplier_payables IS
  'Storefront confirmed allocation 기반 지급 예정 채무(unpaid). 실제 지급·payments와 분리.';
