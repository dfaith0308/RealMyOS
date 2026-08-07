-- RECORD-ONLY: dumped from prod (cqiwcyuclpuarynrreat) via pg_get_functiondef
-- Purpose: track function in git; already exists on prod — do not treat as pending apply
-- Function: public.nextval_product_code()
-- Captured: 2026-08-07
CREATE OR REPLACE FUNCTION public.nextval_product_code()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select nextval('product_code_seq');
$function$;

-- Privileges as observed on prod (postgres owner grant omitted)
GRANT EXECUTE ON FUNCTION public.nextval_product_code() TO anon;
GRANT EXECUTE ON FUNCTION public.nextval_product_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.nextval_product_code() TO service_role;
