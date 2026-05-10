| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

관리자OS 상품 등록 화면을 **카테고리 우선** 순서로 재배치하고, 소분류는 **단일 `getAdminCategories()` 트리를 클라이언트에서 `parent_id`로 필터**해 표시하며, **상세 설명·절감액·미리보기**를 보강한다.

## 관련 `tasks.md` ID

- `COMMERCE-002`

## 수정 파일 목록

- `src/components/commerce/ListingNewClient.tsx`
- `src/components/commerce/listing-new-client.module.css`
- `src/actions/admin/commerce.ts` (`createListingFull`에 listing `description` 인자·저장 연결)
- `docs/tasks.md`
- `docs/worklogs/2026-05-09_design_admin-commerce-listing-new-structure.md` (본 파일)

## 변경 내용 요약

- 섹션 순서: 카테고리 → 기본 정보 → 이미지 → 가격 → 배송 → 상세 설명(운영 메모 포함 카드) → 공개 설정.
- `getCategories`/`getSubCategories` 제거, `getAdminCategories` 평탄화 후 활성 대분류·`parent_id` 일치 활성 소분류만 표시. 소분류 선택은 선택 사항.
- 가격 카드에 판매가·정상가 모두 유효할 때만 클라이언트 **절감액** 표시.
- 미리보기 카드 하단에 **상세 설명 미리보기**(최대 5줄, 없으면 placeholder bar).
- 공개 설정 카드에 **TODO** 주석(추가 listing 상태는 후속 작업).
- `commerce_product_listings.description`은 마이그레이션상 존재하나 `createListingFull`이 항상 `null`이었음 → **동일 컬럼에 폼 값 전달**만 추가(새 컬럼·새 액션 없음). 요청의「저장 로직 수정 금지」와 충돌 시 UI만으로는 설명이 저장되지 않음.

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` (realmyos) — pass
- 브라우저 수동 테스트 미실행

## 남은 위험

- `getAdminCategories`는 카테고리 행에 `description` 필드가 없음(카테고리 스키마상 정상). Listing 설명은 `createListingFull.description`으로 저장.

## 다음 권장 작업

- `/buy` 상세와 동일한 타이포·줄수로 미리보기 정합.
