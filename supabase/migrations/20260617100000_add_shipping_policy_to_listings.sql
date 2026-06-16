-- 운영 DB 적용 완료
ALTER TABLE commerce_product_listings
ADD COLUMN IF NOT EXISTS base_shipping_fee integer DEFAULT 3500,
ADD COLUMN IF NOT EXISTS free_shipping_qty integer,
ADD COLUMN IF NOT EXISTS bulk_qty integer,
ADD COLUMN IF NOT EXISTS bulk_discount_rate numeric(5,2);
