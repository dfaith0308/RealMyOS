-- HIGH: admin_settings SELECT 전면 허용 수정
-- DB 실행 금지 (migration 제안 파일)
--
-- 기존 정책:
--   CREATE POLICY "admin_settings_read" ... USING (true)
-- 수정:
--   인증된 사용자만 읽기 가능 (auth.role() = 'authenticated')

DROP POLICY IF EXISTS "admin_settings_read"
  ON public.admin_settings;

CREATE POLICY "admin_settings_read"
  ON public.admin_settings FOR SELECT
  USING (auth.role() = 'authenticated');

