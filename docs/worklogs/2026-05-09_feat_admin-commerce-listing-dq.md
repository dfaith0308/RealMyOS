| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

관리자OS 상품 등록 흐름에서 `commerce_product_listings` 전용 운영 필드(브랜드, 플랫폼 카테고리, 정상가, 배송 유형)를 수집·검증해 미분류·잘못된 절감액 표기를 줄인다. `products` 원본은 변경하지 않는다.

## 관련 `tasks.md` ID

- `COMMERCE-001` — migration 파일 추가(미적용)
- `COMMERCE-002` — Listing 관리·등록 UI/액션 확장

## 수정 파일 목록

- `supabase/migrations/20260510120000_add_listing_brand_shipping.sql`
- `src/actions/admin/commerce.ts`
- `src/components/commerce/ListingsClient.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-09_feat_admin-commerce-listing-dq.md`

## 변경 내용 요약

- DDL: `commerce_product_listings`에 `brand_name`, `shipping_type`(CHECK, 기본 `free`), `category_id`(FK `product_categories`) 추가(저장소만).
- 서버: `getCategories()`(플랫폼 테넌트·`parent_id IS NULL`), `createListing`에 필수 `category_id`, 정상가는 판매가 초과 시만 저장, `getListings` select 확장.
- UI: 등록 모달 필드·배송 뱃지 색 규칙, 목록 테이블 브랜드/배송/정상가, 성공 시 toast·폼 리셋·`router.refresh()`.

## migration 여부

파일 추가(미적용) — `20260510120000_add_listing_brand_shipping.sql` (로컬/원격 DB에 이 턴에서 실행하지 않음)

## 테스트 결과

- `npx tsc --noEmit` (realmyos 루트): **pass**
- E2E/수동 브라우저: 미실행

## 남은 위험

- migration 미적용 시 런타임 insert/select가 신규 컬럼을 요구하면 환경별 오류 가능. 배포 시 migration 순서·`product_categories.parent_id` 존재 여부 확인 필요.
- 소분류(2-depth) UI는 범위 외.

## 다음 권장 작업

- 운영/스테이징에 `20260510120000` 적용 후 관리자 등록·목록 smoke 테스트.
- 식당OS `/buy` 등 소비 경로에서 `shipping_type`·카테고리 노출 필요 시 별도 이슈.
