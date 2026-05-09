-- 브랜드명/배송유형/플랫폼 카테고리(listing 전용) 컬럼 추가
-- 운영 DB 적용 완료 (2026-05-10)
-- products 원본은 변경하지 않음. category_id 는 commerce_product_listings 전용.
--
-- 향후 shipping_badges text[] 구조로 확장 예정
-- 현재는 MVP 단일값(shipping_type) 유지

ALTER TABLE public.commerce_product_listings
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS shipping_type text DEFAULT 'free'
    CHECK (shipping_type IN ('free','paid','cold','same_day')),
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.product_categories(id);

COMMENT ON COLUMN public.commerce_product_listings.brand_name IS
  'Listing 전용 브랜드 표기. products 와 독립.';
COMMENT ON COLUMN public.commerce_product_listings.shipping_type IS
  'free | paid | cold | same_day — MVP 단일값.';
COMMENT ON COLUMN public.commerce_product_listings.category_id IS
  '플랫폼 product_categories (대분류). listing 전용, products.category_id 미사용.';
