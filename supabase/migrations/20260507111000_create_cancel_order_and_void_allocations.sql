CREATE OR REPLACE FUNCTION public.cancel_order_and_void_allocations(
  p_tenant_id uuid,
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_voided_count integer := 0;
BEGIN
  -- 1) tenant 검증
  IF p_tenant_id != get_my_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  -- 2) 주문 조회 + tenant 보호
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND status != 'cancelled'
    AND (seller_tenant_id = p_tenant_id OR tenant_id = p_tenant_id)
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found or already cancelled'
      USING ERRCODE = 'P0002';
  END IF;

  -- 3) 주문 취소 (물리 삭제 금지)
  UPDATE public.orders
  SET status = 'cancelled'
  WHERE id = p_order_id;

  -- 4) 연결된 수금 배분 void 처리 (RULE-10: 물리 삭제 금지)
  UPDATE public.collection_allocations
  SET
    status = 'voided',
    voided_at = now(),
    voided_reason = 'order_cancelled'
  WHERE order_id = p_order_id
    AND tenant_id = p_tenant_id
    AND status = 'active';

  GET DIAGNOSTICS v_voided_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'status', 'success',
    'order_id', p_order_id,
    'voided_allocations', v_voided_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_order_and_void_allocations(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_order_and_void_allocations(uuid, uuid) TO authenticated;

