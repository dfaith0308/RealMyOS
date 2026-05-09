| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

식당OS `/buy` 운영형 쇼핑몰 UX를 보강하고, 상품명 embed·담기 라벨·푸터 플레이스홀더 등 버그를 정리한다. 공개 listing 과 연결된 `products` 행을 식당 사용자가 읽을 수 있도록 realmyos 쪽 RLS 보강 및 커머스 mock listing 시드 SQL을 추가한다.

## 관련 `tasks.md` ID

`COMMERCE-005`, `COMMERCE-001`(RLS 연계)

## 수정 파일 목록

**resturant_os**

- `src/actions/buy.ts` — `normalizeProductName` 보강, assertListingBuyable 폴백 문자
- `src/app/(app)/buy/page.tsx` — 카테고리 칩·검색+`cat` 유지·장바구니 블록 스타일·다시 사기 안내·카드 설명 한 줄
- `src/app/(app)/buy/products/[id]/page.tsx` — 제목 폴백
- `src/components/buy/CartAddButton.tsx` — `닫기` 오표시 방지, 기본 `담기`
- `src/components/buy/BuyCartClient.tsx`, `BuyCheckoutClient.tsx` — 이름 폴백
- `src/components/layout/LegalFooter.tsx` — 운영자 정보 확정, TODO 제거
- `src/lib/buy-category-chips.ts` — 신규(칩 정의·slug→categoryId, 미매핑 시 필터 생략)

**realmyos**

- `supabase/migrations/20260510100000_products_select_visible_listing.sql` — `products` RLS 시 listing 가시 SELECT 정책(테이블에 RLS가 켜진 경우만)
- `supabase/seeds/commerce_mock_listings.sql` — 플랫폼 listing mock INSERT
- `docs/tasks.md`, 본 worklog

## 변경 내용 요약

- 카테고리 칩: 정적 라벨·URL `?cat=`·`categoryId` 가 있을 때만 `getListings` 필터; 없으면 전체 목록과 동일 동작.
- 장바구니 요약: 헤더 직후 `#f8f8f8` 블록·`장바구니 보기 →`.
- 카드: `description` 한 줄(없으면 미표시); 상품명은 join 결과·없으면 `—`.
- LegalFooter: 디닷페이스 / 김정무 / 연락처 / 이메일.

## migration 여부

- **파일 추가**: `20260510100000_products_select_visible_listing.sql` — 운영 적용 여부는 배포 시 확인
- **seed**: `supabase/seeds/commerce_mock_listings.sql` — 수동 실행

## 테스트 결과

- `resturant_os`: `npx tsc --noEmit` pass

## 남은 위험

- `products` 테이블에 RLS가 없으면 migration 블록은 정책을 만들지 않음 — 그 경우 embed 이름은 여전히 비울 수 있음.
- mock seed 는 `products.id::text LIKE prefix||'%'` 매칭; 접두 충돌 시 중복 행 가능(주석 참고).

## 다음 권장 작업

- `buy-category-chips.ts` 에 실제 `product_categories.id` 를 채워 칩 필터를 활성화.
- 운영 DB 에 mock seed 실행 전 `products` 존재·접두 일치 여부 확인.
