-- storefront 배송 추적 — 자체 배송 상태 체계 (2026-09-15)
-- **미실행. 사장님 승인 후 직접 적용.**
-- 기준: doc/transfer-brief-siksiki.md 2절 / 판단 근거: doc/transfer-audit-log.md 1단계
--
-- [무엇을 하나]
-- 택배사·조회 업체·관리자·공급자 누가 알려주든, 배송 상태는 이 파일이 정한 자체 상태로만 쓴다.
--   진행: not_registered(송장 등록 전) → ready(배송 준비) → picked_up(집화)
--         → in_transit(배송 중) → out_for_delivery(배달 중) → delivered(배송 완료)
--   예외: attention(확인 필요 — 지연·주소 오류·반송) / lookup_error(조회 오류 — 모르는 값)
-- 원문은 "7단계"라 부르지만 이름은 8개다. 하나도 빼지 않았다(transfer-audit-log 0-06).
--
-- [기존 status 와의 관계]
-- commerce_orders.status(pending_payment/paid/preparing/shipped/completed/cancelled/refunded)는
-- 결제·회계 흐름(allocation 생성, reversal, 환불)에 묶여 있다. 여기에 배송 단계를 섞으면
-- 그 분기들이 전부 흔들린다. 그래서 status 는 손대지 않고 delivery_status 를 **나란히 얹는다.**
-- 기존 주문은 delivery_status = NULL(아직 추적 시작 안 함)로 남고, 기존 화면은 그대로다.
--
-- [규칙 세 가지 — 판정은 apply_commerce_delivery_event() 한 곳에서만]
-- 1) 모르는 값은 lookup_error. 추측해서 delivered 를 만들지 않는다
-- 2) 낮은 단계로 되돌아가지 않는다. 예외 상태에서 복귀할 때도 이미 도달한 단계보다 낮게는 못 간다
-- 3) 원본 값(raw_status, raw_payload)을 이벤트 행에 함께 보관한다. 무시된 입력도 남긴다
--
-- [중복 처리 방지]
-- (commerce_order_id, dedupe_key) UNIQUE. 같은 사건이 몇 번 들어와도 행은 하나, 반영도 한 번.
-- 추가로 "적용된 delivered" 는 주문당 1행만 존재할 수 있게 partial unique index 를 건다.
-- 배송 완료는 3단계 자동 메시지의 방아쇠라, 여기가 뚫리면 같은 식당에 메시지가 여러 번 나간다.
--
-- [계산값 저장 금지]
-- delivered_at / 마지막 갱신 시각은 컬럼으로 두지 않는다. 이벤트 행(occurred_at, outcome)에서
-- 언제든 같은 값으로 다시 구할 수 있기 때문이다(RULE-00). delivery_status 는 status 와 같은
-- "현재 상태" 자체라 저장한다 — 후퇴 금지 규칙을 쓰기 시점에 강제하려면 현재 상태가 있어야 한다.

-- ── 1. commerce_orders 에 배송 컬럼 추가 (전부 NULL 허용 — 기존 행 영향 없음) ──────────
ALTER TABLE public.commerce_orders
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivery_carrier text,
  ADD COLUMN IF NOT EXISTS delivery_tracking_no text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'commerce_orders_delivery_status_check'
       AND conrelid = 'public.commerce_orders'::regclass
  ) THEN
    ALTER TABLE public.commerce_orders
      ADD CONSTRAINT commerce_orders_delivery_status_check
      CHECK (
        delivery_status IS NULL OR delivery_status IN (
          'not_registered', 'ready', 'picked_up', 'in_transit', 'out_for_delivery',
          'delivered', 'attention', 'lookup_error'
        )
      );
  END IF;
END $$;

-- "확인 필요 5" 같은 현황판과 미배송 골라보기용. 추적 안 하는 기존 주문(NULL)은 제외
CREATE INDEX IF NOT EXISTS commerce_orders_delivery_status_idx
  ON public.commerce_orders (delivery_status, created_at DESC)
  WHERE delivery_status IS NOT NULL;

