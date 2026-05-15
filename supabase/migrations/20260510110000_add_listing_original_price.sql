-- 정상가 컬럼 추가 (절감액 계산용)
-- 운영 DB 적용 전 — 저장소만 반영, 실행은 배포 절차에 따름.
--
-- original_price: 정상가 (카페24/시중가 기준)
-- commerce_price: 식식이 판매가
-- 절감액 = original_price - commerce_price
-- original_price가 없으면 절감액 표시 안 함

ALTER TABLE public.commerce_product_listings
  ADD COLUMN IF NOT EXISTS original_price integer;

COMMENT ON COLUMN public.commerce_product_listings.original_price IS
  '시중/정상가(원). NULL이면 절감 UI 미표시. commerce_price 대비 참고용.';
