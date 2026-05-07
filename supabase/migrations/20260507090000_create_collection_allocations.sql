CREATE TABLE public.collection_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payment_id uuid NOT NULL
    REFERENCES public.payments(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  allocated_amount integer NOT NULL CHECK (allocated_amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 동일 payment+order 중복 방지
CREATE UNIQUE INDEX collection_allocations_payment_order_uidx
  ON public.collection_allocations (payment_id, order_id);

CREATE INDEX collection_allocations_payment_idx
  ON public.collection_allocations (payment_id);

CREATE INDEX collection_allocations_order_idx
  ON public.collection_allocations (order_id);

CREATE INDEX collection_allocations_tenant_idx
  ON public.collection_allocations (tenant_id, created_at DESC);

ALTER TABLE public.collection_allocations
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collection_allocations_tenant"
  ON public.collection_allocations
  FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