COMMENT ON COLUMN public.commerce_orders.delivery_status IS
  '자체 배송 상태. NULL=추적 시작 전(기존 주문). 쓰기는 apply_commerce_delivery_event() 로만. status(결제·회계 흐름)와 독립';
COMMENT ON COLUMN public.commerce_orders.delivery_carrier IS
  '택배사/배송 수단 표기(자유 입력). 자체 배송이면 비워둘 수 있다';
COMMENT ON COLUMN public.commerce_orders.delivery_tracking_no IS
  '송장번호. 자체 배송이면 NULL';

-- ── 2. 배송 이벤트 (append-only) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commerce_order_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commerce_order_id uuid NOT NULL REFERENCES public.commerce_orders(id),
  -- 주문의 구매자(식당) tenant. commerce_orders.tenant_id 와 같은 값 — 조회 스코핑용
  tenant_id uuid NOT NULL,

  -- 누가 알려줬나. 'manual_admin' | 'manual_supplier' | 'provider:<업체id>'
  -- 허용값의 단일 출처는 src/lib/delivery-tracking/ (선택지가 늘어나므로 CHECK 는 형식만 건다)
  source text NOT NULL CHECK (source ~ '^(manual_admin|manual_supplier|provider:[a-z0-9_-]+)$'),

  -- 원본 값. 업체가 준 문자열 그대로(수동 입력이면 고른 코드). 옮기는 규칙을 고칠 때 필요하다
  raw_status text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 자체 상태로 옮긴 값
  mapped_status text NOT NULL CHECK (mapped_status IN (
    'not_registered', 'ready', 'picked_up', 'in_transit', 'out_for_delivery',
    'delivered', 'attention', 'lookup_error'
  )),

  occurred_at timestamptz NOT NULL DEFAULT now(),
  dedupe_key text NOT NULL CHECK (length(dedupe_key) BETWEEN 1 AND 300),

  -- 이 입력이 주문 상태를 바꿨는가 — 쓰는 순간의 사실(나중에 규칙이 바뀌어도 당시 판단은 남는다)
  outcome text NOT NULL CHECK (outcome IN ('applied', 'ignored_same', 'ignored_regress', 'ignored_terminal')),
  status_before text,
  status_after text,

  carrier text,
  tracking_no text,
  note text,

  -- 입력한 사람. FK 를 걸지 않는 이유는 admin_logs.admin_id / inquiries.handled_by 와 같다
  recorded_by uuid,
  -- 입력한 주체 tenant (공급자 tenant, 관리자면 플랫폼 sentinel, 업체 조회면 NULL)
  recorded_by_tenant_id uuid,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT commerce_order_delivery_events_dedupe_uq UNIQUE (commerce_order_id, dedupe_key)
);

-- 배송 완료 "반영"은 주문당 한 번만 존재할 수 있다 (메시지 방아쇠 이중 방지의 마지막 벽)
CREATE UNIQUE INDEX IF NOT EXISTS commerce_order_delivery_events_one_delivered_uq
  ON public.commerce_order_delivery_events (commerce_order_id)
  WHERE mapped_status = 'delivered' AND outcome = 'applied';

CREATE INDEX IF NOT EXISTS commerce_order_delivery_events_order_idx
  ON public.commerce_order_delivery_events (commerce_order_id, occurred_at, created_at);
CREATE INDEX IF NOT EXISTS commerce_order_delivery_events_tenant_idx
  ON public.commerce_order_delivery_events (tenant_id, created_at DESC);

ALTER TABLE public.commerce_order_delivery_events ENABLE ROW LEVEL SECURITY;

