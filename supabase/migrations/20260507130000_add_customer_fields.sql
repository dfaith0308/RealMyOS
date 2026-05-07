-- SUP-MISSING-002: 거래처 등록 필드 추가
-- PRODUCT §6-3 확정 필드 중 누락분
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS role text
    CHECK (role IN ('buyer', 'supplier', 'both')),
  ADD COLUMN IF NOT EXISTS contact_status text
    NOT NULL DEFAULT 'unknown'
    CHECK (contact_status IN
      ('unknown', 'safe_number', 'connected', 'converted'));

COMMENT ON COLUMN public.customers.payment_terms IS
  '결제조건 (즉시/말일/매월N일/N일후)';
COMMENT ON COLUMN public.customers.role IS
  '역할 (buyer=매출처/supplier=매입처/both=둘다)';
COMMENT ON COLUMN public.customers.contact_status IS
  '연락 상태 (unknown/safe_number/connected/converted)';

