-- RECORD-ONLY: dumped from prod (cqiwcyuclpuarynrreat) via pg_get_functiondef
-- Purpose: track function in git; already exists on prod — do not treat as pending apply
-- Function: public.sync_quote_total_amount()
-- Captured: 2026-08-07
CREATE OR REPLACE FUNCTION public.sync_quote_total_amount()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_quote_id uuid;
BEGIN
  v_quote_id := COALESCE(NEW.quote_id, OLD.quote_id);
  UPDATE quotes
  SET total_amount = (
    SELECT COALESCE(SUM(line_total), 0)
    FROM quote_items WHERE quote_id = v_quote_id
  ), updated_at = now()
  WHERE id = v_quote_id;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Privileges as observed on prod (postgres owner grant omitted)
GRANT EXECUTE ON FUNCTION public.sync_quote_total_amount() TO anon;
GRANT EXECUTE ON FUNCTION public.sync_quote_total_amount() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_quote_total_amount() TO service_role;