-- 관리자만 직접 읽는다. 식당·공급자 화면은 서버 액션이 tenant 스코프를 걸고 필요한 컬럼만 읽는다
-- (note·recorded_by 같은 내부 값이 PostgREST 로 식당에 노출되지 않게 — inquiries 와 같은 설계).
-- INSERT/UPDATE/DELETE 정책은 두지 않는다 → 쓰기는 service role 이 부르는 RPC 로만.
DROP POLICY IF EXISTS commerce_order_delivery_events_admin_select ON public.commerce_order_delivery_events;
CREATE POLICY commerce_order_delivery_events_admin_select ON public.commerce_order_delivery_events
  FOR SELECT USING (public.is_admin());

COMMENT ON TABLE public.commerce_order_delivery_events IS
  '배송 상태 입력 기록(append-only). 무시된 입력·원본 값까지 남긴다. 쓰기는 apply_commerce_delivery_event() 로만';
COMMENT ON COLUMN public.commerce_order_delivery_events.dedupe_key IS
  '중복 방지 키. 수동 입력=manual:<제출 UUID>, 업체 조회=provider:<id>:<송장>:<원본상태>:<시각>';
COMMENT ON COLUMN public.commerce_order_delivery_events.outcome IS
  'applied=상태 반영 / ignored_same=같은 상태 / ignored_regress=후퇴 차단 / ignored_terminal=이미 배송 완료';

