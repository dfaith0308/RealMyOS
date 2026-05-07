-- fix: product_related_manual migration 소급 생성
-- - 운영 DB에 존재하나 저장소 migrations에 누락된 테이블 추적 보완
-- - SUP-MISSING-009(연관상품 수동등록) 기반

CREATE TABLE IF NOT EXISTS public.product_related_manual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL
    REFERENCES public.products(id) ON DELETE CASCADE,
  related_product_id uuid NOT NULL
    REFERENCES public.products(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

-- 동일 product에 동일 related 중복 방지(soft 비활성화 고려: 충돌 허용 대신 업데이트로 복구는 앱에서 수행)
CREATE UNIQUE INDEX IF NOT EXISTS product_related_manual_tenant_product_related_uidx
  ON public.product_related_manual (tenant_id, product_id, related_product_id);

CREATE INDEX IF NOT EXISTS product_related_manual_tenant_product_idx
  ON public.product_related_manual (tenant_id, product_id);

CREATE INDEX IF NOT EXISTS product_related_manual_related_idx
  ON public.product_related_manual (related_product_id);

ALTER TABLE public.product_related_manual
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_related_manual_tenant"
  ON public.product_related_manual
  FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

COMMENT ON TABLE public.product_related_manual IS
  '상품 수동 연관상품 매핑(soft deactivate).';
COMMENT ON COLUMN public.product_related_manual.is_active IS
  '활성 여부(물리 삭제 금지).';

