-- SUP-TODO-002-C: outbound 지급 + payment_allocations 원자 삽입 (RULE-19)
-- WARNING: 운영 DB 실행 전 리뷰·승인 필요. 로컬/CI에서 임의 적용 금지.
--
-- 동작:
-- 1) payments 행 1건 INSERT (direction=outbound, status=pending)
-- 2) p_allocations JSON 배열 만큼 payment_allocations INSERT
-- 3) purchase_id 가 있으면 해당 purchases.tenant_id = p_tenant_id 검증
-- 4) SUM(allocated_amount) <= p_amount
--
-- 호출: 앱에서 p_tenant_id = get_my_tenant_id() 와 일치하도록 전달 (SECURITY DEFINER 내부에서 재검증).
--
-- direction 컬럼이 enum일 때 실제 타입명 확인:
--   SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) AS direction_pg_type
--   FROM pg_catalog.pg_attribute a
--   WHERE a.attrelid = 'public.payments'::regclass
--     AND a.attname = 'direction'
--     AND NOT a.attisdropped;
-- typname만 필요하면: SELECT t.typname FROM pg_attribute a JOIN pg_type t ON a.atttypid = t.oid
--   WHERE a.attrelid = 'public.payments'::regclass AND a.attname = 'direction';
-- 아래 캐스트는 운영에서 `payment_direction` 인 경우를 가정. 적용 오류 시 위 결과 typname으로 교체.

CREATE OR REPLACE FUNCTION public.create_disbursement_with_allocations(
  p_tenant_id         uuid,
  p_counterparty_name text,
  p_amount            integer,
  p_payment_date      date,
  p_payment_method    text,
  p_due_date          date,
  p_memo              text,
  p_order_id          uuid,
  p_created_by        uuid,
  p_allocations       jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_sum        integer := 0;
  elem         jsonb;
  v_purchase_id uuid;
  v_alloc       integer;
BEGIN
  IF p_tenant_id IS DISTINCT FROM public.get_my_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid amount';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN ('transfer', 'cash', 'card', 'platform') THEN
    RAISE EXCEPTION 'invalid payment_method';
  END IF;

  FOR elem IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) AS a(value)
  LOOP
    IF elem->>'allocated_amount' IS NULL THEN
      RAISE EXCEPTION 'allocated_amount required per row';
    END IF;
    v_alloc := (elem->>'allocated_amount')::integer;
    IF v_alloc <= 0 THEN
      RAISE EXCEPTION 'allocated_amount must be positive';
    END IF;
    v_sum := v_sum + v_alloc;
  END LOOP;

  IF v_sum > p_amount THEN
    RAISE EXCEPTION 'sum(allocated_amount) exceeds payment amount';
  END IF;

  INSERT INTO public.payments (
    tenant_id,
    payer_tenant_id,
    payee_tenant_id,
    counterparty_name,
    amount,
    payment_date,
    due_date,
    payment_method,
    memo,
    status,
    direction,
    deposit_amount,
    order_id,
    created_by
  ) VALUES (
    p_tenant_id,
    p_tenant_id,
    NULL,
    p_counterparty_name,
    p_amount,
    p_payment_date,
    p_due_date,
    p_payment_method,
    NULLIF(trim(COALESCE(p_memo, '')), ''),
    'pending',
    'outbound'::public.payment_direction,
    0,
    p_order_id,
    p_created_by
  )
  RETURNING id INTO v_payment_id;

  FOR elem IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) AS a(value)
  LOOP
    v_alloc := (elem->>'allocated_amount')::integer;

    v_purchase_id := NULL;
    IF elem ? 'purchase_id'
       AND jsonb_typeof(elem->'purchase_id') = 'string'
       AND nullif(trim(elem->>'purchase_id'), '') IS NOT NULL
    THEN
      v_purchase_id := (elem->>'purchase_id')::uuid;
    ELSIF elem ? 'purchase_id'
          AND jsonb_typeof(elem->'purchase_id') <> 'null'
          AND elem->>'purchase_id' IS NOT NULL
    THEN
      v_purchase_id := (elem->>'purchase_id')::uuid;
    END IF;

    IF v_purchase_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.purchases p
        WHERE p.id = v_purchase_id AND p.tenant_id = p_tenant_id
      ) THEN
        RAISE EXCEPTION 'purchase not found or tenant mismatch: %', v_purchase_id;
      END IF;
    END IF;

    INSERT INTO public.payment_allocations (
      tenant_id,
      payment_id,
      purchase_id,
      allocated_amount
    ) VALUES (
      p_tenant_id,
      v_payment_id,
      v_purchase_id,
      v_alloc
    );
  END LOOP;

  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_disbursement_with_allocations(
  uuid, text, integer, date, text, date, text, uuid, uuid, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_disbursement_with_allocations(
  uuid, text, integer, date, text, date, text, uuid, uuid, jsonb
) TO authenticated;