-- ── 3. 판정 함수 — 배송 상태를 바꾸는 유일한 경로 ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commerce_delivery_progress_rank(p_status text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_status
    WHEN 'not_registered'   THEN 0
    WHEN 'ready'            THEN 1
    WHEN 'picked_up'        THEN 2
    WHEN 'in_transit'       THEN 3
    WHEN 'out_for_delivery' THEN 4
    WHEN 'delivered'        THEN 5
    ELSE NULL  -- attention / lookup_error 는 진행 단계가 아니다
  END
$function$;

COMMENT ON FUNCTION public.commerce_delivery_progress_rank(text) IS
  '배송 진행 순위. 예외 상태(attention/lookup_error)와 모르는 값은 NULL';

CREATE OR REPLACE FUNCTION public.apply_commerce_delivery_event(
  p_order_id        uuid,
  p_mapped_status   text,
  p_raw_status      text,
  p_source          text,
  p_dedupe_key      text,
  p_occurred_at     timestamptz DEFAULT NULL,
  p_actor_user_id   uuid DEFAULT NULL,
  p_actor_tenant_id uuid DEFAULT NULL,
  p_carrier         text DEFAULT NULL,
  p_tracking_no     text DEFAULT NULL,
  p_raw_payload     jsonb DEFAULT '{}'::jsonb,
  p_note            text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  c_platform_tenant constant uuid := '00000000-0000-0000-0000-000000000000';
  v_order      public.commerce_orders%ROWTYPE;
  v_mapped     text;
  v_before     text;
  v_after      text;
  v_outcome    text;
  v_rank_new   integer;
  v_max_rank   integer;
  v_event_id   uuid;
  v_carrier    text := NULLIF(btrim(COALESCE(p_carrier, '')), '');
  v_tracking   text := NULLIF(btrim(COALESCE(p_tracking_no, '')), '');
  v_key        text := btrim(COALESCE(p_dedupe_key, ''));
BEGIN
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '주문이 지정되지 않았습니다.');
  END IF;
  IF v_key = '' THEN
    RETURN jsonb_build_object('success', false, 'error', '중복 방지 키가 없습니다.');
  END IF;

  -- 규칙 1: 모르는 값은 조회 오류. 앱이 옮긴 값이 체계 밖이어도 DB 가 한 번 더 막는다
  v_mapped := CASE
    WHEN p_mapped_status IN ('not_registered', 'ready', 'picked_up', 'in_transit',
                             'out_for_delivery', 'delivered', 'attention', 'lookup_error')
      THEN p_mapped_status
    ELSE 'lookup_error'
  END;

  -- 같은 주문에 대한 동시 입력은 여기서 줄을 선다
  SELECT * INTO v_order
    FROM public.commerce_orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '주문을 찾을 수 없습니다.');
  END IF;

  -- 결제 확인 전·취소·환불 주문은 배송이 시작될 수 없다
  IF v_order.status NOT IN ('paid', 'preparing', 'shipped', 'completed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '결제 확인 전이거나 취소·환불된 주문은 배송 상태를 입력할 수 없습니다.');
  END IF;

  -- 중복 방지: 같은 키가 이미 있으면 아무것도 하지 않고 처음 결과를 돌려준다
  SELECT id, outcome, status_after INTO v_event_id, v_outcome, v_after
    FROM public.commerce_order_delivery_events
   WHERE commerce_order_id = p_order_id
     AND dedupe_key = v_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'event_id', v_event_id,
      'outcome', v_outcome,
      'status_before', v_order.delivery_status,
      'status_after', v_order.delivery_status,
      'became_delivered', false);
  END IF;

  v_before   := v_order.delivery_status;
  v_rank_new := public.commerce_delivery_progress_rank(v_mapped);

  -- 이미 도달한 가장 높은 진행 단계. 지금이 예외 상태여도 과거에 도달한 단계는 기억한다
  SELECT MAX(public.commerce_delivery_progress_rank(e.mapped_status))
    INTO v_max_rank
    FROM public.commerce_order_delivery_events e
   WHERE e.commerce_order_id = p_order_id
     AND e.outcome = 'applied';
  v_max_rank := GREATEST(
    COALESCE(v_max_rank, -1),
    COALESCE(public.commerce_delivery_progress_rank(v_before), -1));

  IF v_before = 'delivered' THEN
    v_outcome := 'ignored_terminal';        -- 배송 완료는 끝. 이후 어떤 입력도 상태를 못 바꾼다
  ELSIF v_before IS NOT DISTINCT FROM v_mapped THEN
    v_outcome := 'ignored_same';
  ELSIF v_rank_new IS NULL THEN
    v_outcome := 'applied';                 -- 예외 상태는 완료 전 어느 단계에서든 들어갈 수 있다
  ELSIF v_rank_new < v_max_rank THEN
    v_outcome := 'ignored_regress';         -- 규칙 2: 후퇴 금지
  ELSE
    v_outcome := 'applied';
  END IF;

  v_after := CASE WHEN v_outcome = 'applied' THEN v_mapped ELSE v_before END;

  -- 규칙 3: 무시된 입력도 원본 값과 함께 남긴다
  INSERT INTO public.commerce_order_delivery_events (
    commerce_order_id, tenant_id, source, raw_status, raw_payload, mapped_status,
    occurred_at, dedupe_key, outcome, status_before, status_after,
    carrier, tracking_no, note, recorded_by, recorded_by_tenant_id
  ) VALUES (
    p_order_id, v_order.tenant_id, p_source, p_raw_status, COALESCE(p_raw_payload, '{}'::jsonb), v_mapped,
    COALESCE(p_occurred_at, now()), v_key, v_outcome, v_before, v_after,
    v_carrier, v_tracking, NULLIF(btrim(COALESCE(p_note, '')), ''), p_actor_user_id, p_actor_tenant_id
  )
  RETURNING id INTO v_event_id;

  IF v_outcome = 'applied' THEN
    -- 아래 가드 트리거에 "판정 함수가 쓰는 중"임을 알린다 (트랜잭션 한정)
    PERFORM set_config('siksiki.delivery_event_write', 'on', true);
    -- updated_at 은 건드리지 않는다: 결제·회계 흐름의 "주문 변경" 신호와 섞지 않기 위해서다
    UPDATE public.commerce_orders
       SET delivery_status      = v_mapped,
           delivery_carrier     = COALESCE(v_carrier, delivery_carrier),
           delivery_tracking_no = COALESCE(v_tracking, delivery_tracking_no)
     WHERE id = p_order_id;
    PERFORM set_config('siksiki.delivery_event_write', 'off', true);
  END IF;

  -- 관리자가 손으로 넣은 것은 관리자 활동 기록에도 남긴다 (한 트랜잭션 — RULE-19)
  IF p_source = 'manual_admin' THEN
    INSERT INTO public.admin_logs (
      admin_tenant_id, admin_id, tenant_id, action_type, reason,
      target_table, target_id, old_value, new_value, payload
    ) VALUES (
      c_platform_tenant, p_actor_user_id, v_order.tenant_id,
      'commerce_delivery_status_recorded', '관리자 수동 배송 상태 입력',
      'commerce_orders', p_order_id,
      jsonb_build_object('delivery_status', v_before),
      jsonb_build_object(
        'delivery_status', v_after, 'input_status', v_mapped, 'outcome', v_outcome,
        'event_id', v_event_id, 'order_number', v_order.order_number),
      '{}'::jsonb
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'event_id', v_event_id,
    'outcome', v_outcome,
    'status_before', v_before,
    'status_after', v_after,
    'became_delivered', (v_outcome = 'applied' AND v_mapped = 'delivered'));
