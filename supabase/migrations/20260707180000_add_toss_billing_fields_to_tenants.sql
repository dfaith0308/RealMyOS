-- Toss subscription billing fields for SupplierOS (2026-07-07)

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS billing_key text,
  ADD COLUMN IF NOT EXISTS toss_customer_key text;

-- Expand plan enum check to include monthly/annual identifiers used by /subscribe.
-- Keep legacy values for backward compatibility.
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_subscription_plan_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_subscription_plan_check
  CHECK (subscription_plan IN ('free', 'monthly', 'annual', 'earlybird', 'pro'));

COMMENT ON COLUMN public.tenants.billing_key IS 'TossPayments billingKey (server-only secret; never expose to client)';
COMMENT ON COLUMN public.tenants.toss_customer_key IS 'TossPayments customerKey (non-secret identifier)';

