-- /buy 등에서 listing → products embed 시 name 이 비는 경우 완화:
-- 공개·노출 중인 commerce listing 이 참조하는 상품은 authenticated 가 SELECT 할 수 있게 한다.
-- products 테이블에 RLS 가 이미 켜져 있을 때만 정책을 추가한다 (RLS 미사용 DB 에서는 스킵).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'products'
      AND c.relrowsecurity = true
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'products_select_if_visible_commerce_listing'
  ) THEN
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
              AND l.status = 'visible'
              AND l.is_visible = true
              AND l.deleted_at IS NULL
          )
        );
    $pol$;
  END IF;
END $$;
