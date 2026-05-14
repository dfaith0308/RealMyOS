-- DISCOUNT-ENGINE-P0-001: pricing_policies + targets + order item snapshot columns
-- Storefront는 정책 테이블 직접 SELECT 불가(RLS). 체크아웃은 SECURITY DEFINER RPC만 사용.

CREATE TABLE IF NOT EXISTS public.pricing_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  name text NOT NULL,

  policy_type text NOT NULL
    CHECK (policy_type IN (
      'fixed_price',
      'amount_discount',
      'percent_discount'
    )),

  burden_type text NOT NULL DEFAULT 'platform'
    CHECK (burden_type IN (
      'platform',
      'supplier',
      'mixed'
    )),

  discount_value numeric(10,2) NOT NULL DEFAULT 0,

  platform_fee_rate_override numeric(5,4),

  starts_at timestamptz,
  ends_at timestamptz,

  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'inactive')),

  priority integer NOT NULL DEFAULT 0,

  note text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pricing_policy_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  pricing_policy_id uuid NOT NULL
    REFERENCES public.pricing_policies(id)
    ON DELETE CASCADE,

  listing_id uuid,
  restaurant_tenant_id uuid,
  supplier_tenant_id uuid,

  applies_to_all boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_policies_status_idx
  ON public.pricing_policies (status);

CREATE INDEX IF NOT EXISTS pricing_policies_starts_at_idx
  ON public.pricing_policies (starts_at);

CREATE INDEX IF NOT EXISTS pricing_policies_ends_at_idx
  ON public.pricing_policies (ends_at);

CREATE INDEX IF NOT EXISTS pricing_policies_priority_idx
  ON public.pricing_policies (priority DESC);

CREATE INDEX IF NOT EXISTS pricing_policy_targets_policy_idx
  ON public.pricing_policy_targets (pricing_policy_id);

CREATE INDEX IF NOT EXISTS pricing_policy_targets_listing_idx
  ON public.pricing_policy_targets (listing_id)
  WHERE listing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pricing_policy_targets_restaurant_idx
  ON public.pricing_policy_targets (restaurant_tenant_id)
  WHERE restaurant_tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pricing_policy_targets_supplier_idx
  ON public.pricing_policy_targets (supplier_tenant_id)
  WHERE supplier_tenant_id IS NOT NULL;

ALTER TABLE public.commerce_order_items
  ADD COLUMN IF NOT EXISTS applied_policy_id uuid
    REFERENCES public.pricing_policies(id);

ALTER TABLE public.commerce_order_items
  ADD COLUMN IF NOT EXISTS base_price integer;

ALTER TABLE public.commerce_order_items
  ADD COLUMN IF NOT EXISTS applied_policy_snapshot jsonb;

ALTER TABLE public.pricing_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_policy_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pricing_policies_admin_all" ON public.pricing_policies;
CREATE POLICY "pricing_policies_admin_all"
  ON public.pricing_policies FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "pricing_policy_targets_admin_all" ON public.pricing_policy_targets;
CREATE POLICY "pricing_policy_targets_admin_all"
  ON public.pricing_policy_targets FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON COLUMN public.commerce_order_items.applied_policy_snapshot IS
  '주문 시점 정책 immutable 스냅샷(JSON). 정책 변경 후에도 ERP 복구용.';

-- ---------------------------------------------------------------------------
-- 체크아웃: 활성 정책(+타깃) JSON — 식당 세션은 테이블 SELECT 없이 RPC만 호출
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fetch_active_pricing_policies_for_checkout(
  p_listing_ids uuid[],
  p_restaurant_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF p_listing_ids IS NULL OR array_length(p_listing_ids, 1) IS NULL THEN
    RETURN v_out;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'policy_type', p.policy_type,
        'burden_type', p.burden_type,
        'discount_value', p.discount_value,
        'platform_fee_rate_override', p.platform_fee_rate_override,
        'priority', p.priority,
        'status', p.status,
        'starts_at', p.starts_at,
        'ends_at', p.ends_at,
        'targets', coalesce(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', t.id,
                'listing_id', t.listing_id,
                'restaurant_tenant_id', t.restaurant_tenant_id,
                'supplier_tenant_id', t.supplier_tenant_id,
                'applies_to_all', t.applies_to_all
              )
              ORDER BY t.created_at, t.id
            )
            FROM public.pricing_policy_targets t
            WHERE t.pricing_policy_id = p.id
          ),
          '[]'::jsonb
        )
      )
      ORDER BY p.priority DESC, p.created_at DESC, p.id
    ),
    '[]'::jsonb
  )
  INTO v_out
  FROM public.pricing_policies p
  WHERE p.status = 'active'
    AND (p.starts_at IS NULL OR p.starts_at <= now())
    AND (p.ends_at IS NULL OR p.ends_at >= now())
    AND EXISTS (
      SELECT 1
      FROM public.pricing_policy_targets t2
      WHERE t2.pricing_policy_id = p.id
        AND (
          t2.applies_to_all = true
          OR (t2.listing_id IS NOT NULL AND t2.listing_id = ANY (p_listing_ids))
          OR (
            t2.restaurant_tenant_id IS NOT NULL
            AND t2.restaurant_tenant_id = p_restaurant_tenant_id
          )
        )
    );

  RETURN coalesce(v_out, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.fetch_active_pricing_policies_for_checkout(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_active_pricing_policies_for_checkout(uuid[], uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 식당 세션 → admin_logs (가격정책 조회/적용 실패) — RLS 우회, 주문은 계속 진행
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_pricing_engine_admin_event(
  p_action_type text,
  p_restaurant_tenant_id uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_platform uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.admin_logs (
    admin_tenant_id,
    admin_id,
    tenant_id,
    action_type,
    payload,
    reason
  )
  VALUES (
    v_platform,
    NULL,
    p_restaurant_tenant_id,
    p_action_type,
    coalesce(p_payload, '{}'::jsonb),
    'pricing_engine'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_pricing_engine_admin_event(text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_pricing_engine_admin_event(text, uuid, jsonb) TO authenticated;
