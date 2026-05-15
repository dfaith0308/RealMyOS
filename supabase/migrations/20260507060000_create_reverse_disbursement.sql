-- SUP-TODO-002-D: outbound 지급 취소 + purchases.status 재계산 (RULE-10/11/19/20)
-- WARNING: 운영 DB 실행 전 리뷰·승인 필요. 로컬/CI에서 임의 적용 금지.
--
-- 동작:
-- 1) 테넌트 검증 (p_tenant_id = get_my_tenant_id()).
-- 2) 대상 payments 검증: direction='outbound' AND (payer_tenant_id|tenant_id = p_tenant_id) AND status <> 'reversed'.
-- 3) payments.status = 'reversed' (RULE-10: 물리 삭제 금지).
-- 4) 해당 payment에 묶인 purchase_id 집합 조회.
-- 5) 각 purchase.status 재계산:
--    - effective_paid = SUM(payment_allocations.allocated_amount) WHERE purchase_id=v_pid
--                       AND payments.status IN ('pending','confirmed')
--    - paid: effective_paid >= total_amount, partial: > 0, else: unpaid
-- 6) payment_allocations 자체는 보존 (이력 = 부모 payments.status='reversed'로 흐름).

CREATE OR REPLACE FUNCTION public.reverse_disbursement(
  p_tenant_id uuid,
  p_payment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_ids uuid[];
  v_pid uuid;
  v_effective_paid integer;
  v_total_amount integer;
  v_new_status text;
BEGIN
  -- 1. tenant 검증
  IF p_tenant_id != get_my_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  -- 2. 대상 payments 검증
  IF NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE id = p_payment_id
      AND direction = 'outbound'
      AND (payer_tenant_id = p_tenant_id OR tenant_id = p_tenant_id)
      AND status != 'reversed'
  ) THEN
    RAISE EXCEPTION 'payment not found or already reversed'
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. payments.status = reversed
  UPDATE public.payments
    SET status = 'reversed', updated_at = now()
  WHERE id = p_payment_id;

  -- 4. 영향받은 purchase_id 목록
  SELECT ARRAY_AGG(DISTINCT purchase_id)
    INTO v_purchase_ids
  FROM public.payment_allocations
  WHERE payment_id = p_payment_id
    AND purchase_id IS NOT NULL;

  -- 5. 각 purchase.status 재계산
  IF v_purchase_ids IS NOT NULL THEN
    FOREACH v_pid IN ARRAY v_purchase_ids
    LOOP
      SELECT COALESCE(SUM(pa.allocated_amount), 0)
        INTO v_effective_paid
      FROM public.payment_allocations pa
      JOIN public.payments p ON p.id = pa.payment_id
      WHERE pa.purchase_id = v_pid
        AND p.status IN ('pending', 'confirmed');

      SELECT total_amount INTO v_total_amount
      FROM public.purchases WHERE id = v_pid;

      v_new_status := CASE
        WHEN v_effective_paid >= v_total_amount THEN 'paid'
        WHEN v_effective_paid > 0 THEN 'partial'
        ELSE 'unpaid'
      END;

      UPDATE public.purchases
        SET status = v_new_status, updated_at = now()
      WHERE id = v_pid;
    END LOOP;
  END IF;

  RETURN p_payment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reverse_disbursement(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_disbursement(uuid, uuid) TO authenticated;
