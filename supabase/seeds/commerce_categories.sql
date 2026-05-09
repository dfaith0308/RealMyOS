-- 플랫폼 커머스용 공통 상품 카테고리 (product_categories)
-- tenant_id = 플랫폼 플레이스홀더. 저장소 전용 — DB 실행은 수동.
--
-- 선행 조건:
--   - public.product_categories 에 (tenant_id, name) 유니크가 있어야 ON CONFLICT 가 동작합니다.
--   - parent_id 컬럼이 없으면 아래 한 줄을 먼저 적용하세요.
--     ALTER TABLE public.product_categories
--       ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.product_categories(id);

BEGIN;

-- ── 대분류 (parent_id = NULL) ─────────────────────────────────
INSERT INTO public.product_categories (tenant_id, name, parent_id)
VALUES
  ('00000000-0000-0000-0000-000000000000'::uuid, '소스·양념', NULL),
  ('00000000-0000-0000-0000-000000000000'::uuid, '장류', NULL),
  ('00000000-0000-0000-0000-000000000000'::uuid, '육류·축산', NULL),
  ('00000000-0000-0000-0000-000000000000'::uuid, '냉동식품', NULL),
  ('00000000-0000-0000-0000-000000000000'::uuid, '채소·과일', NULL),
  ('00000000-0000-0000-0000-000000000000'::uuid, '일회용품', NULL),
  ('00000000-0000-0000-0000-000000000000'::uuid, '면·곡류', NULL),
  ('00000000-0000-0000-0000-000000000000'::uuid, '기타', NULL)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ── 소분류: 장류 하위 ─────────────────────────────────────────
INSERT INTO public.product_categories (tenant_id, name, parent_id)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  v.name,
  p.id
FROM (VALUES
  ('된장'),
  ('고추장'),
  ('쌈장'),
  ('청국장'),
  ('간장')
) AS v(name)
JOIN public.product_categories p
  ON p.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
 AND p.name = '장류'
 AND p.parent_id IS NULL
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ── 소분류: 소스·양념 하위 ───────────────────────────────────
INSERT INTO public.product_categories (tenant_id, name, parent_id)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  v.name,
  p.id
FROM (VALUES
  ('고추가루'),
  ('참기름·들기름'),
  ('소스류'),
  ('액젓'),
  ('다시다·육수')
) AS v(name)
JOIN public.product_categories p
  ON p.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
 AND p.name = '소스·양념'
 AND p.parent_id IS NULL
ON CONFLICT (tenant_id, name) DO NOTHING;

COMMIT;
