-- SUP-TODO-001-B: 공급자용 오픈 RFQ 목록 (노출 단계 + tenant_relationships 기반 1단계)
-- rfq_requests RLS가 buyer(tenant_id) 기준이므로 공급자 직접 SELECT 대신 SECURITY DEFINER RPC.
-- 적용: 승인된 배포 파이프라인에서만 실행.
--
-- 보완 사항(원안 대비):
-- - expose_level: 경과 분이 level3 이상이면 3, 그 다음 level2 이상이면 2(원안은 2가 3보다 먼저 매칭되어 3이 절대 나오지 않음).
-- - settings: 발주자(r.tenant_id)별 rfq_expose_level2_minutes / rfq_expose_level3_minutes (RULE-16).
-- - 호출: p_supplier_tenant_id = get_my_tenant_id() 일 때만 반환(타 테넌트 스코핑 방지).

CREATE OR REPLACE FUNCTION public.get_supplier_rfqs(
  p_supplier_tenant_id uuid
)
RETURNS TABLE (
  id uuid,
  product_name text,
  quantity integer,
  unit text,
  target_price integer,
  deadline timestamptz,
  region text,
  status text,
  created_at timestamptz,
  expose_level integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_buyers AS (
    SELECT CASE
      WHEN tr.requester_tenant_id = p_supplier_tenant_id THEN tr.target_tenant_id
      ELSE tr.requester_tenant_id
    END AS buyer_tenant_id
    FROM public.tenant_relationships tr
    WHERE (tr.requester_tenant_id = p_supplier_tenant_id OR tr.target_tenant_id = p_supplier_tenant_id)
      AND tr.status = 'active'
  )
  SELECT
    r.id,
    r.product_name,
    r.quantity,
    r.unit,
    r.target_price,
    r.deadline,
    r.region,
    r.status::text,
    r.created_at,
    CASE
      WHEN r.tenant_id IN (SELECT mb.buyer_tenant_id FROM my_buyers mb) THEN 1
      WHEN EXTRACT(EPOCH FROM (now() - r.created_at)) / 60 >= cfg.l3 THEN 3
      WHEN EXTRACT(EPOCH FROM (now() - r.created_at)) / 60 >= cfg.l2 THEN 2
      ELSE NULL
    END AS expose_level
  FROM public.rfq_requests r
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(
        (
          SELECT s.value::integer
          FROM public.settings s
          WHERE s.tenant_id = r.tenant_id AND s.key = 'rfq_expose_level2_minutes'
          LIMIT 1
        ),
        30
      ) AS l2,
      COALESCE(
        (
          SELECT s.value::integer
          FROM public.settings s
          WHERE s.tenant_id = r.tenant_id AND s.key = 'rfq_expose_level3_minutes'
          LIMIT 1
        ),
        120
      ) AS l3
  ) cfg
  WHERE r.status::text = 'open'
    AND p_supplier_tenant_id = get_my_tenant_id()
    AND (
      r.tenant_id IN (SELECT mb.buyer_tenant_id FROM my_buyers mb)
      OR EXTRACT(EPOCH FROM (now() - r.created_at)) / 60 >= cfg.l2
    )
  ORDER BY expose_level ASC NULLS LAST, r.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_rfqs(uuid) TO authenticated;
