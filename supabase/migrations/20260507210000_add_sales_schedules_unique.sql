-- SUP-PARTIAL-006-B: 영업스케줄 중복 방지
-- 같은 거래처 + 날짜 중복 스케줄 생성 금지
CREATE UNIQUE INDEX IF NOT EXISTS
  sales_schedules_customer_date_unique
  ON public.sales_schedules (tenant_id, customer_id, scheduled_date)
  WHERE status != 'cancelled';

