-- SUP-PARTIAL-002-B/C/D: 견적 관련 필드 추가
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS quote_number text;
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

COMMENT ON COLUMN public.quotes.quote_number IS
  '견적번호 자동생성 (QUO-YYYYMMDD-NNNN)';
COMMENT ON COLUMN public.quote_items.tenant_id IS
  'tenant_id (RULE-01)';

