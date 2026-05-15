CREATE OR REPLACE FUNCTION public.allocate_payment_fifo(
  p_tenant_id uuid,
  p_payment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_remaining integer;
  v_order RECORD;
  v_alloc_amount integer;
  v_allocated_total integer := 0;
  v_allocations jsonb := '[]'::jsonb;
BEGIN
  -- 1. tenant 검증
  IF p_tenant_id != get_my_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  -- 2. payment 조회 및 검증
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
    AND direction = 'inbound'
    AND status = 'confirmed'
    AND (payee_tenant_id = p_tenant_id OR tenant_id = p_tenant_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found or invalid'
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. 이미 배분된 금액 확인
  SELECT COALESCE(SUM(allocated_amount), 0)
    INTO v_allocated_total
  FROM public.collection_allocations
  WHERE payment_id = p_payment_id;

  v_remaining := v_payment.amount - v_allocated_total;

  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'status', 'already_allocated',
      'allocations', '[]'::jsonb
    );
  END IF;

  -- 4. FIFO: 미수금 주문을 order_date ASC로 조회
  FOR v_order IN
    SELECT
      o.id as order_id,
      o.order_date,
      o.final_amount,
      COALESCE(SUM(ca.allocated_amount), 0) as already_allocated
    FROM public.orders o
    LEFT JOIN public.collection_allocations ca ON ca.order_id = o.id
    WHERE (o.seller_tenant_id = p_tenant_id OR o.tenant_id = p_tenant_id)
      AND o.customer_id = v_payment.customer_id
      AND o.status = 'confirmed'
    GROUP BY o.id, o.order_date, o.final_amount
    HAVING o.final_amount > COALESCE(SUM(ca.allocated_amount), 0)
    ORDER BY o.order_date ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_alloc_amount := LEAST(
      v_remaining,
      v_order.final_amount - v_order.already_allocated
    );

    INSERT INTO public.collection_allocations (
      tenant_id, payment_id, order_id, allocated_amount
    ) VALUES (
      p_tenant_id, p_payment_id, v_order.order_id, v_alloc_amount
    )
    ON CONFLICT (payment_id, order_id) DO UPDATE
      SET allocated_amount = collection_allocations.allocated_amount + v_alloc_amount;

    v_remaining := v_remaining - v_alloc_amount;

    v_allocations := v_allocations || jsonb_build_object(
      'order_id', v_order.order_id,
      'allocated_amount', v_alloc_amount
    );
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'payment_id', p_payment_id,
    'allocated_count', jsonb_array_length(v_allocations),
    'unallocated_remaining', v_remaining,
    'allocations', v_allocations
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.allocate_payment_fifo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_payment_fifo(uuid, uuid) TO authenticated;

