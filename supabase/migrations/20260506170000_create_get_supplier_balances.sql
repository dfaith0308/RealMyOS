CREATE OR REPLACE FUNCTION public.get_supplier_balances(
  p_tenant_id uuid
)
RETURNS TABLE (
  counterparty_name text,
  total_unpaid      bigint,
  oldest_due_date   date
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    counterparty_name,
    SUM(amount)::bigint AS total_unpaid,
    MIN(due_date::date) AS oldest_due_date
  FROM public.payments
  WHERE payer_tenant_id = p_tenant_id
    AND direction = 'outbound'
    AND status = 'pending'
  GROUP BY counterparty_name
  ORDER BY total_unpaid DESC;
$$;

