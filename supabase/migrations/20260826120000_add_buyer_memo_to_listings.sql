-- 상세이미지 자동생성용 고객노출 부가설명 컬럼 추가
-- WARNING: Migration file only. Do not execute without approval.

ALTER TABLE public.commerce_product_listings
  ADD COLUMN IF NOT EXISTS buyer_memo text;

COMMENT ON COLUMN public.commerce_product_listings.buyer_memo IS '부가설명 — 구매자 노출 (상세이미지 자동생성 템플릿에 표시). 내부 전용 admin_memo와 별개.';
