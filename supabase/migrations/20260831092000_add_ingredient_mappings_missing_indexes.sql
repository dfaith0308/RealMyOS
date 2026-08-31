-- ingredient_mappings 누락 인덱스 복구 — 2026-08-31
--
-- 20260618140000_create_ingredient_master.sql 은 아래 인덱스들을 선언하지만
-- 운영 DB 에는 적용되지 않았다. 컬럼 누락(20260831091000)과 같은 드리프트다.
--
-- 증상 (2026-08-31 실측):
--   upsertIngredientMaster 의 매핑 upsert 가
--     .upsert(payload, { onConflict: 'source_type,source_id' })
--   인데 대상 유니크 제약이 없어 항상 42P10 으로 실패한다
--   ("there is no unique or exclusion constraint matching the ON CONFLICT specification").
--   그 결과 ingredient_master 행은 생겨도 ingredient_mappings 는 늘 비어,
--   식자재 마스터 화면의 "소스"·가격이 항상 빈 값이었다.
--
-- 유니크 인덱스는 (source_type, source_id) 중복이 있으면 생성이 실패한다.
-- 실측 시점 ingredient_mappings 0행이라 충돌 없음.
-- 나머지는 조회 성능용이며 전부 IF NOT EXISTS 라 재실행해도 안전하다.

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredient_mappings_source_unique
  ON public.ingredient_mappings(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_ingredient_mappings_master
  ON public.ingredient_mappings(master_id);

CREATE INDEX IF NOT EXISTS idx_ingredient_mappings_source
  ON public.ingredient_mappings(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_ingredient_master_barcode
  ON public.ingredient_master(barcode) WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ingredient_master_item_report
  ON public.ingredient_master(item_report_number) WHERE item_report_number IS NOT NULL;
