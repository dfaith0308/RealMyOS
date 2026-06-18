-- 운영 DB 적용 완료
ALTER TABLE commerce_product_listings
ADD COLUMN IF NOT EXISTS barcode text,
ADD COLUMN IF NOT EXISTS item_report_number text;
