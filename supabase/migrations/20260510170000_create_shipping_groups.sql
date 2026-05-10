-- 묶음배송 그룹 테이블 생성
-- 운영 DB 적용 완료 (2026-05-10)

CREATE TABLE IF NOT EXISTS public.shipping_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipping_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shipping_groups_admin"
  ON public.shipping_groups FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

ALTER TABLE public.commerce_product_listings
  ADD COLUMN IF NOT EXISTS shipping_group_id uuid
  REFERENCES public.shipping_groups(id);
