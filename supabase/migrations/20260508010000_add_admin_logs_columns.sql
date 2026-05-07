-- FORENSIC: admin_logs 컬럼 불일치 수정
-- 앱 코드 기준으로 컬럼 확장
-- 운영 DB 적용 완료 (2026-05-08)
ALTER TABLE public.admin_logs
  ADD COLUMN IF NOT EXISTS admin_id uuid,
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS target_table text,
  ADD COLUMN IF NOT EXISTS target_id uuid,
  ADD COLUMN IF NOT EXISTS old_value jsonb,
  ADD COLUMN IF NOT EXISTS new_value jsonb;

COMMENT ON COLUMN public.admin_logs.admin_id IS
  '실행한 관리자 user_id';
COMMENT ON COLUMN public.admin_logs.tenant_id IS
  '대상 테넌트 (admin_tenant_id와 구분)';
COMMENT ON COLUMN public.admin_logs.reason IS
  '실행 이유/분류 키';
COMMENT ON COLUMN public.admin_logs.target_table IS
  '변경 대상 테이블명';
COMMENT ON COLUMN public.admin_logs.target_id IS
  '변경 대상 레코드 ID';
COMMENT ON COLUMN public.admin_logs.old_value IS
  '변경 전 값';
COMMENT ON COLUMN public.admin_logs.new_value IS
  '변경 후 값';
