-- 카테고리 아이콘 컬럼 추가
-- 운영 DB 적용 완료 (2026-05-10)

ALTER TABLE public.product_categories
  ADD COLUMN IF NOT EXISTS icon_url text;

COMMENT ON COLUMN public.product_categories.icon_url IS
  '대분류 카테고리 아이콘 이미지 URL. 향후 Lucide/Heroicons 아이콘명 또는 커스텀 이미지 URL 저장 예정.';
