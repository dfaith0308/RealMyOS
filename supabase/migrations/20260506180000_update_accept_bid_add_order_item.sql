-- RES-PARTIAL-002-B: accept_bid_and_create_order_atomic — add restaurant_order_items insert
-- WARNING: Migration draft file only. Do not execute without approval.
-- RPC: public.accept_bid_and_create_order_atomic

CREATE OR REPLACE FUNCTION public.accept_bid_and_create_order_atomic(
  p_tenant_id        uuid,
  p_rfq_id           uuid,
  p_bid_id           uuid,
  p_payment_due_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_rfq           public.rfq_requests%ROWTYPE;
  v_bid           public.rfq_bids%ROWTYPE;
  v_order_id      uuid;
  v_payment_id    uuid;
  v_total_amount  numeric;
  v_saving_amount numeric;
  v_due_date      date;
  v_barcode       text;
  v_order_count   integer;
  v_order_number  text;
BEGIN
  -- 1) RFQ 조회 + tenant 소유권 검증
  SELECT *
    INTO v_rfq
    FROM public.rfq_requests
   WHERE id = p_rfq_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rfq not found: %', p_rfq_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_rfq.tenant_id <> p_tenant_id THEN
    RAISE EXCEPTION 'unauthorized rfq access: rfq_id=% tenant_id=%', p_rfq_id, p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  -- 2) RFQ 상태 검증 (중복 실행 방지)
  IF v_rfq.status = 'ordered' THEN
    RAISE EXCEPTION 'rfq already ordered: %', p_rfq_id
      USING ERRCODE = '23505';
  END IF;

  -- 3) BID 조회 + 상태 검증
  SELECT *
    INTO v_bid
    FROM public.rfq_bids
   WHERE id = p_bid_id
     AND rfq_id = p_rfq_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bid not found for rfq: bid_id=% rfq_id=%', p_bid_id, p_rfq_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_bid.status = 'accepted' THEN
    RAISE EXCEPTION 'bid already accepted: %', p_bid_id
      USING ERRCODE = '23505';
  END IF;

  IF v_bid.status = 'rejected' THEN
    RAISE EXCEPTION 'bid already rejected: %', p_bid_id
      USING ERRCODE = '23514';
  END IF;

  -- 4) orders INSERT (rfq/bid에서 값 계산)
  v_total_amount := v_bid.price * v_rfq.quantity;
  v_saving_amount := CASE
    WHEN v_rfq.current_price IS NULL THEN 0
    ELSE GREATEST(0, (v_rfq.current_price - v_bid.price) * v_rfq.quantity)
  END;

  -- order_number 생성 (ORD-YYYYMMDD-NNN 형식)
  SELECT COUNT(*)
    INTO v_order_count
    FROM public.orders
   WHERE (tenant_id = p_tenant_id
          OR buyer_tenant_id = p_tenant_id)
     AND order_date = CURRENT_DATE;

  v_order_number := 'ORD-'
    || TO_CHAR(CURRENT_DATE, 'YYYYMMDD')
    || '-'
    || LPAD((v_order_count + 1)::text, 3, '0');

  INSERT INTO public.orders (
    tenant_id,
    buyer_tenant_id,
    rfq_id,
    bid_id,
    supplier_name,
    product_name,
    quantity,
    unit,
    order_number,
    order_date,
    unit_price,
    total_amount,
    saving_amount,
    status
  ) VALUES (
    p_tenant_id,
    p_tenant_id,
    p_rfq_id,
    p_bid_id,
    v_bid.supplier_name,
    v_rfq.product_name,
    v_rfq.quantity,
    v_rfq.unit,
    v_order_number,
    CURRENT_DATE,
    v_bid.price,
    v_total_amount,
    v_saving_amount,
    'confirmed'
  )
  RETURNING id INTO v_order_id;

  -- 4.1) restaurant_order_items INSERT (라인 스냅샷)
  INSERT INTO public.restaurant_order_items (
    order_id,
    tenant_id,
    product_name,
    quantity,
    unit,
    unit_price,
    prev_price,
    saving
  ) VALUES (
    v_order_id,
    p_tenant_id,
    v_rfq.product_name,
    v_rfq.quantity,
    v_rfq.unit,
    v_bid.price,
    v_rfq.current_price,
    v_saving_amount
  );

  -- 5) payments INSERT (planned, outbound, due_date 계산)
  v_due_date := (CURRENT_DATE + p_payment_due_days);

  INSERT INTO public.payments (
    payer_tenant_id,
    tenant_id,
    order_id,
    counterparty_name,
    amount,
    due_date,
    payment_method,
    status,
    direction
  ) VALUES (
    p_tenant_id,
    p_tenant_id,
    v_order_id,
    v_bid.supplier_name,
    v_total_amount,
    v_due_date,
    'transfer',
    'pending',
    'outbound'
  )
  RETURNING id INTO v_payment_id;

  -- 6) rfq_bids UPDATE (accepted/rejected)
  UPDATE public.rfq_bids
     SET status = 'accepted'
   WHERE id = p_bid_id;

  UPDATE public.rfq_bids
     SET status = 'rejected'
   WHERE rfq_id = p_rfq_id
     AND id <> p_bid_id;

  -- 7) rfq_requests UPDATE (ordered)
  UPDATE public.rfq_requests
     SET status = 'ordered'
   WHERE id = p_rfq_id;

  -- 8) price_history INSERT (ingredient_id 있으면 barcode 조회)
  v_barcode := NULL;
  IF v_rfq.ingredient_id IS NOT NULL THEN
    SELECT i.barcode
      INTO v_barcode
      FROM public.ingredients i
     WHERE i.id = v_rfq.ingredient_id;
  END IF;

  INSERT INTO public.price_history (
    tenant_id,
    ingredient_name,
    barcode,
    price,
    unit,
    supplier_name,
    source,
    source_ref_id
  ) VALUES (
    p_tenant_id,
    v_rfq.product_name,
    v_barcode,
    v_bid.price,
    v_rfq.unit,
    v_bid.supplier_name,
    'order',
    v_order_id
  );

  -- 9) RETURN
  RETURN jsonb_build_object(
    'order_id',       v_order_id,
    'payment_id',     v_payment_id,
    'saving_amount',  v_saving_amount,
    'due_date',       v_due_date
  );
END;
$$;

