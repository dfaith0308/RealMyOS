-- 배송 완료 자동 메시지 — delivery_completed 사건 → 대상 판정 한 곳 → 알림톡 우선·문자 대체 (2026-09-15)
-- **미실행. 사장님 승인 후 직접 적용.** 선행: 20260915100000_commerce_delivery_tracking.sql
-- 기준: doc/transfer-brief-siksiki.md 3절 / 판단 근거: doc/transfer-audit-log.md 3단계
--
-- [흐름]
-- 배송 상태가 처음 delivered 로 반영됨 (apply_commerce_delivery_event 만 가능 — 1단계 가드)
--   → 트리거가 commerce_domain_events 에 delivery_completed 1행 (주문당 1번, UNIQUE)
--   → 앱이 사건을 처리: delivery_message_targets() 로 판정 → 발송 대기 / 발송 안 함 / (자동 모드) 발송
--   → 발송은 claim(한 명만 잡음) → 알림톡 시도 → 실패 시 문자 → finish(시도 기록 + 최종 상태)
--
-- [메시지 쪽은 배송 업체를 모른다]
-- 사건 행에는 주문 id 와 발생 시각만 있다. 택배사·조회 업체·원본 상태값은 넣지 않는다.
--
-- [판정은 한 곳 — delivery_message_targets()]
-- "배송 완료됨 + 사용함 + 제외 아님 + 아직 성공 기록 없음" 을 이 함수 하나가 판정한다.
-- 사건 처리·승인 발송·실패 재발송·화면 목록이 전부 이 함수를 부른다.
--
-- [기본값은 안전한 쪽]
-- 설정 enabled 기본 false, send_mode 기본 manual_confirm(확인 후 발송). 행이 없으면 발송 안 함.

-- ── 1. 자체 사건 (outbox) ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commerce_domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 사건 종류. 지금은 배송 완료 하나. 결품·발주 마감 등은 값을 늘려 같은 구조로 붙인다
  event_type text NOT NULL CHECK (event_type IN ('delivery_completed')),
  commerce_order_id uuid NOT NULL REFERENCES public.commerce_orders(id),
  tenant_id uuid NOT NULL,              -- 주문의 구매자(식당) tenant
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 처리한 시각. NULL = 아직 처리 전 (처리 결과는 delivery_message_dispatches 에 남는다)
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 같은 주문의 같은 사건은 한 번만 생긴다 — 배송 조회가 완료를 여러 번 알려도 사건은 하나
  CONSTRAINT commerce_domain_events_once UNIQUE (event_type, commerce_order_id)
);

