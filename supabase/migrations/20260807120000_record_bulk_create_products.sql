-- RECORD-ONLY: dumped from prod (cqiwcyuclpuarynrreat) via pg_get_functiondef
-- Purpose: track function in git; already exists on prod — do not treat as pending apply
-- Function: public.bulk_create_products(p_tenant_id uuid, p_user_id uuid, p_user_type text, p_today date, p_products jsonb)
-- Captured: 2026-08-07
CREATE OR REPLACE FUNCTION public.bulk_create_products(p_tenant_id uuid, p_user_id uuid, p_user_type text, p_today date, p_products jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item        jsonb;
  v_product_id  uuid;
  v_price       jsonb;
  v_count       integer := 0;
begin
  for v_item in select * from jsonb_array_elements(p_products)
  loop
    -- products insert
    insert into products (
      tenant_id, product_code, name, tax_type,
      category_id, procurement_type
    ) values (
      p_tenant_id,
      v_item->>'product_code',
      v_item->>'name',
      v_item->>'tax_type',
      nullif(v_item->>'category_id', '')::uuid,
      'consignment'
    )
    returning id into v_product_id;

    -- product_costs insert
    insert into product_costs (product_id, cost_price, start_date, end_date)
    values (
      v_product_id,
      (v_item->>'cost_price')::integer,
      p_today,
      null
    );

    -- product_prices insert
    for v_price in select * from jsonb_array_elements(v_item->'prices')
    loop
      insert into product_prices (product_id, price_type, price, bulk_min_quantity)
      values (
        v_product_id,
        v_price->>'price_type',
        (v_price->>'price')::integer,
        nullif(v_price->>'bulk_min_quantity', '')::integer
      );
    end loop;

    -- product_logs insert
    insert into product_logs (product_id, user_id, user_type, action, before_data, after_data)
    values (
      v_product_id,
      p_user_id,
      p_user_type,
      'bulk_create',
      null,
      v_item
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('inserted', v_count);
end;
$function$;

-- Privileges as observed on prod (postgres owner grant omitted)
GRANT EXECUTE ON FUNCTION public.bulk_create_products(p_tenant_id uuid, p_user_id uuid, p_user_type text, p_today date, p_products jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.bulk_create_products(p_tenant_id uuid, p_user_id uuid, p_user_type text, p_today date, p_products jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_create_products(p_tenant_id uuid, p_user_id uuid, p_user_type text, p_today date, p_products jsonb) TO service_role;
