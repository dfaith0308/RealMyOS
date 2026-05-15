-- customer_tag_options: 분류 카테고리 옵션 관리 테이블
-- 모든 분류 카테고리의 옵션값을 DB에서 관리
-- 관리자가 직접 추가/수정/비활성화 가능

CREATE TABLE IF NOT EXISTS public.customer_tag_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  category text NOT NULL,
  value text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_tag_options_unique
  ON public.customer_tag_options (tenant_id, category, value)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS customer_tag_options_tenant_category_idx
  ON public.customer_tag_options (tenant_id, category, sort_order);

ALTER TABLE public.customer_tag_options
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_tag_options_tenant"
  ON public.customer_tag_options FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

