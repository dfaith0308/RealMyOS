-- 상품 등록 전용 페이지 지원 컬럼 추가
-- 운영 DB 적용 전
ALTER TABLE public.commerce_product_listings
  ADD COLUMN IF NOT EXISTS admin_memo text,
  ADD COLUMN IF NOT EXISTS spec text;

-- admin_memo: 운영자 내부 메모 (구매자 비노출)
-- spec: 규격/용량 (브랜드/상품명과 분리 저장)
