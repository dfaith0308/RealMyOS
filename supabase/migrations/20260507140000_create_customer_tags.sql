-- SUP-MISSING-001: 거래처 분류 시스템
-- PRODUCT §6-3 Category/Value 구조
-- 물리 삭제 금지, 변경 이력 필수

CREATE TABLE public.customer_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL
    REFERENCES public.customers(id) ON DELETE CASCADE,
  category text NOT NULL,
  value text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX customer_tags_unique_active
  ON public.customer_tags (tenant_id, customer_id, category)
  WHERE is_active = true;

CREATE INDEX customer_tags_tenant_customer_idx
  ON public.customer_tags (tenant_id, customer_id);

CREATE INDEX customer_tags_tenant_category_idx
  ON public.customer_tags (tenant_id, category, value);

CREATE TABLE public.customer_tag_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  category text NOT NULL,
  before_value text,
  after_value text,
  action text NOT NULL
    CHECK (action IN ('create', 'update', 'deactivate')),
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_tag_logs_tenant_customer_idx
  ON public.customer_tag_logs (tenant_id, customer_id);

ALTER TABLE public.customer_tags
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_tags_tenant"
  ON public.customer_tags FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

ALTER TABLE public.customer_tag_logs
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_tag_logs_tenant"
  ON public.customer_tag_logs FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