CREATE INDEX IF NOT EXISTS commerce_domain_events_unprocessed_idx
  ON public.commerce_domain_events (event_type, created_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.commerce_domain_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS commerce_domain_events_admin_select ON public.commerce_domain_events;
CREATE POLICY commerce_domain_events_admin_select ON public.commerce_domain_events
  FOR SELECT USING (public.is_admin());

COMMENT ON TABLE public.commerce_domain_events IS
  '자체 사건(outbox). 배송 업체 정보는 넣지 않는다 — 메시지 쪽은 사건만 본다';

CREATE OR REPLACE FUNCTION public.emit_delivery_completed_event()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.delivery_status = 'delivered' AND OLD.delivery_status IS DISTINCT FROM 'delivered' THEN
    INSERT INTO public.commerce_domain_events (event_type, commerce_order_id, tenant_id, occurred_at)
    VALUES ('delivery_completed', NEW.id, NEW.tenant_id, now())
    ON CONFLICT (event_type, commerce_order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_emit_delivery_completed_event ON public.commerce_orders;
CREATE TRIGGER trg_emit_delivery_completed_event
  AFTER UPDATE OF delivery_status ON public.commerce_orders
  FOR EACH ROW EXECUTE FUNCTION public.emit_delivery_completed_event();

-- ── 2. 발송 설정 (관리자가 설정 — transfer-audit-log 0-03) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_message_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- '00000000-0000-0000-0000-000000000000' = 플랫폼 기본값
  -- 공급자 tenant id = 그 공급자가 단독으로 보내는 주문에만 적용 (있으면 기본값 대신 이 행 전체를 쓴다)
  scope_tenant_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  send_mode text NOT NULL DEFAULT 'manual_confirm' CHECK (send_mode IN ('manual_confirm', 'auto')),
  -- 보내는 분 표기. NULL 이면 공급자 상호(단독 공급) 또는 '식식이'
  sender_display text CHECK (sender_display IS NULL OR (btrim(sender_display) <> '' AND length(sender_display) <= 40)),
  -- 감사 메시지. NULL 이면 기본 문구. 링크·전화번호·광고 단어는 저장 단계(앱)에서 거절
  thank_you_message text CHECK (thank_you_message IS NULL OR (btrim(thank_you_message) <> '' AND length(thank_you_message) <= 300)),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_message_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS delivery_message_settings_admin_all ON public.delivery_message_settings;
CREATE POLICY delivery_message_settings_admin_all ON public.delivery_message_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON COLUMN public.delivery_message_settings.scope_tenant_id IS
  '00000000-…=플랫폼 기본값 / 공급자 tenant=그 공급자 단독 주문용(행 단위로 기본값을 대체)';

-- ── 3. 제외 대상 (식당 단위) — 삭제 대신 해제 시각 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_message_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  reason text NOT NULL CHECK (btrim(reason) <> '' AND length(reason) <= 200),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_by uuid
);

-- 식당 하나에 "유효한 제외"는 하나만
CREATE UNIQUE INDEX IF NOT EXISTS delivery_message_exclusions_active_uq
  ON public.delivery_message_exclusions (tenant_id)
  WHERE released_at IS NULL;

ALTER TABLE public.delivery_message_exclusions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS delivery_message_exclusions_admin_all ON public.delivery_message_exclusions;
CREATE POLICY delivery_message_exclusions_admin_all ON public.delivery_message_exclusions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 4. 발송 결과 — 주문당 1행 + 시도 기록 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_message_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commerce_order_id uuid NOT NULL UNIQUE REFERENCES public.commerce_orders(id),
  tenant_id uuid NOT NULL,
  -- 메시지 명의 공급자(단독 공급일 때만). NULL = 플랫폼 기본
  supplier_tenant_id uuid,
  status text NOT NULL CHECK (status IN (
    'pending_approval',       -- 발송 대기 (확인 후 발송)
    'skipped',                -- 발송 안 함 (사용 끔·제외)
    'sending',                -- 발송 중 (한 요청이 잡고 있음)
    'kakao_success',          -- 카카오 성공
    'sms_fallback_success',   -- 카카오 실패(또는 템플릿 없음) → 문자 성공
    'both_failed',            -- 카카오 실패 → 문자 실패
    'failed',                 -- 전체 실패 (번호 오류 등 발송 자체 불가)
    'test_simulated'          -- 테스트 모드 — 기록만, 실제 발송 없음 (성공으로 치지 않는다)
  )),
  skip_reason text,
  -- 실제로 보낸(보내려 한) 내용의 스냅샷
  recipient_phone text,
  sender_display text,
  body text,
  claimed_at timestamptz,
  claimed_by uuid,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_message_dispatches_status_idx
  ON public.delivery_message_dispatches (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.delivery_message_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.delivery_message_dispatches(id),
  channel text NOT NULL CHECK (channel IN ('kakao', 'sms')),
  result text NOT NULL CHECK (result IN ('success', 'failed', 'skipped', 'simulated')),
  failure_reason text,
  external_message_id text,
  test_mode boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  attempted_by uuid
);

CREATE INDEX IF NOT EXISTS delivery_message_attempts_dispatch_idx
  ON public.delivery_message_attempts (dispatch_id, attempted_at);

ALTER TABLE public.delivery_message_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_message_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS delivery_message_dispatches_admin_select ON public.delivery_message_dispatches;
CREATE POLICY delivery_message_dispatches_admin_select ON public.delivery_message_dispatches
  FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS delivery_message_attempts_admin_select ON public.delivery_message_attempts;
CREATE POLICY delivery_message_attempts_admin_select ON public.delivery_message_attempts
  FOR SELECT USING (public.is_admin());

COMMENT ON TABLE public.delivery_message_dispatches IS
  '배송 완료 메시지 발송 결과(주문당 1행). 쓰기는 판정·claim·finish 함수로만';

-- ── 5. 판정 — 발송 대상은 이 함수 하나가 정한다 ─────────────────────────────────────────
-- 배송 완료된 주문마다 한 행. eligible=true 인 행만 발송 대상이다.
-- ineligible_reason: not_active_order / disabled / excluded / already_sent / sending
CREATE OR REPLACE FUNCTION public.delivery_message_targets(p_order_ids uuid[] DEFAULT NULL)
 RETURNS TABLE (
   commerce_order_id uuid,
   tenant_id uuid,
   order_number text,
   recipient_phone text,
   supplier_tenant_id uuid,
   supplier_name text,
   settings_scope uuid,
   send_mode text,
   sender_display text,
   thank_you_message text,
   dispatch_id uuid,
   dispatch_status text,
   eligible boolean,
   ineligible_reason text
 )
 LANGUAGE sql
 STABLE
AS $function$
  WITH o AS (
    SELECT co.id, co.tenant_id, co.order_number, co.shipping_phone, co.status
      FROM public.commerce_orders co
     WHERE co.delivery_status = 'delivered'
       AND (p_order_ids IS NULL OR co.id = ANY (p_order_ids))
  ),
  sup AS (
    -- 취소 안 된 allocation 의 공급자가 정확히 하나면 그 공급자 명의
    SELECT a.commerce_order_id,
           CASE WHEN COUNT(DISTINCT a.supplier_tenant_id) = 1
                THEN (ARRAY_AGG(a.supplier_tenant_id))[1] END AS supplier_tenant_id
      FROM public.commerce_order_allocations a
     WHERE a.status <> 'cancelled'
       AND a.commerce_order_id IN (SELECT id FROM o)
     GROUP BY a.commerce_order_id
  ),
  base AS (
    SELECT o.*, sup.supplier_tenant_id,
           COALESCE(
             (SELECT s.id FROM public.delivery_message_settings s WHERE s.scope_tenant_id = sup.supplier_tenant_id),
             (SELECT s.id FROM public.delivery_message_settings s WHERE s.scope_tenant_id = '00000000-0000-0000-0000-000000000000')
           ) AS settings_id
      FROM o LEFT JOIN sup ON sup.commerce_order_id = o.id
  )
  SELECT b.id,
         b.tenant_id,
         b.order_number,
         b.shipping_phone,
         b.supplier_tenant_id,
         t.name,
         s.scope_tenant_id,
         s.send_mode,
         s.sender_display,
         s.thank_you_message,
         d.id,
         d.status,
         (r.reason IS NULL) AS eligible,
         r.reason
    FROM base b
    LEFT JOIN public.delivery_message_settings s ON s.id = b.settings_id
    LEFT JOIN public.tenants t ON t.id = b.supplier_tenant_id
    LEFT JOIN public.delivery_message_dispatches d ON d.commerce_order_id = b.id
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN b.status NOT IN ('paid', 'preparing', 'shipped', 'completed') THEN 'not_active_order'
        WHEN s.id IS NULL OR s.enabled IS NOT TRUE                        THEN 'disabled'
        WHEN EXISTS (SELECT 1 FROM public.delivery_message_exclusions x
                      WHERE x.tenant_id = b.tenant_id AND x.released_at IS NULL) THEN 'excluded'
        WHEN d.status IN ('kakao_success', 'sms_fallback_success')        THEN 'already_sent'
        WHEN d.status = 'sending'                                          THEN 'sending'
        ELSE NULL
      END AS reason
    ) r
