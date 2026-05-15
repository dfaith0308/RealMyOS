-- SUP-PARTIAL-004: payments.status allow pending
-- WARNING: Incremental migration file. Do not execute without approval.

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'confirmed', 'reversed'));

