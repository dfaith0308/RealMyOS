-- RECORD-ONLY: dumped from prod (cqiwcyuclpuarynrreat) via pg_get_functiondef
-- Purpose: track function in git; already exists on prod — do not treat as pending apply
-- Function: public.nextval_product_code_n(n integer)
-- Captured: 2026-08-07
CREATE OR REPLACE FUNCTION public.nextval_product_code_n(n integer)
 RETURNS integer[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result integer[];
  i integer;
begin
  result := array[]::integer[];
  for i in 1..n loop
    result := array_append(result, nextval('product_code_seq')::integer);
  end loop;
  return result;
end;
$function$;

-- Privileges as observed on prod (postgres owner grant omitted)
GRANT EXECUTE ON FUNCTION public.nextval_product_code_n(n integer) TO anon;
GRANT EXECUTE ON FUNCTION public.nextval_product_code_n(n integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nextval_product_code_n(n integer) TO service_role;
