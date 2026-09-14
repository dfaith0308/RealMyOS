-- storefront 상품 상세페이지 템플릿 — 상품(묶음) → 옵션(listing) 상속 (2026-09-15)
-- **미실행. 사장님 승인 후 직접 적용.**
-- 기준: doc/transfer-brief-siksiki.md 1절 / 판단 근거: doc/transfer-audit-log.md 2단계
--
-- [무엇을 하나]
-- 상세페이지를 이미지가 아니라 "틀 하나 + 내용"으로 만든다.
-- 관리자가 한 번 넣는 값(입력값)만 이 테이블에 저장한다. 가격·수량별 단가·최소주문·배송비 같은
-- 시스템값은 저장하지 않고 화면이 commerce_product_listings / admin_settings 에서 매번 읽는다
-- (같은 값을 두 번 입력하지 않는다 — 원칙 4, 계산값 저장 금지 — RULE-00).
--
-- [상품 → 옵션 상속]
-- 식식이OS 에는 원래 "상품 안의 옵션" 개념이 없다. listing 한 행이 한 규격(spec)이다.
-- 그래서 "상품" = commerce_detail_templates 한 행(같은 품목의 묶음),
--      "옵션" = 거기에 연결된 listing (commerce_listing_detail_links 한 행)으로 대응시킨다.
-- - 템플릿에 넣은 칸은 연결된 모든 옵션이 쓴다
-- - 링크 행의 같은 이름 칸에 값을 넣으면 그 옵션만 자기 것을 쓴다
-- - 옵션 칸을 지우면(NULL) 다시 템플릿 것으로 돌아간다
-- - 칸 단위로 따로 정해진다 (컬럼 하나 = 칸 하나)
-- - 대표 사진·원산지·알레르기·보관·원재료는 listing 의 기존 칸이 곧 옵션 값이다
--   (옵션 값 → 템플릿 값 순서. 옵션 칸을 listing 수정 화면에서 비우면 템플릿 값으로 돌아간다)
--
-- [빈 값은 한 가지 모양만]
-- "안 채움"은 반드시 NULL 이다. 빈 문자열·빈 배열·빈 JSON 배열은 CHECK 로 거부한다.
-- 빈 문자열을 허용하면 "옵션에 빈칸을 넣었다(=상품 것을 가린다)"와 "안 넣었다(=상속)"가 섞인다.
--
-- [기존 상세이미지 생성기와의 관계]
-- ProductDetailImageGenerator(이미지 방식)와 listing 의 기존 컬럼(origin, allergen 등)은 그대로 둔다.
-- 템플릿에 연결하지 않은 listing 은 지금 화면이 한 픽셀도 바뀌지 않는다.
--
-- [기존 테이블 변경]
-- 없다. commerce_product_listings 에 컬럼을 추가하지 않고 링크 테이블로 연결한다.
-- 되돌리려면 이 파일이 만든 두 테이블만 지우면 된다(3순위).

-- ── 1. 상품(묶음) 단위 템플릿 ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commerce_detail_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 관리용 이름. 식당 화면에 나가지 않는다 (예: "국내산 깐마늘")
  title text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 80),

  -- ── 입력값 (전부 NULL 허용 — 안 채운 칸은 화면에서 통째로 숨긴다) ──────────────
  -- 첫 화면
  headline text,                -- 핵심 한 줄
  hero_image_urls text[],       -- 대표 사진
  -- 01 왜 이 식자재인가 — 원가율·조리 시간·회전율 (한 줄씩, 복사 가능한 문장)
  why_points text[],
  -- 02 어떤 매장에 맞는가
  fit_business_types text,      -- 업종
  fit_store_scale text,         -- 규모
  fit_price_range text,         -- 객단가
  -- 03 산지·가공·보관·HACCP
  story_body text,
  trust_points text[],          -- 신뢰 근거 한 줄씩 (예: "HACCP 인증 시설 가공")
  story_image_urls text[],
  -- 04 실제 메뉴 적용 예시 — [{ "image_url": "...", "caption": "..." }]
  menu_examples jsonb,
  -- 07 원산지·알레르기·유통기한 표
  info_origin text,
  info_allergen text,
  info_shelf_life text,
  info_storage text,
  info_ingredients text,
  -- 08 자주 묻는 질문 — [{ "q": "...", "a": "..." }]
  faqs jsonb,

  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- 삭제가 아니라 보관 (원칙 6). 보관된 템플릿은 식당 화면에서 쓰이지 않는다
  archived_at timestamptz,

  CONSTRAINT commerce_detail_templates_empty_is_null CHECK (
        (headline           IS NULL OR btrim(headline) <> '')
    AND (hero_image_urls    IS NULL OR cardinality(hero_image_urls) > 0)
    AND (why_points         IS NULL OR cardinality(why_points) > 0)
    AND (fit_business_types IS NULL OR btrim(fit_business_types) <> '')
    AND (fit_store_scale    IS NULL OR btrim(fit_store_scale) <> '')
    AND (fit_price_range    IS NULL OR btrim(fit_price_range) <> '')
    AND (story_body         IS NULL OR btrim(story_body) <> '')
    AND (trust_points       IS NULL OR cardinality(trust_points) > 0)
    AND (story_image_urls   IS NULL OR cardinality(story_image_urls) > 0)
    AND (menu_examples      IS NULL OR (jsonb_typeof(menu_examples) = 'array' AND jsonb_array_length(menu_examples) > 0))
    AND (info_origin        IS NULL OR btrim(info_origin) <> '')
    AND (info_allergen      IS NULL OR btrim(info_allergen) <> '')
    AND (info_shelf_life    IS NULL OR btrim(info_shelf_life) <> '')
    AND (info_storage       IS NULL OR btrim(info_storage) <> '')
    AND (info_ingredients   IS NULL OR btrim(info_ingredients) <> '')
    AND (faqs               IS NULL OR (jsonb_typeof(faqs) = 'array' AND jsonb_array_length(faqs) > 0))
  )
);

