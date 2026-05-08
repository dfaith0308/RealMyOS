-- FORENSIC-003-A: settlement proof attachment (MVP) -> settlement memo column
-- WARNING: Migration file only. Do not execute without approval.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS settlement_memo text;

-- optional: length guidance (app will clamp to 500 chars)
-- COMMENT ON COLUMN public.payments.settlement_memo IS '정산 증빙 번호/메모 (관리자 입력)';

