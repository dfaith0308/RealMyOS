-- 커머스 상품 이미지/설명 컬럼 추가
-- 운영 DB 적용 완료 (2026-05-09)

ALTER TABLE public.commerce_product_listings
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS image_urls text[],
  ADD COLUMN IF NOT EXISTS description text;
