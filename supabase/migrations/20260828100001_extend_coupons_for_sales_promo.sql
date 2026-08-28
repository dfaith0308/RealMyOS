-- 프로모션 코드 = 기존 coupons 테이블 확장 (신규 테이블 생성하지 않음) — 2026-08-28
-- 목적: 영업 리드에서 발급한 구독료 프로모션 코드를 구독 결제 화면에서 사용 가능하게 한다.

-- 1) 영업 리드 연결 (nullable — 기존 관리자 발급 쿠폰은 그대로 NULL)
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.sales_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS memo text;

CREATE INDEX IF NOT EXISTS idx_coupons_lead ON public.coupons(lead_id) WHERE lead_id IS NOT NULL;

-- 2) plan CHECK 확장 — /subscribe 가 쓰는 monthly, 그리고 플랜 무관 'any' 추가.
--    기존 값(earlybird/pro/annual)은 하위 호환으로 유지한다. (허용값 추가일 뿐 데이터 변경 없음)
ALTER TABLE public.coupons
  DROP CONSTRAINT IF EXISTS coupons_plan_check;

ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_plan_check
  CHECK (plan IN ('any', 'monthly', 'annual', 'earlybird', 'pro'));

-- 3) 코드 대소문자 무시 조회 — 사람이 읽는 코드를 관리자가 직접 입력하므로
--    'SIKSIKI2026' 과 'siksiki2026' 이 충돌하도록 막는다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code_upper ON public.coupons (upper(code));

-- 4) 사용 원자성: max_uses 경합을 막기 위해 조건을 UPDATE 에 함께 건다.
--    반환이 비어 있으면 "없음 / 만료 / 한도소진" 중 하나로 사용 불가.
CREATE OR REPLACE FUNCTION public.redeem_coupon(
  p_code text,
  p_tenant_id uuid,
  p_plan text
)
RETURNS TABLE (coupon_id uuid, free_months integer, plan_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_free_months integer;
  v_expires timestamptz;
BEGIN
  -- 같은 테넌트가 같은 코드를 두 번 쓰는 것은 막는다
  IF EXISTS (
    SELECT 1
      FROM coupon_uses cu
      JOIN coupons c ON c.id = cu.coupon_id
     WHERE cu.tenant_id = p_tenant_id
       AND upper(c.code) = upper(btrim(p_code))
  ) THEN
    RETURN;
  END IF;

  UPDATE coupons c
     SET used_count = COALESCE(c.used_count, 0) + 1
   WHERE upper(c.code) = upper(btrim(p_code))
     AND (c.expires_at IS NULL OR c.expires_at > now())
     AND (c.max_uses IS NULL OR COALESCE(c.used_count, 0) < c.max_uses)
     AND (c.plan = 'any' OR c.plan = p_plan)
  RETURNING c.id, c.free_months INTO v_id, v_free_months;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  v_expires := now() + (v_free_months || ' months')::interval;

  INSERT INTO coupon_uses (coupon_id, tenant_id, plan_expires_at)
  VALUES (v_id, p_tenant_id, v_expires);

  RETURN QUERY SELECT v_id, v_free_months, v_expires;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.redeem_coupon(text, uuid, text) TO service_role;

COMMENT ON COLUMN public.coupons.lead_id IS '이 코드를 발급한 영업 리드 (nullable)';
COMMENT ON COLUMN public.coupons.plan IS 'any = 모든 구독 플랜에 적용. monthly/annual = 해당 플랜 전용. earlybird/pro = 레거시';
COMMENT ON FUNCTION public.redeem_coupon(text, uuid, text) IS '쿠폰 사용 원자 처리: 유효성 검사 + used_count 증가 + coupon_uses 기록을 한 트랜잭션에서 수행';
