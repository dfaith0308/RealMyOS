-- 현장 관찰기록 (관리자 전용) — 2026-09-07
--
-- 사장님이 현장에서 보고 들은 것(식당의 식자재, 유통 탑차 전화번호 등)을 사진+메모로
-- 즉시 남기고, 나중에 영업 리드로 전환한다.
-- sales_leads 와 같은 성격의 플랫폼 운영 데이터이므로 tenant_id 스코프가 없고
-- RLS 는 is_admin() 하나로만 연다 (20260828100000_create_sales_leads.sql 과 동일 설계).

-- 1) 관찰기록 테이블 --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.field_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 기존 commerce-images 버킷의 public URL 배열. 관찰기록 전용 저장소를 따로 만들지 않는다.
  -- 배열 컬럼은 sales_lead_notes.tags 와 같이 NOT NULL DEFAULT '{}' 로 둔다.
  -- NULL 을 허용하면 "태그가 없는 행"과 "태그를 모르는 행"이 섞이고,
  -- NOT (tags @> '{...}') 같은 제외 필터가 NULL 행을 조용히 떨어뜨린다.
  photo_urls text[] NOT NULL DEFAULT '{}',
  memo text NOT NULL,
  -- 어디서 봤는지. 전환 시 sales_leads.address 로 옮겨간다.
  location text,
  -- 사전 정의 없이 자유 입력 (sales_lead_notes.tags 와 동일)
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'unclassified'
    CHECK (status IN ('unclassified', 'converted', 'discarded')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 기본 목록은 status='unclassified' 를 최신순으로 본다
CREATE INDEX IF NOT EXISTS idx_field_observations_status_created
  ON public.field_observations(status, created_at DESC);
-- '콘텐츠소재' 등 태그 필터는 배열 포함 검색이므로 GIN
CREATE INDEX IF NOT EXISTS idx_field_observations_tags
  ON public.field_observations USING GIN (tags);

ALTER TABLE public.field_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS field_observations_admin_all ON public.field_observations;
CREATE POLICY field_observations_admin_all ON public.field_observations
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.field_observations IS
  '현장 관찰기록(사진+메모) — 관리자 전용, tenant 무관. 영업 리드 전환 전 단계';
COMMENT ON COLUMN public.field_observations.photo_urls IS
  'commerce-images 버킷 public URL. 상세이미지 업로드와 같은 경로를 쓴다';
COMMENT ON COLUMN public.field_observations.status IS
  'unclassified = 미분류(기본 목록) / converted = 리드로 전환됨 / discarded = 버림(물리 삭제 안 함)';

-- 2) 리드 메모에 사진 자리 만들기 -------------------------------------------
-- 관찰의 "사진·메모 그대로 복사"를 위해 sales_lead_notes 에 사진 배열을 더한다.
-- 컬럼 추가만 하는 가산 변경이라 기존 코드/데이터에 영향이 없다 (RULE-07).
ALTER TABLE public.sales_lead_notes
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.sales_lead_notes.photo_urls IS
  '메모에 딸린 사진 URL. 현장 관찰기록에서 전환될 때 원본 사진이 그대로 넘어온다';

