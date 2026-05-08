-- FORENSIC: customer_stats RLS 누락 수정
-- 운영 DB 적용 완료 (2026-05-08)
ALTER TABLE public.customer_stats
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_stats_tenant"
  ON public.customer_stats FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());
