| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-10 |

## 작업 목적

관리자 상품 등록을 모달에서 전용 페이지로 옮겨 입력·미리보기·저장 분기(임시/공개/연속 등록)를 명확히 하고, 플랫폼 전용 `products` + `commerce_product_listings` 생성을 한 번에 처리한다.

## 관련 `tasks.md` ID

- `COMMERCE-001` — `20260510140000_add_listing_admin_memo.sql`
- `COMMERCE-002` — Listing 관리·등록 UX

## 수정 파일 목록

- `supabase/migrations/20260510140000_add_listing_admin_memo.sql`
- `src/actions/admin/commerce.ts`
- `src/app/(admin)/admin/commerce/products/new/page.tsx`
- `src/components/commerce/ListingNewClient.tsx`
- `src/components/commerce/ListingsClient.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-10_feat_admin-commerce-listing-new-page.md`

## 변경 내용 요약

- DDL(미적용): listing `admin_memo`, `spec`.
- 서버: `getSubCategories`, `uploadListingImage`(`commerce-images`), `createListingFull`(products insert는 `createProduct`와 동일 컬럼 집합·`product_costs` 최소 1원·`product_stats` upsert·listing `tenant_id` 플랫폼 고정).
- UI: `/admin/commerce/products/new` 2열 폼+미리보기, 목록 `+ 상품 등록` 링크, 모달 제거.

## migration 여부

파일 추가(미적용) — `20260510140000_add_listing_admin_memo.sql`

## 테스트 결과

- `npx tsc --noEmit`, `npm run build`: pass

## 남은 위험

- Storage `commerce-images` 버킷·공개 URL 정책 미구성 시 업로드 실패(메시지로 안내).
- migration 미적용 시 `spec`/`admin_memo` insert 오류 가능.

## 다음 권장 작업

- 운영 DB migration 적용·버킷 생성·RLS 점검.