$function$;

COMMENT ON FUNCTION public.delivery_message_targets(uuid[]) IS
  '발송 대상 판정의 유일한 출처 — 배송 완료 + 사용함 + 제외 아님 + 아직 성공 기록 없음';

-- ── 6. 사건 처리 — 대기/발송 안 함 기록 + 자동 발송 대상 반환 ──────────────────────────
CREATE OR REPLACE FUNCTION public.process_delivery_completed_events(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ev   record;
  v_t    record;
  v_out  jsonb := '[]'::jsonb;
  v_action text;
BEGIN
  FOR v_ev IN
    SELECT e.id, e.commerce_order_id
      FROM public.commerce_domain_events e
     WHERE e.event_type = 'delivery_completed'
       AND e.processed_at IS NULL
     ORDER BY e.created_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
       FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO v_t FROM public.delivery_message_targets(ARRAY[v_ev.commerce_order_id]) LIMIT 1;

    IF NOT FOUND THEN
      v_action := 'no_longer_delivered';
    ELSIF v_t.eligible THEN
      v_action := CASE WHEN v_t.send_mode = 'auto' THEN 'auto_send' ELSE 'pending_approval' END;
      INSERT INTO public.delivery_message_dispatches (commerce_order_id, tenant_id, supplier_tenant_id, status)
      VALUES (v_t.commerce_order_id, v_t.tenant_id, v_t.supplier_tenant_id, 'pending_approval')
      ON CONFLICT (commerce_order_id) DO UPDATE
        SET status = CASE WHEN delivery_message_dispatches.status IN ('skipped') THEN 'pending_approval'
                          ELSE delivery_message_dispatches.status END,
            skip_reason = NULL,
            updated_at = now();
    ELSIF v_t.ineligible_reason IN ('disabled', 'excluded', 'not_active_order') THEN
      v_action := 'skipped';
      INSERT INTO public.delivery_message_dispatches (commerce_order_id, tenant_id, supplier_tenant_id, status, skip_reason)
      VALUES (v_t.commerce_order_id, v_t.tenant_id, v_t.supplier_tenant_id, 'skipped', v_t.ineligible_reason)
      ON CONFLICT (commerce_order_id) DO NOTHING;
    ELSE
      v_action := v_t.ineligible_reason;   -- already_sent / sending: 아무것도 쓰지 않는다
    END IF;

    UPDATE public.commerce_domain_events SET processed_at = now() WHERE id = v_ev.id;
    v_out := v_out || jsonb_build_object('commerce_order_id', v_ev.commerce_order_id, 'action', v_action);
  END LOOP;

  RETURN v_out;
END;
$function$;

-- ── 7. claim — 발송할 권리를 한 요청만 잡는다 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_delivery_message_dispatch(p_order_id uuid, p_actor uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_t  record;
  v_id uuid;
BEGIN
  -- 같은 주문의 동시 claim 은 주문 행 잠금에서 줄을 선다
  PERFORM 1 FROM public.commerce_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'order_not_found');
  END IF;

  SELECT * INTO v_t FROM public.delivery_message_targets(ARRAY[p_order_id]) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_delivered');
  END IF;
  IF NOT v_t.eligible THEN
    RETURN jsonb_build_object('claimed', false, 'reason', v_t.ineligible_reason);
  END IF;

  INSERT INTO public.delivery_message_dispatches (
    commerce_order_id, tenant_id, supplier_tenant_id, status, claimed_at, claimed_by, skip_reason, updated_at
  ) VALUES (
    v_t.commerce_order_id, v_t.tenant_id, v_t.supplier_tenant_id, 'sending', now(), p_actor, NULL, now()
  )
  ON CONFLICT (commerce_order_id) DO UPDATE
    SET status = 'sending', claimed_at = now(), claimed_by = p_actor, skip_reason = NULL,
        supplier_tenant_id = EXCLUDED.supplier_tenant_id, updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'claimed', true,
    'dispatch_id', v_id,
    'commerce_order_id', v_t.commerce_order_id,
    'order_number', v_t.order_number,
    'recipient_phone', v_t.recipient_phone,
    'supplier_tenant_id', v_t.supplier_tenant_id,
    'supplier_name', v_t.supplier_name,
    'sender_display', v_t.sender_display,
    'thank_you_message', v_t.thank_you_message);
