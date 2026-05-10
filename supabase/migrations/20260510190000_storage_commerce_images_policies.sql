-- commerce-images Storage RLS 정책
-- 운영 DB 적용 전/후: 배포 절차에 따라 실행
--
-- [저장소 기준 현황]
-- realmyos/supabase/migrations/ 내 기존 파일에 storage.objects 정책이 없었음.
-- 즉, 버전관리상 "이전 policy 목록" = 없음.
--
-- [RLS 오류 원인]
-- Supabase Storage는 bucket RLS가 켜져 있으면 storage.objects에 대한 허용 정책이 없을 때
-- INSERT가 거부되며, DB와 동일하게 "new row violates row-level security policy"가 반환됨.
-- 앱은 anon key + 로그인 세션(authenticated JWT)으로 업로드하므로,
-- authenticated 역할에 대한 INSERT(및 공개 읽기용 SELECT)가 필요함.
--
-- [정책 요약]
-- SELECT: public — 공개 bucket URL(getPublicUrl)로 쇼핑몰에서 이미지 표시
-- INSERT: authenticated + is_admin() — 관리자만 업로드

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'commerce-images',
  'commerce-images',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "commerce_images_select_public" ON storage.objects;
DROP POLICY IF EXISTS "commerce_images_insert_admin" ON storage.objects;

CREATE POLICY "commerce_images_select_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'commerce-images');

CREATE POLICY "commerce_images_insert_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'commerce-images'
    AND is_admin()
  );
