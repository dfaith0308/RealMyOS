-- RECORD-ONLY: dumped from prod (cqiwcyuclpuarynrreat) via pg_get_functiondef
-- Purpose: track function in git; already exists on prod — do not treat as pending apply
-- Function: public.soft_delete_customer(p_customer_id uuid, p_tenant_id uuid, p_deleted_by uuid)
-- Captured: 2026-08-07
CREATE OR REPLACE FUNCTION public.soft_delete_customer(p_customer_id uuid, p_tenant_id uuid, p_deleted_by uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order_count   integer;
  v_payment_count integer;
begin
  if not exists (
    select 1 from customers
    where id        = p_customer_id
      and tenant_id = p_tenant_id
      and deleted_at is null
  ) then
    raise exception 'customer not found or already deleted';
  end if;

  select count(*) into v_order_count
  from orders
  where customer_id = p_customer_id
    and tenant_id   = p_tenant_id
    and status      = 'confirmed';

  if v_order_count > 0 then
    raise exception 'has_orders';
  end if;

  select count(*) into v_payment_count
  from payments
  where customer_id = p_customer_id
    and tenant_id   = p_tenant_id
    and status      = 'confirmed';

  if v_payment_count > 0 then
    raise exception 'has_payments';
  end if;

  -- soft delete (deleted_at is null 조건으로 중복 삭제 방지)
  update customers
  set
    deleted_at = now(),
    deleted_by = p_deleted_by
  where id        = p_customer_id
    and tenant_id = p_tenant_id
    and deleted_at is null;

  return 'ok';
end;
$function$;

-- Privileges as observed on prod (postgres owner grant omitted)
GRANT EXECUTE ON FUNCTION public.soft_delete_customer(p_customer_id uuid, p_tenant_id uuid, p_deleted_by uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_customer(p_customer_id uuid, p_tenant_id uuid, p_deleted_by uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_customer(p_customer_id uuid, p_tenant_id uuid, p_deleted_by uuid) TO service_role;
