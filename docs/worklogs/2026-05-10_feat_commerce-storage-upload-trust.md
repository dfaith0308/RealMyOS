# commerce-images Storage 정책 + 업로드 신뢰성 UX

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-10 |

## 작업 목적

관리자 썸네일·상세 이미지 업로드 시 RLS로 막히는 문제를 Storage 정책으로 해소하고, 운영자가 업로드 성공/실패·저장 URL을 명확히 알 수 있게 한다.

## 관련 `tasks.md` ID

- `COMMERCE-002`

## 수정 파일 목록

- `supabase/migrations/20260510190000_storage_commerce_images_policies.sql`
- `src/actions/admin/commerce.ts`
- `src/components/commerce/ListingNewClient.tsx`
- `src/components/commerce/listing-new-client.module.css`
- `docs/tasks.md`
- `docs/worklogs/2026-05-10_feat_commerce-storage-upload-trust.md`

## 변경 내용 요약

- Storage: `commerce-images` bucket 시드(없을 때만)·`SELECT public`·`INSERT authenticated + is_admin()`.
- 서버: `uploadListingImage` 오류 메시지 `mapListingUploadError` 정규화.
- 클라이언트: 썸네일/상세 블록별 업로드 단계 UI, 저장 URL·파일명 표시, 공개 저장 시 썸네일 없으면 경고(저장은 허용).

## migration 여부

- **파일 추가** — `20260510190000_storage_commerce_images_policies.sql` (운영 적용은 배포 절차)

## 테스트 결과

- `npx tsc --noEmit` — pass

## 남은 위험

- `is_admin()` 정의·JWT 클레임이 운영 DB와 다르면 INSERT 정책이 여전히 실패할 수 있음.
- bucket이 이미 수동 생성된 환경에서는 `ON CONFLICT DO NOTHING`으로 file_size_limit 등이 갱신되지 않을 수 있음.

## 다음 권장 작업

- 운영 Supabase에 migration 적용 후 관리자 계정으로 업로드 스모크 테스트.
