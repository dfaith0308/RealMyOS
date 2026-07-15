-- 거래명세서: 도장·입금계좌 (tenants)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS stamp_image_url text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_holder text;

-- 도장 이미지 업로드용 공개 버킷 (업로드는 서버 액션 service role)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-assets',
  'tenant-assets',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "tenant_assets_select_public" ON storage.objects;
CREATE POLICY "tenant_assets_select_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'tenant-assets');
