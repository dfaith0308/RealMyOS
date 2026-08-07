-- RECORD-ONLY: dumped from prod (cqiwcyuclpuarynrreat) via pg_get_functiondef
-- Purpose: track function in git; already exists on prod — do not treat as pending apply
-- Function: public.is_admin()
-- Captured: 2026-08-07
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from users
    where id = auth.uid()
      and (tenant_id is null or tenant_id = '00000000-0000-0000-0000-000000000000')
      and role = 'admin'
  )
$function$;

-- Privileges as observed on prod (postgres owner grant omitted)
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;
