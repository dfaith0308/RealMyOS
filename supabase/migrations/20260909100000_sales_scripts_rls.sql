-- sales_scripts tenant 스코핑 RLS — 2026-09-09
--
-- [문제] 비로그인(anon) 상태에서 테이블 전체가 읽힌다. 실측:
--   GET /rest/v1/sales_scripts?select=tenant_id,type,title   [anon key only]
--   → HTTP 200, 7행 전부. 플랫폼(00000000-…) 5행 + 타 공급자 2행
--     · 5bf7aa92-… "1단계 : 쿠팡 안심번호용(된장)"
--     · d99a4eec-… "재구매 알림"
--   공급자의 영업 스크립트는 그 공급자의 영업 노하우다. 서로 보이면 안 된다.
--
-- [원인] 애플리케이션(src/actions/sales.ts:345 getSalesScripts)은 "자기 tenant +
--   플랫폼 공용"만 읽도록 짜여 있는데, DB 에는 그 제약이 없다. 즉 앱을 거치지
--   않고 PostgREST 를 직접 때리면 전부 보인다.
--
-- [이 파일의 전제] sales_scripts 는 CREATE TABLE 도 정책도 git 에 없는
--   테이블이다(운영 DB 96개 중 56개가 이 상태 — doc/migration-drift-report.md).
--   RLS 가 꺼져 있는지, 켜져 있고 USING(true) 류의 허용 정책이 있는지는
--   pg_policies 를 읽을 통로가 없어 확인하지 못했다(doc/overnight-audit-log.md 0-2).
--   그래서 두 경우 모두에서 같은 결과가 나오도록 방어적으로 쓴다:
--   기존 정책을 전부 걷어내고 → RLS 를 켜고 → 필요한 정책 3개만 새로 만든다.
--
-- [중요] SELECT 정책만 만들면 안 된다. RLS 가 꺼져 있는 상태였다면 켜는 순간
--   INSERT/UPDATE 도 같이 막혀서 스크립트 저장(sales.ts:357 saveSalesScript)이
--   죽는다. 그래서 INSERT/UPDATE 정책을 함께 만든다.
--   DELETE 정책은 만들지 않는다 — 코드에 물리 삭제 경로가 없고(deleted_at 소프트
--   삭제만 쓴다) RULE-10 상 앞으로도 없어야 한다. 소프트 삭제는 UPDATE 로 덮인다.

-- 1) 기존 정책 전부 제거 -----------------------------------------------------
-- 이름을 모르므로 카탈로그에서 찾아 지운다. 무엇이 있었는지는 NOTICE 로 남긴다
-- (Supabase SQL Editor 의 Messages 탭에서 보인다). 지금 anon 에게 전부 열려
-- 있다는 것은 여기 있던 정책이 아무것도 지키고 있지 않았다는 뜻이다.
DO $$
DECLARE
  v_pol   record;
  v_count integer := 0;
BEGIN
  FOR v_pol IN
    SELECT policyname, cmd, roles, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'sales_scripts'
  LOOP
    RAISE NOTICE '기존 정책 제거: % (cmd=%, roles=%, using=%, check=%)',
      v_pol.policyname, v_pol.cmd, v_pol.roles, v_pol.qual, v_pol.with_check;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.sales_scripts', v_pol.policyname);
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE NOTICE '기존 정책 없음 — RLS 가 꺼져 있었거나 정책이 하나도 없던 상태';
  ELSE
    RAISE NOTICE '기존 정책 %개 제거 완료', v_count;
  END IF;
END $$;

-- 2) RLS 활성화 ---------------------------------------------------------------
-- 이미 켜져 있어도 오류가 아니다(멱등).
ALTER TABLE public.sales_scripts ENABLE ROW LEVEL SECURITY;

-- 3) 정책 3개 ------------------------------------------------------------------
-- 모두 TO authenticated 로 못박는다. anon 에게는 어떤 정책도 주지 않으므로
-- 비로그인 요청은 200 + 빈 배열이 된다(에러가 아니라 0행).
-- service_role 은 RLS 를 우회하므로 서버측 배치·스크립트는 영향 없다.

-- 3-1) 조회: 자기 tenant + 플랫폼 공용 스크립트
--   getSalesScripts 의 .or(tenant_id.eq.<나>, tenant_id.eq.00000000-…) 와 정확히 같은 범위.
--   플랫폼 tenant 를 리터럴로 박는 것은 이 코드베이스의 기존 관행을 따른 것이다
--   (is_admin() 본문에도 같은 리터럴이 있다 — 20260807120007). 상수 일원화는
--   doc/improvement-suggestions.md I-16 의 별도 과제로 둔다.
--   get_my_tenant_id() 가 NULL 을 돌려주는 계정(tenant 미배정 관리자)에서는
--   첫 조건이 NULL 이 되지만 두 번째 조건이 살아 있어 플랫폼 공용 스크립트는 보인다.
CREATE POLICY sales_scripts_select ON public.sales_scripts
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    OR tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
  );

-- 3-2) 생성: 자기 tenant 로만. 플랫폼 공용 스크립트는 여기서 못 만든다
--   (플랫폼 tenant 계정으로 로그인하면 get_my_tenant_id() 가 그 값이므로 통과한다).
CREATE POLICY sales_scripts_insert ON public.sales_scripts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- 3-3) 수정: 자기 tenant 행만. WITH CHECK 를 같이 걸어 수정 도중 다른 tenant 로
--   소유권을 넘기는 것도 막는다. 소프트 삭제(deleted_at) 도 이 정책으로 덮인다.
CREATE POLICY sales_scripts_update ON public.sales_scripts
  FOR UPDATE TO authenticated
  USING      (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

COMMENT ON TABLE public.sales_scripts IS
  '영업 스크립트(전화/문자/방문). tenant 별 사유 데이터 + 플랫폼 공용(00000000-…) 기본 제공분. RLS 로 tenant 스코핑됨';

-- 4) 적용 후 확인 --------------------------------------------------------------
-- (a) 정책이 3개 붙었는지
--   SELECT policyname, cmd, roles, qual, with_check
--     FROM pg_policies WHERE tablename = 'sales_scripts' ORDER BY policyname;
--
-- (b) RLS 가 실제로 켜졌는지
--   SELECT relrowsecurity, relforcerowsecurity
--     FROM pg_class WHERE oid = 'public.sales_scripts'::regclass;
--
-- (c) 비로그인 차단 확인 — anon key 로 호출해 빈 배열이 나와야 한다
--   curl -H "apikey: <ANON_KEY>" \
--     "<SUPABASE_URL>/rest/v1/sales_scripts?select=tenant_id,type,title"
--   기대: HTTP 200, []
--
-- (d) 로그인 사용자는 자기 것 + 플랫폼 공용만 — 타 tenant 행이 섞이면 안 된다
--   (supplier 세션 JWT 로 같은 요청 → 자기 tenant 행 + 00000000-… 행만)
