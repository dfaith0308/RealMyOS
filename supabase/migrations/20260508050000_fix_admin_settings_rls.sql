-- FORENSIC: admin_settings RLS 정책 수정
-- 읽기: 누구나 (정책키 소비 코드 접근 필요)
-- 쓰기: 관리자만
-- 운영 DB 적용 완료 (2026-05-08)

DROP POLICY IF EXISTS "admin_settings_admin"
  ON public.admin_settings;

CREATE POLICY "admin_settings_read"
  ON public.admin_settings FOR SELECT
  USING (true);

CREATE POLICY "admin_settings_write"
  ON public.admin_settings FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "admin_settings_update"
  ON public.admin_settings FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "admin_settings_delete"
  ON public.admin_settings FOR DELETE
  USING (is_admin());
