-- SUP-MISSING-013: 거래처별 단가 시스템
-- customer_product_prices 누락 컬럼 추가
-- PRODUCT §6-6 상품관리 확정
ALTER TABLE public.customer_product_prices
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS source text
    CHECK (source IN ('quote', 'order'));

COMMENT ON TABLE public.customer_product_prices IS
  '거래처별 상품 단가 기억 시스템.
   견적가/주문가 기반 자동 갱신.
   주문등록 시 이 테이블에서 최근 거래가 자동 추천';
COMMENT ON COLUMN public.customer_product_prices.tenant_id IS
  'tenant_id (RULE-01)';
COMMENT ON COLUMN public.customer_product_prices.source IS
  '가격 출처: quote(견적) / order(주문)';

