-- 운영 DB 적용 완료
ALTER TABLE commerce_product_listings
ADD COLUMN IF NOT EXISTS ai_strengths text,
ADD COLUMN IF NOT EXISTS ai_usage text,
ADD COLUMN IF NOT EXISTS ai_summary text;
