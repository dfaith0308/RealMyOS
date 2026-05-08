-- FORENSIC-004-C: 신뢰도 이력 추적
-- 운영 DB 적용 완료 (2026-05-08)

CREATE TABLE IF NOT EXISTS public.trust_score_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  role text NOT NULL,
  before_score integer,
  after_score integer,
  before_level integer,
  after_level integer,
  reason text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trust_score_logs_tenant_idx
  ON public.trust_score_logs (tenant_id, created_at DESC);

ALTER TABLE public.trust_score_logs
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trust_score_logs_admin" ON public.trust_score_logs;
CREATE POLICY "trust_score_logs_admin"
  ON public.trust_score_logs FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

