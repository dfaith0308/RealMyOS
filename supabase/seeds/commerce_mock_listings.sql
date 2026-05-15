-- Mock: 플랫폼 커머스 listing (테스트·스테이징용)
-- product 는 id 가 아래 접두로 시작하는 행만 대상 (products.id::text LIKE prefix || '%')
-- 이미 platform listing 이 있으면 건너뜀.
-- tenant_id / owner_tenant_id 는 플랫폼 플레이스홀더.
-- 저장소만 제공 — DB 실행은 수동.

BEGIN;

INSERT INTO public.commerce_product_listings (
  tenant_id,
  product_id,
  owner_type,
  owner_tenant_id,
  commerce_price,
  status,
  is_visible,
  thumbnail_url,
  description
)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  p.id,
  'platform',
  '00000000-0000-0000-0000-000000000000'::uuid,
  v.commerce_price,
  'visible',
  true,
  NULL::text,
  v.description
FROM (VALUES
  ('a473b180', 18900, '일반 고추가루 김치용 1kg · 업소용'),
  ('10bd7799', 24000, '청국장 2kg'),
  ('c6cad9c6', 3500, '택배비'),
  ('cef42309', 12800, '프리미엄 맛간장 1.8L'),
  ('39ebc625', 22900, '해내음 골드 고추가루 짜장용 1kg')
) AS v(id_prefix, commerce_price, description)
INNER JOIN public.products p
  ON p.id::text LIKE (v.id_prefix || '%')
 AND p.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM public.commerce_product_listings l
  WHERE l.product_id = p.id
    AND l.owner_type = 'platform'
    AND l.deleted_at IS NULL
);

COMMIT;