CREATE INDEX IF NOT EXISTS commerce_detail_templates_active_idx
  ON public.commerce_detail_templates (updated_at DESC)
  WHERE archived_at IS NULL;

-- ── 2. 옵션(listing) 연결 + 칸별 옵션 전용 값 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commerce_listing_detail_links (
  -- listing 하나는 템플릿 하나에만 속한다
  listing_id uuid PRIMARY KEY REFERENCES public.commerce_product_listings(id),
  template_id uuid NOT NULL REFERENCES public.commerce_detail_templates(id),
  -- 단가표·옵션 칩 순서 (입력값 — 1kg, 5kg, 박스 순서를 사람이 정한다)
  sort_order integer NOT NULL DEFAULT 0,

  -- ── 옵션 전용 값: NULL = 상품(템플릿) 것을 쓴다 ─────────────────────────────────
  -- 대표 사진·원산지·알레르기·보관·원재료는 여기 두지 않는다. listing 에 이미 같은 칸
  -- (image_urls, origin, allergen, storage_method, ingredients)이 있고, 그게 곧 "옵션에 따로 넣은 값"이다.
  -- 여기에 또 두면 옵션 원산지를 두 군데 입력하게 된다(원칙 4 위반) — transfer-audit-log 2-04.
  headline text,
  why_points text[],
  fit_business_types text,
  fit_store_scale text,
  fit_price_range text,
  story_body text,
  trust_points text[],
  story_image_urls text[],
  menu_examples jsonb,
  info_shelf_life text,          -- 유통기한은 listing 에 칸이 없어 여기서만 옵션별로 받는다
  faqs jsonb,

  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT commerce_listing_detail_links_empty_is_null CHECK (
        (headline           IS NULL OR btrim(headline) <> '')
    AND (why_points         IS NULL OR cardinality(why_points) > 0)
    AND (fit_business_types IS NULL OR btrim(fit_business_types) <> '')
    AND (fit_store_scale    IS NULL OR btrim(fit_store_scale) <> '')
    AND (fit_price_range    IS NULL OR btrim(fit_price_range) <> '')
    AND (story_body         IS NULL OR btrim(story_body) <> '')
    AND (trust_points       IS NULL OR cardinality(trust_points) > 0)
    AND (story_image_urls   IS NULL OR cardinality(story_image_urls) > 0)
    AND (menu_examples      IS NULL OR (jsonb_typeof(menu_examples) = 'array' AND jsonb_array_length(menu_examples) > 0))
    AND (info_shelf_life    IS NULL OR btrim(info_shelf_life) <> '')
    AND (faqs               IS NULL OR (jsonb_typeof(faqs) = 'array' AND jsonb_array_length(faqs) > 0))
  )
);

-- "이 템플릿의 옵션들" 조회 (단가표·옵션 칩)
CREATE INDEX IF NOT EXISTS commerce_listing_detail_links_template_idx
  ON public.commerce_listing_detail_links (template_id, sort_order);

-- ── 3. RLS — 관리자만 직접 연다 ─────────────────────────────────────────────────────
-- 식당 화면은 서버 액션이 "노출 중인 listing 인지"를 먼저 확인한 뒤 service role 로 읽는다.
-- (inquiries / sales_leads 와 같은 설계 — 관리 데이터는 is_admin() 하나로만 연다)
ALTER TABLE public.commerce_detail_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_listing_detail_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commerce_detail_templates_admin_all ON public.commerce_detail_templates;
CREATE POLICY commerce_detail_templates_admin_all ON public.commerce_detail_templates
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS commerce_listing_detail_links_admin_all ON public.commerce_listing_detail_links;
CREATE POLICY commerce_listing_detail_links_admin_all ON public.commerce_listing_detail_links
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.commerce_detail_templates IS
  '상세페이지 템플릿(상품=같은 품목 묶음). 입력값만 저장. 시스템값(가격·단가·최소주문·배송)은 listing/admin_settings 에서 읽는다';
COMMENT ON TABLE public.commerce_listing_detail_links IS
  '옵션(listing) ↔ 템플릿 연결 + 칸별 옵션 전용 값. 칸이 NULL 이면 템플릿 값을 상속한다';
COMMENT ON COLUMN public.commerce_detail_templates.archived_at IS
  '보관 시각. 삭제 대신 보관 — 보관된 템플릿은 식당 화면에서 쓰지 않는다';
COMMENT ON COLUMN public.commerce_listing_detail_links.sort_order IS
  '같은 템플릿 안 옵션 순서(단가표·옵션 칩). 작은 값이 먼저';
