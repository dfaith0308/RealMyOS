-- RECORD-ONLY: dumped from prod (cqiwcyuclpuarynrreat) via pg_get_functiondef
-- Purpose: track function in git; already exists on prod — do not treat as pending apply
-- Function: public.delete_user_on_auth_delete()
-- Captured: 2026-08-07
CREATE OR REPLACE FUNCTION public.delete_user_on_auth_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM users WHERE id = OLD.id;
  RETURN OLD;
END;
$function$;

-- Privileges as observed on prod (postgres owner grant omitted)
GRANT EXECUTE ON FUNCTION public.delete_user_on_auth_delete() TO anon;
GRANT EXECUTE ON FUNCTION public.delete_user_on_auth_delete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_on_auth_delete() TO service_role;
