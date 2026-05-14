| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

상품 **edit**를 단기 CRUD로 붙이기 전에, `ListingNewClient`·`commerce` 액션·라우팅을 코드 기준으로 포렌식하고 **100+ SKU·운영 스트레스·storefront 안전성** 관점에서 장기 설계 방향을 정리한다.

## 관련 `tasks.md` ID

- `COMMERCE-002` (관리자 Listing 화면)

## 수정 파일 목록

- `docs/tasks.md` — 작업 이력
- `docs/worklogs/2026-05-14_docs_listing-ops-forensic-design.md` (본 파일)

## 변경 내용 요약

- 코드·migration 변경 없음. 조사 근거: `ListingNewClient.tsx`(라인 수·state·effect·submit·DEBUG), `commerce.ts`(`createListingFull`·`updateListingStatus`·`updateListingPrice`·`uploadListingImage`·`getListings`), `ListingsClient.tsx`, `products/new/page.tsx`, `products/` 라우트 glob.

## migration 여부

없음

## 테스트 결과

- 해당 없음(문서·조사만).

## 남은 위험

- 본 로그는 **조사 시점 스냅샷**이며, 이후 리팩터 시 줄 번호·함수 위치는 변할 수 있음.

## 다음 권장 작업

- 채택한 설계(A 권장)에 따라 `getListingForAdmin(id)` + `updateListingFull` 등 서버 계약을 먼저 고정한 뒤 edit 라우트 구현.
