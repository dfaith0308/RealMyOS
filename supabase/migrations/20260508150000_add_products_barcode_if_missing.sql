-- SUP-MISSING-011: products.barcode (PRODUCT §6-6 검색/등록)
-- WARNING: Migration file only. Do not execute without approval.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode text;

CREATE INDEX IF NOT EXISTS products_tenant_barcode_idx
  ON public.products (tenant_id, barcode)
  WHERE barcode IS NOT NULL AND deleted_at IS NULL;
