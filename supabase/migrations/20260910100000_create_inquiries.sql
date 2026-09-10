-- 고객 문의 기록 (관리자 전용) — 2026-09-10
--
-- [배경]
-- 고객이 먼저 연락해 온 것(CS)을 남기는 자리다.
-- 기존 sales_leads 는 우리가 먼저 찾아가는 잠재고객 발굴이라 성격이 반대이고,
-- 상태 흐름(status/interest_level/지역)도 전혀 다르다. 그래서 컬럼을 얹지 않고 테이블을 나눈다.
--
-- field_observations / sales_leads 와 같은 플랫폼 운영 데이터이므로
-- tenant_id 스코프가 없고 RLS 는 is_admin() 하나로만 연다
-- (20260907100000_create_field_observations.sql 과 동일 설계).
--
-- [문의유형·응대방식을 CHECK 로 묶지 않는 이유]
-- 값 자체는 고정 선택지다. 다만 선택지는 앞으로 늘어난다(문의 경로가 계속 생긴다).
-- CHECK 를 걸면 선택지 하나 추가할 때마다 마이그레이션이 필요해지므로,
-- 허용값의 단일 출처는 src/types/inquiry.ts 로 두고 서버 액션에서 검증한다.
-- 반면 match_status 는 코드 분기가 걸린 진짜 닫힌 집합이라 CHECK 를 건다.

CREATE TABLE IF NOT EXISTS public.inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── 문의 내용 ──────────────────────────────────────────────────────────
  -- 코드값. 라벨은 앱이 가진다 (INQUIRY_TYPES / RESPONSE_METHODS)
  inquiry_type text NOT NULL,
  -- inquiry_type = 'other' 일 때만 채워지는 직접입력. 그 외에는 NULL
  inquiry_type_etc text,
  response_method text NOT NULL,
  response_method_etc text,

  -- ── 응대 진행 3종 — "했는가(예/아니오) + 무엇을 했는가(한 줄)" ──────────
  -- 목록에서는 O/X 만 보고, 상세에서 한 줄까지 본다.
  -- 값을 하나로 합치지 않는 이유: 빈 문자열과 "안 함"이 섞이면 집계가 안 된다.
  price_guided boolean NOT NULL DEFAULT false,
  price_guide_note text,
  payment_guided boolean NOT NULL DEFAULT false,
  payment_guide_note text,
  shipped boolean NOT NULL DEFAULT false,
  shipping_note text,

  -- ── 상세 메모 + 사진 ──────────────────────────────────────────────────
  memo text NOT NULL DEFAULT '',
  -- 관찰기록과 같은 commerce-images 버킷 public URL. 전용 저장소를 따로 만들지 않는다.
  -- 배열은 field_observations.photo_urls 와 같이 NOT NULL DEFAULT '{}' 로 둔다
  -- (NULL 을 허용하면 "사진 없는 행"과 "모르는 행"이 섞인다).
  photo_urls text[] NOT NULL DEFAULT '{}',

  -- ── 고객 ──────────────────────────────────────────────────────────────
  -- 둘 다 NULL 허용이다. 다만 앱은 이름·연락처 중 하나를 반드시 받는다
  -- (둘 다 없으면 나중에 회원과 맞춰볼 단서가 없어 영영 미매칭으로 남는다).
  customer_name text,
  customer_phone text,

  inquired_at timestamptz NOT NULL DEFAULT now(),

  -- ── 담당자 ────────────────────────────────────────────────────────────
  -- 응대한 관리자의 users.id. 로그인 정보로 서버가 채우며 화면에서 고칠 수 없다.
  -- FK 를 걸지 않는 이유는 admin_logs.admin_id 와 같다 —
  -- users 행이 지워져도 "누가 응대했다"는 사실은 남아야 한다.
  handled_by uuid,

  -- ── 회원 매칭 ─────────────────────────────────────────────────────────
  -- 자동 매칭은 하지 않는다. 이름·연락처가 같아도 후보로만 보여주고 사람이 확정한다.
  match_status text NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched', 'matched')),
  matched_tenant_id uuid REFERENCES public.tenants(id),
  matched_at timestamptz,
  matched_by uuid,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- 상태와 실제 연결이 어긋난 행이 생기지 않게 막는다.
  -- matched 인데 tenant 가 없거나, unmatched 인데 tenant 가 붙은 행은 존재할 수 없다.
  CONSTRAINT inquiries_match_consistent CHECK (
    (match_status = 'matched'   AND matched_tenant_id IS NOT NULL) OR
    (match_status = 'unmatched' AND matched_tenant_id IS NULL)
  )
);

