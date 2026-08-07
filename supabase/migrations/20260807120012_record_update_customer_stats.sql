-- RECORD-ONLY: dumped from prod (cqiwcyuclpuarynrreat) via pg_get_functiondef
-- Purpose: track function in git; already exists on prod — do not treat as pending apply
-- Function: public.update_customer_stats(p_tenant_id uuid, p_customer_id uuid, p_balance_delta integer, p_sales_delta integer, p_last_payment_date date)
-- Captured: 2026-08-07
CREATE OR REPLACE FUNCTION public.update_customer_stats(p_tenant_id uuid, p_customer_id uuid, p_balance_delta integer DEFAULT 0, p_sales_delta integer DEFAULT 0, p_last_payment_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- tenant_id 소유권 검증 추가
  if not exists (
    select 1 from customers
    where id = p_customer_id and tenant_id = p_tenant_id
  ) then
    raise exception 'tenant mismatch: customer_id=% tenant_id=%', p_customer_id, p_tenant_id;
  end if;

  insert into customer_stats (tenant_id, customer_id, current_balance, total_sales, last_payment_date)
  values (p_tenant_id, p_customer_id, p_balance_delta, p_sales_delta, p_last_payment_date)
  on conflict (customer_id) do update set
    current_balance   = customer_stats.current_balance + p_balance_delta,
    total_sales       = greatest(0, customer_stats.total_sales + p_sales_delta),
    last_payment_date = case
      when p_last_payment_date is not null
       and (customer_stats.last_payment_date is null
            or p_last_payment_date > customer_stats.last_payment_date)
      then p_last_payment_date
      else customer_stats.last_payment_date
    end,
    updated_at = now();
end;
$function$;

-- Privileges as observed on prod (postgres owner grant omitted)
GRANT EXECUTE ON FUNCTION public.update_customer_stats(p_tenant_id uuid, p_customer_id uuid, p_balance_delta integer, p_sales_delta integer, p_last_payment_date date) TO anon;
GRANT EXECUTE ON FUNCTION public.update_customer_stats(p_tenant_id uuid, p_customer_id uuid, p_balance_delta integer, p_sales_delta integer, p_last_payment_date date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_stats(p_tenant_id uuid, p_customer_id uuid, p_balance_delta integer, p_sales_delta integer, p_last_payment_date date) TO service_role;
