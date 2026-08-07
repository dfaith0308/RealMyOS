-- RECORD-ONLY: dumped from prod (cqiwcyuclpuarynrreat) via pg_get_functiondef
-- Purpose: track function in git; already exists on prod — do not treat as pending apply
-- Function: public.create_payment_atomic(p_tenant_id uuid, p_customer_id uuid, p_amount integer, p_payment_date date, p_payment_method text, p_memo text, p_created_by uuid, p_collection_schedule_id uuid, p_order_id uuid)
-- Captured: 2026-08-07
CREATE OR REPLACE FUNCTION public.create_payment_atomic(p_tenant_id uuid, p_customer_id uuid, p_amount integer, p_payment_date date, p_payment_method text, p_memo text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid, p_collection_schedule_id uuid DEFAULT NULL::uuid, p_order_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_opening        integer := 0;
  v_total_orders   integer := 0;
  v_total_paid     integer := 0;
  v_balance_before integer;
  v_deposit        integer;
  v_payment_id     uuid;
BEGIN
  SELECT COALESCE(opening_balance, 0) INTO v_opening
    FROM customers WHERE id = p_customer_id AND tenant_id = p_tenant_id;

  SELECT COALESCE(SUM(COALESCE(final_amount, total_amount)), 0) INTO v_total_orders
    FROM orders
   WHERE customer_id = p_customer_id AND tenant_id = p_tenant_id
     AND status = 'confirmed' AND deleted_at IS NULL;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM payments
   WHERE customer_id = p_customer_id AND tenant_id = p_tenant_id
     AND status = 'confirmed';

  v_balance_before := v_opening + v_total_orders - v_total_paid;
  v_deposit        := GREATEST(0, p_amount - v_balance_before);

  INSERT INTO payments (
    tenant_id, customer_id, amount, deposit_amount,
    payment_date, payment_method, memo,
    status, created_by, order_id, created_at
  ) VALUES (
    p_tenant_id, p_customer_id, p_amount, v_deposit,
    p_payment_date, p_payment_method, p_memo,
    'confirmed', p_created_by, p_order_id, NOW()
  )
  RETURNING id INTO v_payment_id;

  IF p_collection_schedule_id IS NOT NULL THEN
    UPDATE collection_schedules
       SET status = 'done', updated_at = NOW()
     WHERE id = p_collection_schedule_id AND tenant_id = p_tenant_id;
  END IF;

  RETURN json_build_object(
    'id',             v_payment_id,
    'applied_amount', p_amount,
    'deposit_amount', v_deposit,
    'balance_before', v_balance_before
  );
END;
$function$;

-- Privileges as observed on prod (postgres owner grant omitted)
GRANT EXECUTE ON FUNCTION public.create_payment_atomic(p_tenant_id uuid, p_customer_id uuid, p_amount integer, p_payment_date date, p_payment_method text, p_memo text, p_created_by uuid, p_collection_schedule_id uuid, p_order_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.create_payment_atomic(p_tenant_id uuid, p_customer_id uuid, p_amount integer, p_payment_date date, p_payment_method text, p_memo text, p_created_by uuid, p_collection_schedule_id uuid, p_order_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_atomic(p_tenant_id uuid, p_customer_id uuid, p_amount integer, p_payment_date date, p_payment_method text, p_memo text, p_created_by uuid, p_collection_schedule_id uuid, p_order_id uuid) TO service_role;
