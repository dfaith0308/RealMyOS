CREATE TABLE public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payment_id uuid NOT NULL
    REFERENCES public.payments(id) ON DELETE CASCADE,
  purchase_id uuid
    REFERENCES public.purchases(id) ON DELETE SET NULL,
  allocated_amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_allocations_payment_idx
  ON public.payment_allocations (payment_id);

CREATE INDEX payment_allocations_purchase_idx
  ON public.payment_allocations (purchase_id)
  WHERE purchase_id IS NOT NULL;

ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_allocations_tenant_isolation"
  ON public.payment_allocations
  FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());
