-- FORENSIC: sales_schedules RLS 누락 수정
-- 운영 DB 적용 완료 (2026-05-08)
ALTER TABLE public.sales_schedules
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_schedules_tenant"
  ON public.sales_schedules FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

