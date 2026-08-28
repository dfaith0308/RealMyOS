-- 영업 리드 관리 (관리자 전용) — 2026-08-28
-- 공급자/식당 잠재거래처 발굴 활동을 엑셀 대신 관리자 화면에서 관리한다.
-- tenant_id와 무관한 플랫폼 운영 데이터이므로 RLS는 is_admin() 기준으로만 연다.

CREATE TABLE IF NOT EXISTS public.sales_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_type text NOT NULL CHECK (lead_type IN ('supplier', 'restaurant')),
  company_name text NOT NULL,
  phone text,
  address text,
  -- 주소에서 파싱한 지역 (외부 API 없이 시/도 · 구/군 문자열 추출)
  region_sido text,
  region_sigungu text,
  -- 다중 선택: 방문/전화/문자/카톡/이메일
  contact_methods text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'interested', 'meeting', 'joined', 'hold', 'rejected')),
  interest_level smallint NOT NULL DEFAULT 1 CHECK (interest_level BETWEEN 1 AND 3),
  naver_place_url text,
  -- 가입 후 수동 연결
  linked_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  body text NOT NULL,
  -- 사전 정의 없이 자유 입력
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 목록 필터링(유형·상태·지역·관심도)과 타임라인 조회 경로
CREATE INDEX IF NOT EXISTS idx_sales_leads_type_created
  ON public.sales_leads(lead_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_leads_status
  ON public.sales_leads(status);
CREATE INDEX IF NOT EXISTS idx_sales_leads_region
  ON public.sales_leads(region_sido, region_sigungu);
CREATE INDEX IF NOT EXISTS idx_sales_leads_linked_tenant
  ON public.sales_leads(linked_tenant_id) WHERE linked_tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_lead_notes_lead
  ON public.sales_lead_notes(lead_id, created_at DESC);
-- 태그 필터는 배열 포함 검색이므로 GIN
CREATE INDEX IF NOT EXISTS idx_sales_lead_notes_tags
  ON public.sales_lead_notes USING GIN (tags);

ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_leads_admin_all ON public.sales_leads;
CREATE POLICY sales_leads_admin_all ON public.sales_leads
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS sales_lead_notes_admin_all ON public.sales_lead_notes;
CREATE POLICY sales_lead_notes_admin_all ON public.sales_lead_notes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.sales_leads IS '영업 리드(공급자/식당 잠재거래처) — 관리자 전용, tenant 무관';
COMMENT ON COLUMN public.sales_leads.region_sido IS '주소 문자열 파싱 결과 (시/도). 외부 API 미사용';
COMMENT ON COLUMN public.sales_leads.region_sigungu IS '주소 문자열 파싱 결과 (시/군/구). 외부 API 미사용';
COMMENT ON COLUMN public.sales_leads.linked_tenant_id IS '리드가 실제 가입한 뒤 관리자가 수동 연결';
