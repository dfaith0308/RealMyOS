-- SUP-DANGER-002: update_order_lines RPC atomicize (lines + header)
-- Note: migration file draft only. Do not execute without approval.

-- 기존 RPC 제거 후 재생성
DROP FUNCTION IF EXISTS public.update_order_lines(
  uuid,  -- p_order_id
  uuid,  -- p_tenant_id
  jsonb  -- p_line_rows
);

DROP FUNCTION IF EXISTS public.update_order_lines(
  uuid,  -- p_order_id
  uuid,  -- p_tenant_id
  jsonb, -- p_line_rows
  date,  -- p_order_date
  text   -- p_memo
);

CREATE OR REPLACE FUNCTION public.update_order_lines(
  p_order_id    uuid,
  p_tenant_id   uuid,
  p_line_rows   jsonb,
  p_order_date  date DEFAULT NULL,
  p_memo        text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_supply_price numeric := 0;
  v_total_vat_amount   numeric := 0;
  v_total_amount       numeric := 0;
BEGIN
  -- BEGIN/END 자체가 함수 트랜잭션 컨텍스트(단일 statement)로 실행됨.
  -- tenant 검증: 전환 기간 seller_tenant_id 우선 + legacy tenant_id 병행 (앱 로직과 동일 축)
  IF NOT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = p_order_id
      AND (o.seller_tenant_id = p_tenant_id OR o.tenant_id = p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'unauthorized order access: order_id=% tenant_id=%', p_order_id, p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  -- 1) 기존 라인 삭제
  DELETE FROM public.order_lines
  WHERE order_id = p_order_id;

  -- 2) 라인 재삽입 (jsonb recordset)
  INSERT INTO public.order_lines (
    order_id,
    product_id,
    product_code,
    product_name,
    unit_price,
    cost_price,
    tax_type,
    fulfillment_type,
    quantity,
    supply_price,
    vat_amount,
    line_total
  )
  SELECT
    p_order_id,
    r.product_id,
    r.product_code,
    r.product_name,
    r.unit_price,
    r.cost_price,
    r.tax_type,
    r.fulfillment_type,
    r.quantity,
    r.supply_price,
    r.vat_amount,
    r.line_total
  FROM jsonb_to_recordset(p_line_rows) AS r(
    product_id       uuid,
    product_code     text,
    product_name     text,
    unit_price       numeric,
    cost_price       numeric,
    tax_type         text,
    fulfillment_type text,
    quantity         numeric,
    supply_price     numeric,
    vat_amount       numeric,
    line_total       numeric
  );

  -- 3) 합계 계산 후 orders 헤더 단일 update
  SELECT
    COALESCE(SUM(ol.supply_price), 0),
    COALESCE(SUM(ol.vat_amount), 0),
    COALESCE(SUM(ol.line_total), 0)
  INTO
    v_total_supply_price,
    v_total_vat_amount,
    v_total_amount
  FROM public.order_lines ol
  WHERE ol.order_id = p_order_id;

  UPDATE public.orders o
  SET
    total_supply_price = v_total_supply_price,
    total_vat_amount   = v_total_vat_amount,
    total_amount       = v_total_amount,
    order_date         = COALESCE(p_order_date, o.order_date),
    memo               = COALESCE(p_memo, o.memo)
  WHERE o.id = p_order_id
    AND (o.seller_tenant_id = p_tenant_id OR o.tenant_id = p_tenant_id);
END;
$$;

-- 기존 3파라미터 버전 제거 (2026-05-06 적용 완료)
DROP FUNCTION IF EXISTS public.update_order_lines(uuid, uuid, jsonb);
