| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

`commerce_product_listings`에 추가된 **썸네일·갤러리 URL 배열·설명** 컬럼을 저장소 migration으로 남기고, 관리자OS 상품 등록/목록·식당OS `/buy`에서 노출한다.

## 관련 `tasks.md` ID

- `COMMERCE-001` (migration 소급)
- `COMMERCE-002` (관리자 Listing UI·`createListing`/`getListings`)
- `COMMERCE-005` (`resturant_os` 카드·상세)

## 수정 파일 목록

**realmyos**

- `supabase/migrations/20260509030000_add_commerce_listings_image.sql`
- `src/actions/admin/commerce.ts`
- `src/components/commerce/ListingsClient.tsx`
- `src/app/(admin)/admin/commerce/products/page.tsx`
- `docs/tasks.md`, 본 worklog

**resturant_os**

- `src/actions/buy.ts`
- `src/lib/buy-types.ts`
- `src/app/(app)/buy/page.tsx`
- `src/app/(app)/buy/products/[id]/page.tsx`

## 변경 내용 요약

- DB: `thumbnail_url`, `image_urls`, `description` (운영 적용 완료 주석과 동일 SQL 파일 추가).
- 관리자: 등록 모달에 썸네일 URL·설명 입력, 목록 테이블 첫 컬럼에 40×40 썸네일 또는 「이미지 없음」.
- 식당OS: 목록 카드에 썸네일 또는 회색 플레이스홀더, 상세에 큰 썸네일·설명(`pre-wrap`).

## migration 여부

파일 추가 — `20260509030000_add_commerce_listings_image.sql` (헤더: 운영 적용 완료 2026-05-09)

## 테스트 결과

- `npx tsc --noEmit` — realmyos, resturant_os
- `npm run build` — realmyos, resturant_os

## 남은 위험

- 외부 이미지 URL은 도메인·CORS·Mixed Content에 따라 깨질 수 있음. 필요 시 스토리지 업로드·`next/image` `remotePatterns` 검토.

## 다음 권장 작업

- 관리자에서 `image_urls` 다중 입력·상세 갤러리, `next/image` 도메인 허용 목록 정리.
