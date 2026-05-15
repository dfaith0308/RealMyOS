-- SUP-MISSING-003: 상품 인텔리전스 필드 추가
-- PRODUCT §6-6 상품관리 확정 필드
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ingredients text,
  ADD COLUMN IF NOT EXISTS item_report_number text;

COMMENT ON COLUMN public.products.ingredients IS
  '원재료명 및 함량 (선택 입력, 상품 인텔리전스 기능 활성화)';
COMMENT ON COLUMN public.products.item_report_number IS
  '품목보고번호 (선택 입력, 상품 식별용 고유 값)';

