-- SUP-TODO-001-C: 동일 RFQ에 동일 공급자 테넌트 중복 입찰 방지
-- 적용: 승인된 배포 파이프라인에서만 실행.
-- 참고: supplier_tenant_id가 NULL인 기존 행이 복수 있으면 제약 추가 전 정리 필요.

ALTER TABLE public.rfq_bids
  ADD CONSTRAINT rfq_bids_rfq_supplier_unique
  UNIQUE (rfq_id, supplier_tenant_id);
