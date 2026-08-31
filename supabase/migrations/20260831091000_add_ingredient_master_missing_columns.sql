-- ingredient_master 누락 컬럼 복구 — 2026-08-31
--
-- 배경: 20260618140000_create_ingredient_master.sql 은 manufacturer / ingredients_text 를
-- 선언하고 "운영 DB 적용 완료" 주석이 붙어 있지만, 운영 테이블에는 두 컬럼이 없다.
-- CREATE TABLE IF NOT EXISTS 로 만든 뒤 파일에만 컬럼을 덧붙이고 재적용하지 않아
-- 생긴 스키마 드리프트로 보인다.
--
-- 증상 (2026-08-31 실측):
--   - upsertIngredientMaster 의 INSERT 가 두 컬럼을 포함해 42703 으로 항상 실패.
--     commerce.ts 가 "비치명적"으로 삼켜서 상품 등록은 성공하고 마스터만 안 쌓였다.
--     그래서 listing_created_full 로그 138건인데 ingredient_master 는 0행이다.
--   - getConfirmedMasters / getUnconfirmedMasters 의 SELECT 도 같은 이유로 항상 실패해
--     식자재 마스터 화면이 도입 이후 한 번도 값을 보여준 적이 없다.
--
-- 이 마이그레이션은 컬럼 추가만 한다 — 기존 행·컬럼을 건드리지 않는다.
-- (실측 시점 ingredient_master 0행 / ingredient_mappings 0행)

ALTER TABLE public.ingredient_master
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS ingredients_text text;

COMMENT ON COLUMN public.ingredient_master.manufacturer IS '제조사 — 상품 등록 폼의 manufacturer 가 그대로 들어온다';
COMMENT ON COLUMN public.ingredient_master.ingredients_text IS '원재료명 원문 — 상품 등록 폼의 ingredients 가 그대로 들어온다';
