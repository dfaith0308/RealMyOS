-- 썸네일 뱃지 + shipping_type 값 집합 갱신
-- 운영 DB 적용 완료 (2026-05-10)
--
-- shipping_type: free | paid | conditional_free (cold, same_day 제거)
-- 기존 cold → paid, same_day → free 로 이관 후 CHECK 교체

ALTER TABLE public.commerce_product_listings
  ADD COLUMN IF NOT EXISTS badge_labels text[];

COMMENT ON COLUMN public.commerce_product_listings.badge_labels IS
  '썸네일 카드용 뱃지 라벨 문자열 배열 (최대 2개 권장).';

-- 레거시 값 이관
UPDATE public.commerce_product_listings SET shipping_type = 'paid' WHERE shipping_type = 'cold';
UPDATE public.commerce_product_listings SET shipping_type = 'free' WHERE shipping_type = 'same_day';

-- shipping_type CHECK 제약: 이름이 환경마다 다를 수 있어 동적 DROP
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'commerce_product_listings'
      AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%shipping_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.commerce_product_listings DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.commerce_product_listings
  ADD CONSTRAINT commerce_product_listings_shipping_type_check
  CHECK (shipping_type IN ('free', 'paid', 'conditional_free'));

COMMENT ON COLUMN public.commerce_product_listings.shipping_type IS
  'free | paid | conditional_free';
