-- fix: RULE-10 / RULE-01 (quotes)
-- 운영 DB 적용 완료 (2026-05-08)
-- - quote_items physical delete → is_active soft delete
-- - quote_logs tenant_id 기록

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS quote_items_quote_active_idx
  ON public.quote_items (quote_id)
  WHERE is_active = true;

ALTER TABLE public.quote_logs
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

CREATE INDEX IF NOT EXISTS quote_logs_tenant_idx
  ON public.quote_logs (tenant_id, created_at DESC);

