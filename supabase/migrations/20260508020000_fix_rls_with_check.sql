-- FORENSIC: RLS WITH CHECK 누락 수정
-- orders / payments / rfq_requests 쓰기 격리 추가
-- 운영 DB 적용 완료 (2026-05-08)

ALTER POLICY "orders: all" ON public.orders
  USING (
    (tenant_id = get_my_tenant_id()) OR
    (seller_tenant_id = get_my_tenant_id()) OR
    (buyer_tenant_id = get_my_tenant_id()) OR
    is_admin()
  )
  WITH CHECK (
    (tenant_id = get_my_tenant_id()) OR
    (seller_tenant_id = get_my_tenant_id()) OR
    (buyer_tenant_id = get_my_tenant_id()) OR
    is_admin()
  );

ALTER POLICY "payments: all" ON public.payments
  USING (
    (tenant_id = get_my_tenant_id()) OR
    (payee_tenant_id = get_my_tenant_id()) OR
    (payer_tenant_id = get_my_tenant_id()) OR
    is_admin()
  )
  WITH CHECK (
    (tenant_id = get_my_tenant_id()) OR
    (payee_tenant_id = get_my_tenant_id()) OR
    (payer_tenant_id = get_my_tenant_id()) OR
    is_admin()
  );

ALTER POLICY "tenant_isolation" ON public.rfq_requests
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());
