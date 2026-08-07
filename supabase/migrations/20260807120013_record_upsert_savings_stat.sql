-- RECORD-ONLY: dumped from prod (cqiwcyuclpuarynrreat) via pg_get_functiondef
-- Purpose: track function in git; already exists on prod — do not treat as pending apply
-- Function: public.upsert_savings_stat(p_tenant_id uuid, p_month text, p_saving integer)
-- Captured: 2026-08-07
CREATE OR REPLACE FUNCTION public.upsert_savings_stat(p_tenant_id uuid, p_month text, p_saving integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO savings_stats (tenant_id, month, total_saving, order_count)
  VALUES (p_tenant_id, p_month, p_saving, 1)
  ON CONFLICT (tenant_id, month)
  DO UPDATE SET
    total_saving = savings_stats.total_saving + EXCLUDED.total_saving,
    order_count  = savings_stats.order_count  + 1,
    updated_at   = now();
END;
$function$;

-- Privileges as observed on prod (postgres owner grant omitted)
GRANT EXECUTE ON FUNCTION public.upsert_savings_stat(p_tenant_id uuid, p_month text, p_saving integer) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_savings_stat(p_tenant_id uuid, p_month text, p_saving integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_savings_stat(p_tenant_id uuid, p_month text, p_saving integer) TO service_role;
