-- RECORD-ONLY: dumped from prod (cqiwcyuclpuarynrreat) via pg_get_functiondef
-- Purpose: track function in git; already exists on prod — do not treat as pending apply
-- Function: public.convert_quote_items(p_quote_id uuid, p_tenant_id uuid, p_conversions jsonb)
-- Captured: 2026-08-07
CREATE OR REPLACE FUNCTION public.convert_quote_items(p_quote_id uuid, p_tenant_id uuid, p_conversions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_item        RECORD;
  v_conversion  jsonb;
  v_convert_qty integer;
  v_new_qty     integer;
  v_new_status  text;
  v_quote_status text;
  v_all_converted boolean := true;
  v_any_converted boolean := false;
BEGIN
  -- 견적 존재 + tenant 검증 (FOR UPDATE로 동시 접근 차단)
  PERFORM id FROM quotes
  WHERE id = p_quote_id
    AND tenant_id = p_tenant_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '견적을 찾을 수 없습니다.');
  END IF;

  -- expired 체크
  IF EXISTS (
    SELECT 1 FROM quotes
    WHERE id = p_quote_id AND expires_at IS NOT NULL AND expires_at < CURRENT_DATE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '만료된 견적은 전환할 수 없습니다.');
  END IF;

  -- 각 item 전환 처리
  FOR v_conversion IN SELECT * FROM jsonb_array_elements(p_conversions)
  LOOP
    SELECT * INTO v_item
    FROM quote_items
    WHERE id = (v_conversion->>'item_id')::uuid
      AND quote_id = p_quote_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', '견적 항목을 찾을 수 없습니다.');
    END IF;

    v_convert_qty := (v_conversion->>'qty')::integer;
    v_new_qty := v_item.converted_quantity + v_convert_qty;

    -- 초과 전환 방지
    IF v_new_qty > v_item.quantity THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('"%s" 전환 수량(%s)이 남은 수량(%s)을 초과합니다.',
          v_item.product_name, v_convert_qty,
          v_item.quantity - v_item.converted_quantity)
      );
    END IF;

    -- item status 계산
    IF v_new_qty = 0 THEN v_new_status := 'pending';
    ELSIF v_new_qty < v_item.quantity THEN v_new_status := 'partially_converted';
    ELSE v_new_status := 'converted';
    END IF;

    UPDATE quote_items
    SET converted_quantity = v_new_qty, status = v_new_status
    WHERE id = v_item.id;
  END LOOP;

  -- quote 전체 status 재계산
  SELECT
    bool_and(status = 'converted'),
    bool_or(status IN ('partially_converted','converted'))
  INTO v_all_converted, v_any_converted
  FROM quote_items
  WHERE quote_id = p_quote_id;

  IF v_all_converted THEN v_quote_status := 'converted';
  ELSIF v_any_converted THEN v_quote_status := 'partially_converted';
  ELSE v_quote_status := 'sent';
  END IF;

  UPDATE quotes SET status = v_quote_status, updated_at = now()
  WHERE id = p_quote_id;

  RETURN jsonb_build_object('success', true, 'quote_status', v_quote_status);
END;
$function$;

-- Privileges as observed on prod (postgres owner grant omitted)
GRANT EXECUTE ON FUNCTION public.convert_quote_items(p_quote_id uuid, p_tenant_id uuid, p_conversions jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.convert_quote_items(p_quote_id uuid, p_tenant_id uuid, p_conversions jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quote_items(p_quote_id uuid, p_tenant_id uuid, p_conversions jsonb) TO service_role;
