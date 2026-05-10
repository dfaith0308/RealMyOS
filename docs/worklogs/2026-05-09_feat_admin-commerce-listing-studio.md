| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

관리자OS 쇼핑몰 상품 등록을 **제작 스튜디오** 관점으로 재구성한다. 운영자는 DB 이중 구조를 인지하지 않도록 카피를 정리하고, 가격·마진·배송·상세 페이지(이미지·본문)를 한 흐름에서 다루며 미리보기 탭으로 카드/상세를 분리한다.

## 관련 `tasks.md` ID

- `COMMERCE-002`

## 수정 파일 목록

- `src/components/commerce/ListingNewClient.tsx`
- `src/components/commerce/listing-new-client.module.css`
- `src/actions/admin/commerce.ts` (`createListingFull`에 `image_urls` 저장)
- `src/app/(admin)/admin/commerce/products/new/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-09_feat_admin-commerce-listing-studio.md` (본 파일)

## 변경 내용 요약

- 섹션 순서: 카테고리 → 기본 정보 → 가격·마진(`calcMarginRate`, `ProductCreateForm`식 마진율 모드) → 배송 정책(UI 전용 배송비·무료기준·묶음 + TODO 주석) → 상품 페이지 제작(대표 이미지·상세 이미지 카드 최대 5·상세 설명·내부 메모) → 공개 설정.
- 우측 미리보기: **카드 / 상세페이지** 탭, 배송 배지 다중 표시, 상세 탭에서 `image_urls`·본문 미리보기.
- `createListingFull`에 `image_urls` 배열 전달·INSERT(최대 5개 URL 정규화). 검증·상태 전이·기존 필드 규칙 유지.
- `createEmptyListingStudioForm` / `ListingStudioFormState` export로 향후 복제 기능과 상태 초기화 재사용 용이.
- 페이지 서브타이틀에서 기술적 DB 용어 제거.

## migration 여부

없음 (기존 `image_urls` 컬럼 사용)

## 테스트 결과

- `npx tsc --noEmit` (realmyos) — pass
- 브라우저 E2E 미실행

## 남은 위험

- 배송비·무료기준·묶음배송은 미리보기·TODO만 있고 저장되지 않음(의도).

## 다음 권장 작업

- 스키마 확정 시 `shipping_fee` 등 컬럼과 TODO 연결.