-- 3) 관찰기록 일괄 확정 RPC --------------------------------------------------
-- 확정 한 번에 최대 3개 테이블(sales_leads / sales_lead_notes / field_observations)에
-- write 가 일어나므로 RULE-19(복수 write 원자성)에 따라 단일 RPC 로 묶는다.
--
-- p_items 는 화면에서 체크한 항목 배열이다. 예:
--   [{"observation_id":"...","lead_types":["restaurant","supplier"],
--     "company_name":"월현식당","keep_as_content":false,"discard":false}]
--
-- plpgsql 함수는 호출자의 트랜잭션 안에서 돌기 때문에, 중간에 RETURN 으로 빠져나가면
-- 이미 실행된 write 가 롤백되지 않는다. 그래서 "먼저 전부 검증·잠금 → 그 다음 전부 write"
-- 두 단계로 나눈다. 검증 단계는 write 를 하지 않으므로 여기서 실패해도 남는 게 없다.
CREATE OR REPLACE FUNCTION public.apply_field_observation_actions(
  p_items jsonb,
  p_created_by uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_item       jsonb;
  v_ids        uuid[] := '{}';
  v_id         uuid;
  v_lead_types text[];
  v_lead_type  text;
  v_company    text;
  v_keep       boolean;
  v_discard    boolean;
  v_found      integer;
  v_stale      integer;

  v_obs        public.field_observations%ROWTYPE;
  v_tags       text[];
  v_lead_id    uuid;
  v_lead_ids   uuid[] := '{}';
  v_converted  integer := 0;
  v_discarded  integer := 0;
  v_kept       integer := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '처리할 관찰기록이 없습니다.');
  END IF;

  -- ── 1단계: 입력 검증 (DB 접근 없음) ──────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_id := (v_item->>'observation_id')::uuid;
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('success', false, 'error', '관찰기록 ID 가 올바르지 않습니다.');
    END;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', '관찰기록 ID 가 없습니다.');
    END IF;
    IF v_id = ANY(v_ids) THEN
      RETURN jsonb_build_object('success', false, 'error', '같은 관찰기록이 두 번 들어왔습니다.');
    END IF;

    v_lead_types := ARRAY(
      SELECT jsonb_array_elements_text(COALESCE(v_item->'lead_types', '[]'::jsonb))
    );
    v_company := NULLIF(btrim(COALESCE(v_item->>'company_name', '')), '');
    v_keep    := COALESCE((v_item->>'keep_as_content')::boolean, false);
    v_discard := COALESCE((v_item->>'discard')::boolean, false);

    IF array_length(v_lead_types, 1) IS NULL AND NOT v_keep AND NOT v_discard THEN
      RETURN jsonb_build_object('success', false, 'error', '처리 방법을 하나 이상 선택하세요.');
    END IF;

    -- "삭제"는 나머지와 뜻이 반대라 함께 확정할 수 없다
    IF v_discard AND (array_length(v_lead_types, 1) IS NOT NULL OR v_keep) THEN
      RETURN jsonb_build_object(
        'success', false, 'error', '삭제는 다른 처리와 함께 선택할 수 없습니다.');
    END IF;

    FOREACH v_lead_type IN ARRAY v_lead_types
    LOOP
      IF v_lead_type NOT IN ('supplier', 'restaurant') THEN
        RETURN jsonb_build_object('success', false, 'error', '리드 유형이 올바르지 않습니다.');
      END IF;
    END LOOP;

    IF array_length(v_lead_types, 1) IS NOT NULL AND v_company IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', '리드로 전환하려면 업체명이 필요합니다.');
    END IF;

    v_ids := v_ids || v_id;
  END LOOP;

  -- ── 2단계: 대상 행을 한 번에 잠그고 상태 확인 (RULE-20 / 행별 조회 없음) ──
  PERFORM 1 FROM public.field_observations
   WHERE id = ANY(v_ids)
   ORDER BY id
     FOR UPDATE;

  SELECT count(*) INTO v_found FROM public.field_observations WHERE id = ANY(v_ids);
  IF v_found <> array_length(v_ids, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', '관찰기록을 찾을 수 없습니다.');
  END IF;

  SELECT count(*) INTO v_stale
    FROM public.field_observations
   WHERE id = ANY(v_ids) AND status <> 'unclassified';
  IF v_stale > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '이미 처리된 관찰기록이 있습니다. 새로고침 후 다시 시도해 주세요.');
  END IF;

  -- ── 3단계: 실제 반영 ────────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_id         := (v_item->>'observation_id')::uuid;
    v_lead_types := ARRAY(
      SELECT jsonb_array_elements_text(COALESCE(v_item->'lead_types', '[]'::jsonb))
    );
    v_company := NULLIF(btrim(COALESCE(v_item->>'company_name', '')), '');
    v_keep    := COALESCE((v_item->>'keep_as_content')::boolean, false);
    v_discard := COALESCE((v_item->>'discard')::boolean, false);

    SELECT * INTO v_obs FROM public.field_observations WHERE id = v_id;

    IF v_discard THEN
      -- 물리 삭제 금지 (RULE-10). 상태만 바꾼다.
      UPDATE public.field_observations SET status = 'discarded' WHERE id = v_id;
      v_discarded := v_discarded + 1;
      CONTINUE;
    END IF;

    v_tags := v_obs.tags;
    IF v_keep AND NOT (v_tags @> ARRAY['콘텐츠소재']) THEN
      v_tags := v_tags || ARRAY['콘텐츠소재'];
    END IF;

    IF array_length(v_lead_types, 1) IS NOT NULL THEN
      FOREACH v_lead_type IN ARRAY v_lead_types
      LOOP
        -- 관찰의 location 은 주소 자리로 넘긴다. region_sido/sigungu 파싱은
        -- 리드 상세에서 주소를 저장할 때 앱 쪽 parseRegion 이 채운다.
        INSERT INTO public.sales_leads (lead_type, company_name, address, created_by)
        VALUES (v_lead_type, v_company, v_obs.location, p_created_by)
        RETURNING id INTO v_lead_id;

        -- 최초 메모에 관찰의 사진·메모·태그를 그대로 복사한다
        INSERT INTO public.sales_lead_notes (lead_id, body, tags, photo_urls, created_by)
        VALUES (v_lead_id, v_obs.memo, v_tags, v_obs.photo_urls, p_created_by);

        v_lead_ids := v_lead_ids || v_lead_id;
      END LOOP;

      -- 원본은 남긴다 (삭제 아님)
      UPDATE public.field_observations
         SET status = 'converted', tags = v_tags
       WHERE id = v_id;
      v_converted := v_converted + 1;
      IF v_keep THEN v_kept := v_kept + 1; END IF;
      CONTINUE;
    END IF;

    -- 보관만 — 리드는 만들지 않고 '콘텐츠소재' 태그만 붙인다. 상태는 미분류 유지.
    UPDATE public.field_observations SET tags = v_tags WHERE id = v_id;
    v_kept := v_kept + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success',   true,
    'lead_ids',  to_jsonb(v_lead_ids),
    'converted', v_converted,
    'discarded', v_discarded,
    'kept',      v_kept
  );
END;
$function$;

COMMENT ON FUNCTION public.apply_field_observation_actions(jsonb, uuid) IS
  '관찰기록 일괄 확정 — 리드 생성 + 최초 메모 복사 + 원본 상태 변경을 한 트랜잭션으로 처리';
