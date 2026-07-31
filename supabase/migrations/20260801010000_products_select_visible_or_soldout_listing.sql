-- products: 노출 중인 commerce listing 이 참조하는 상품은 authenticated SELECT 허용
-- (20260510100000 정책이 운영 DB에 없거나 sold_out 미포함인 경우 보정)
--
-- 배경: 식당OS /buy?search= 가 products.name ilike 로 검색하는데,
-- products RLS 때문에 0건 → 검색 항상 빈 결과. nested products(name) 도 null.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'products'
      AND c.relrowsecurity = true
  ) THEN
    -- 기존 정책 있으면 교체 (sold_out 포함)
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'products'
        AND policyname = 'products_select_if_visible_commerce_listing'
    ) THEN
      EXECUTE 'DROP POLICY "products_select_if_visible_commerce_listing" ON public.products';
    END IF;

    EXECUTE $pol$
      CREATE POLICY "products_select_if_visible_commerce_listing"
        ON public.products
        FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.commerce_product_listings l
            WHERE l.product_id = products.id
              AND l.status IN ('visible', 'sold_out')
              AND l.is_visible = true
              AND l.deleted_at IS NULL
          )
        );
    $pol$;
  END IF;
END $$;
