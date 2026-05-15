| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

관리자가 플랫폼 커머스 Listing의 핵심 메타데이터를 **신규 등록 플로우와 분리된** 편집 화면에서 안전하게 수정할 수 있게 한다. 이미지·재고·상품코드는 범위 밖으로 두고, `updateListingStatus`와 동일한 스토어 노출 규칙을 따른다.

## 관련 `tasks.md` ID

`COMMERCE-008`

## 수정 파일 목록

- `src/actions/admin/commerce.ts` — `getListingForEdit`, `updateListingFull`, 타입 `ListingForEditData` / `UpdateListingFullInput`
- `src/app/(admin)/admin/commerce/products/[id]/edit/page.tsx` — 편집 페이지 (서버 조회·`ListingEditClient` 렌더)
- `src/components/commerce/ListingEditClient.tsx` — quick edit 클라이언트 폼 (dirty·beforeunload·toast·검증)
- `src/components/commerce/ListingsClient.tsx` — 행별 `수정` 링크
- `docs/tasks.md` — COMMERCE-008 등록·집계·작업 이력

## 변경 내용 요약

- `products.name`(목록·스토어와 동일) 및 `commerce_product_listings`의 지정 필드만 갱신한다. 카테고리는 listing의 `category_id`만 사용한다(`products.category_id`는 플랫폼 listing 카테고리에 미사용).
- 스토어 공개는 `status === 'visible'` & `is_visible === true`로 정의하고, 전이는 `ALLOWED_STATUS_TRANSITIONS`와 동일하게 적용한다. `listing_updated` 로그에 `before` / `after` / `changed_fields`를 `new_value`에 기록한다(`admin_tenant_id`는 `createListingFull`과 동일 패턴).

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` (realmyos) — 통과

## 남은 위험

- 비활성 묶음배송 그룹이 지정된 채로 남아 있으면, 그대로 저장 시 서버 검증에서 거절될 수 있어 UI에 비활성 그룹 옵션을 안내용으로 노출한다.
- Next App Router의 다른 내부 링크 이동은 `beforeunload`로 막지 못하며, 본 화면에서는 목록 링크·취소에 `confirm`으로 보완한다.

## 다음 권장 작업

- 이미지(썸네일·상세) 수정·정렬 전용 단계 또는 스튜디오 연동
- 편집 화면에서 상태 전이(품절·판매중단 등)를 목록과 동일 UX로 제공할지 정책 정리
