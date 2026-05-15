-- FORENSIC: 누락된 RLS 정책 추가
-- 운영 DB 적용 완료 (2026-05-08)

-- tenant_relationships RLS
ALTER TABLE public.tenant_relationships
  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_relationships_tenant"
  ON public.tenant_relationships FOR ALL
  USING (
    requester_tenant_id = get_my_tenant_id() OR
    target_tenant_id = get_my_tenant_id() OR
    is_admin()
  )
  WITH CHECK (
    requester_tenant_id = get_my_tenant_id() OR
    is_admin()
  );

-- action_queue RLS (관리자만)
ALTER TABLE public.action_queue
  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "action_queue_admin"
  ON public.action_queue FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- admin_settings RLS (관리자만)
ALTER TABLE public.admin_settings
  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_settings_admin"
  ON public.admin_settings FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
