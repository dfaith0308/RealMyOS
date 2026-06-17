-- 운영 DB 적용 완료
ALTER TABLE commerce_product_listings
ADD COLUMN IF NOT EXISTS origin text,
ADD COLUMN IF NOT EXISTS storage_method text,
ADD COLUMN IF NOT EXISTS min_order_qty integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS package_unit text,
ADD COLUMN IF NOT EXISTS usage_desc text,
ADD COLUMN IF NOT EXISTS allergen text;