END;
$function$;

-- ── 8. finish — 시도 기록 + 최종 상태를 한 트랜잭션으로 ───────────────────────────────
CREATE OR REPLACE FUNCTION public.finish_delivery_message_dispatch(
  p_dispatch_id uuid,
  p_status text,
  p_recipient_phone text,
  p_sender_display text,
  p_body text,
  p_attempts jsonb,
  p_actor uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_cur text;
  v_a   jsonb;
BEGIN
  IF p_status NOT IN ('kakao_success', 'sms_fallback_success', 'both_failed', 'failed', 'test_simulated') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid final status');
  END IF;

  SELECT status INTO v_cur FROM public.delivery_message_dispatches WHERE id = p_dispatch_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'dispatch not found');
  END IF;
  -- claim 없이 결과를 덮어쓰지 못한다
  IF v_cur <> 'sending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'dispatch is not sending: ' || v_cur);
  END IF;

  FOR v_a IN SELECT * FROM jsonb_array_elements(COALESCE(p_attempts, '[]'::jsonb))
  LOOP
    INSERT INTO public.delivery_message_attempts (
      dispatch_id, channel, result, failure_reason, external_message_id, test_mode, attempted_at, attempted_by
    ) VALUES (
      p_dispatch_id,
      v_a->>'channel',
      v_a->>'result',
      NULLIF(v_a->>'failure_reason', ''),
      NULLIF(v_a->>'external_message_id', ''),
      COALESCE((v_a->>'test_mode')::boolean, false),
      COALESCE((v_a->>'attempted_at')::timestamptz, now()),
      p_actor
    );
  END LOOP;

  UPDATE public.delivery_message_dispatches
     SET status = p_status,
         recipient_phone = p_recipient_phone,
         sender_display = p_sender_display,
         body = p_body,
         last_attempt_at = now(),
         updated_at = now()
   WHERE id = p_dispatch_id;

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$function$;

-- 판정·쓰기 함수는 서버(service role)만 부른다
REVOKE ALL ON FUNCTION public.delivery_message_targets(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_delivery_completed_events(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_delivery_message_dispatch(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_delivery_message_dispatch(uuid, text, text, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_message_targets(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_delivery_completed_events(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_delivery_message_dispatch(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_delivery_message_dispatch(uuid, text, text, text, text, jsonb, uuid) TO service_role;
