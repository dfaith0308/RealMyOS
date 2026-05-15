| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

`/admin/commerce/products` 상품 등록 모달에서 상품명 검색 시 결과가 보이지 않던 현상을 제거한다. 원인은 `getProducts`가 플랫폼 listing이 있는 상품을 결과에서 통째로 제외해, 검색어와 일치하는 행이 전부 “이미 등록됨”인 경우 목록이 빈 것처럼 보이는 경우가 많았기 때문이다.

## 관련 `tasks.md` ID

`COMMERCE-002`

## 수정 파일 목록

- `src/actions/admin/commerce.ts` — `ProductPickRow.already_listed`, `getProducts` 반환·정렬·검색 시 limit
- `src/components/commerce/ListingsClient.tsx` — 모달 로딩/빈 상태, `already_listed` UI·선택 방지, 안내 문구

## 변경 내용 요약

- 검색 결과에 **이미 플랫폼 listing이 있는 상품도 포함**하고 `already_listed`로 표시; 등록 가능한 상품을 위로 정렬.
- `products` 쿼리에서 `ilike` → `order` → `limit` 순으로 정리; 검색 시 limit 2000.
- 모달 오픈 시 목록 초기화·로딩, debounce 구간 로딩, 빈 결과 안내 문구, `.catch` 처리.

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` — pass (실행 시점 기준)

## 남은 위험

- `products` RLS가 관리자에게 전체 테넌트 행을 주지 않으면 여전히 0건일 수 있음(별도 DB 정책 확인 필요).

## 다음 권장 작업

- 운영 DB에서 관리자 `is_admin()` 기준 `products` SELECT 정책이 기대와 일치하는지 점검.