END;
$function$;

COMMENT ON FUNCTION public.apply_commerce_delivery_event(uuid, text, text, text, text, timestamptz, uuid, uuid, text, text, jsonb, text) IS
  '배송 상태 판정의 유일한 경로 — 모르는 값=조회오류 / 후퇴 금지 / 원본 보관 / 중복 방지 키';

-- ── 4. 가드 — delivery_status 는 판정 함수 밖에서 바뀔 수 없다 ────────────────────────
-- commerce_orders 의 기존 tenant RLS 는 구매자에게 FOR ALL 이다. 가드가 없으면 식당 세션이
-- PATCH 한 번으로 자기 주문을 delivered 로 만들 수 있고, 그게 3단계 메시지 방아쇠가 된다.
-- 기존 코드는 delivery_status 를 쓰지 않으므로(신규 컬럼) 이 트리거는 기존 흐름에 영향이 없다.
CREATE OR REPLACE FUNCTION public.guard_commerce_delivery_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.delivery_status IS DISTINCT FROM OLD.delivery_status
     AND COALESCE(current_setting('siksiki.delivery_event_write', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'delivery_status 는 apply_commerce_delivery_event() 로만 바꿀 수 있습니다'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_commerce_delivery_status ON public.commerce_orders;
CREATE TRIGGER trg_guard_commerce_delivery_status
  BEFORE UPDATE OF delivery_status ON public.commerce_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_commerce_delivery_status();

-- INSERT 로 처음부터 상태를 박아 넣는 것도 막는다 (새 주문은 NULL 로 시작)
CREATE OR REPLACE FUNCTION public.guard_commerce_delivery_status_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.delivery_status IS NOT NULL THEN
    RAISE EXCEPTION '새 주문의 delivery_status 는 NULL 이어야 합니다'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_commerce_delivery_status_insert ON public.commerce_orders;
CREATE TRIGGER trg_guard_commerce_delivery_status_insert
  BEFORE INSERT ON public.commerce_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_commerce_delivery_status_insert();

-- ── 5. 권한 ─────────────────────────────────────────────────────────────────────────
-- 식당 세션이 PostgREST 로 직접 부르지 못하게 한다. 서버(service role)만 부른다.
-- (commerce_orders 의 기존 tenant RLS 는 구매자에게 FOR ALL 이라, 열어두면 식당이 자기 주문을
--  "배송 완료"로 만들 수 있다)
REVOKE ALL ON FUNCTION public.apply_commerce_delivery_event(uuid, text, text, text, text, timestamptz, uuid, uuid, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_commerce_delivery_event(uuid, text, text, text, text, timestamptz, uuid, uuid, text, text, jsonb, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_commerce_delivery_event(uuid, text, text, text, text, timestamptz, uuid, uuid, text, text, jsonb, text) TO service_role;
