# COMMERCE-002 관리자OS Listing 관리 화면

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |
| **차단 사유** | 해당 없음 |

## 작업 목적

플랫폼 관리자가 `commerce_product_listings`를 코드 배포 없이 관리하고, `COMMERCE-FLOW.md` 전이·`is_visible` 파생·`admin_logs`·중복 방지를 앱 레이어에서 강제한다.

## 관련 `tasks.md` ID

`COMMERCE-002`, `COMMERCE-004`(상품관리 메뉴 선반영), OPS.

## 수정 파일 목록

- `src/actions/admin/commerce.ts` (신규)
- `src/app/(admin)/admin/commerce/products/page.tsx` (신규)
- `src/app/(admin)/admin/commerce/products/loading.tsx` (신규)
- `src/components/commerce/ListingsClient.tsx` (신규)
- `src/components/layout/AdminSidebar.tsx`
- `docs/tasks.md`

## 변경 내용 요약

- Server Actions: `getListings`, `updateListingStatus`(허용 전이만, `is_visible` 동기화), `updateListingPrice`(정수·양수, before/after 로그), `createListing`(platform·draft·중복 차단), `getProducts`(미등록 상품만).
- `admin_logs`: `listing_status_changed`, `listing_price_changed`, `listing_created` — `action_type`·`new_value`에 요청 스펙 필드 포함.
- UI: 상태 필터 탭, 테이블, 상태별 액션, 가격 변경(prompt), 상품 등록 모달(검색·선택·가격).
- 사이드바에 상품관리(`/admin/commerce/products`) 추가.

## migration 여부

없음 (기존 `COMMERCE-001` 스키마 사용).

## 테스트 결과

- `npx tsc --noEmit` — pass
- 수동 E2E·운영 DB 연동은 별도

## 남은 위험

- PostgREST `products(...)` embed 이름이 환경에 따라 다르면 목록 조회 오류 가능 → 실패 시 FK 힌트 조정 필요.
- `admin_logs` 구 스키마(`admin_tenant_id` NOT NULL 등)와 앱 insert 불일치 시 로그 insert 실패 가능.

## 다음 권장 작업

`COMMERCE-003` 주문 콘솔 및 `COMMERCE-004` 잔여(주문처리 사이드바 링크).
