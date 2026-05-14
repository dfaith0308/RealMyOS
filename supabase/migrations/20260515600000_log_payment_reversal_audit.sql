-- APPEND-ONLY-CONVERGENCE-P1-001: supplier 세션에서 payment reversal 감사 로그(admin_logs) 기록
-- RLS(is_admin) 우회 — SECURITY DEFINER + get_my_tenant_id() 검증
-- 운영 DB 적용은 별도 승인.

CREATE OR REPLACE FUNCTION public.log_payment_reversal_audit(
  p_action_type text,
  p_tenant_id uuid,
  p_new_value jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_platform uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF p_tenant_id IS DISTINCT FROM public.get_my_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_action_type NOT IN (
    'outbound_payment_reversal_created',
    'outbound_payment_reversal_failed',
    'outbound_payment_reversal_legacy_fallback_used',
    'inbound_payment_reversal_created',
    'inbound_payment_reversal_failed',
    'inbound_payment_reversal_legacy_fallback_used',
    'payment_type_missing_warned',
    'payment_type_missing_rejected'
  ) THEN
    RAISE EXCEPTION 'invalid action_type' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_logs (
    admin_tenant_id,
    admin_id,
    tenant_id,
    action_type,
    target_tenant_id,
    payload,
    reason,
    target_table,
    new_value
  ) VALUES (
    v_platform,
    auth.uid(),
    p_tenant_id,
    p_action_type,
    p_tenant_id,
    coalesce(p_new_value, '{}'::jsonb),
    'payment_reversal_p1',
    'payments',
    coalesce(p_new_value, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_payment_reversal_audit(text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_payment_reversal_audit(text, uuid, jsonb) TO authenticated;
