-- 카테고리 운영 컬럼 추가
-- 운영 DB 적용 전
ALTER TABLE public.product_categories
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- slug: URL/검색/필터용. name과 독립적으로 관리.
-- sort_order: 노출 순서 관리. 향후 drag&drop 확장 예정.
-- is_active: 삭제 대신 비활성화로 운영 권장.
-- 향후 category_icon / category_image 지원 예정.