-- 기본 목록은 최신 문의순, 그리고 매칭상태로 걸러 본다
CREATE INDEX IF NOT EXISTS idx_inquiries_status_inquired
  ON public.inquiries(match_status, inquired_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_inquired_at
  ON public.inquiries(inquired_at DESC);
-- "이 회원의 과거 문의" 조회용. 대부분 NULL 이므로 partial
CREATE INDEX IF NOT EXISTS idx_inquiries_matched_tenant
  ON public.inquiries(matched_tenant_id)
  WHERE matched_tenant_id IS NOT NULL;

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inquiries_admin_all ON public.inquiries;
CREATE POLICY inquiries_admin_all ON public.inquiries
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.inquiries IS
  '고객이 먼저 연락해 온 문의(CS) 기록 — 관리자 전용, tenant 무관. 잠재고객 발굴(sales_leads)과 분리';
COMMENT ON COLUMN public.inquiries.inquiry_type IS
  '문의유형 코드. 허용값의 단일 출처는 src/types/inquiry.ts (INQUIRY_TYPES)';
COMMENT ON COLUMN public.inquiries.response_method IS
  '응대방식 코드. 허용값의 단일 출처는 src/types/inquiry.ts (RESPONSE_METHODS)';
COMMENT ON COLUMN public.inquiries.handled_by IS
  '응대한 관리자의 users.id. 로그인 정보로 서버가 채운다(화면 수정 불가)';
COMMENT ON COLUMN public.inquiries.match_status IS
  'unmatched = 아직 회원과 연결 안 됨(기본) / matched = 관리자가 직접 확인해 연결함';
COMMENT ON COLUMN public.inquiries.matched_tenant_id IS
  '연결된 회원 tenant. 자동 매칭 금지 — 반드시 사람이 확인하고 연결한다';

-- ── 회원 연결 RPC ──────────────────────────────────────────────────────────
-- 연결 한 번에 inquiries UPDATE + admin_logs INSERT 두 테이블에 write 가 일어나므로
-- RULE-19(복수 write 원자성)에 따라 단일 RPC 로 묶는다.
--
-- 동시성(RULE-20): 대상 행을 먼저 FOR UPDATE 로 잠그고 match_status 를 확인한다.
-- 두 관리자가 같은 문의를 서로 다른 회원에게 동시에 연결하는 것을 막는다.
-- 이미 연결된 문의는 조용히 덮어쓰지 않고 거부한다 — 먼저 연결한 사람의 판단을
-- 나중 사람이 모른 채 지우는 일이 없어야 한다.
CREATE OR REPLACE FUNCTION public.match_inquiry_to_tenant(
  p_inquiry_id uuid,
  p_tenant_id  uuid,
  p_admin_id   uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  -- admin_logs.admin_tenant_id 에 쓰는 플랫폼 운영 tenant sentinel
  c_platform_tenant constant uuid := '00000000-0000-0000-0000-000000000000';
  v_inq    public.inquiries%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
BEGIN
  IF p_inquiry_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '문의 또는 회원이 지정되지 않았습니다.');
  END IF;

  -- 1) 대상 문의를 잠그고 상태 확인
  SELECT * INTO v_inq
    FROM public.inquiries
   WHERE id = p_inquiry_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '문의를 찾을 수 없습니다.');
  END IF;

  IF v_inq.match_status = 'matched' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '이미 연결된 문의입니다. 새로고침 후 확인해 주세요.');
  END IF;

  -- 2) 연결 대상 회원 확인 — 탈퇴했거나 식당·공급자가 아닌 계정에는 연결하지 않는다
  SELECT * INTO v_tenant
    FROM public.tenants
   WHERE id = p_tenant_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '회원을 찾을 수 없습니다.');
  END IF;

  IF v_tenant.role IS DISTINCT FROM 'restaurant' AND v_tenant.role IS DISTINCT FROM 'supplier' THEN
    RETURN jsonb_build_object('success', false, 'error', '식당 또는 공급자 회원에만 연결할 수 있습니다.');
  END IF;

  -- 3) 연결
  UPDATE public.inquiries
     SET matched_tenant_id = p_tenant_id,
         match_status      = 'matched',
         matched_at        = now(),
         matched_by        = p_admin_id
   WHERE id = p_inquiry_id;

  -- 4) 누가 어느 문의를 누구에게 붙였는지 남긴다.
  --    자동 매칭이 아니라 사람의 판단이므로 되짚을 수 있어야 한다.
  INSERT INTO public.admin_logs (
    admin_tenant_id, admin_id, tenant_id, action_type, reason,
    target_table, target_id, old_value, new_value, payload
  ) VALUES (
    c_platform_tenant,
    p_admin_id,
    p_tenant_id,
    'inquiry_matched',
    '관리자 수동 확인 후 회원 연결',
    'inquiries',
    p_inquiry_id,
    jsonb_build_object('match_status', v_inq.match_status, 'matched_tenant_id', NULL),
    jsonb_build_object(
      'match_status', 'matched',
      'matched_tenant_id', p_tenant_id,
      'tenant_name', v_tenant.name,
      'customer_name', v_inq.customer_name,
      'customer_phone', v_inq.customer_phone
    ),
    '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'tenant_name', v_tenant.name
  );
END;
$function$;

COMMENT ON FUNCTION public.match_inquiry_to_tenant(uuid, uuid, uuid) IS
  '문의 → 회원 수동 연결 — 상태 변경 + admin_logs 기록을 한 트랜잭션으로 처리 (자동 매칭 아님)';
