# Customers — 태그 시스템 연결(/new + 상세 UI 정상화)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-28 |
| **차단 사유** | 해당 없음 |

## 작업 목적

거래처 태그(`customer_tags`/`customer_tag_options`)를 기존 구조 그대로 재사용하면서, 상세 화면의 태그 섹션 UI를 현재 디자인 시스템에 맞추고, 거래처 등록 단계(`/customers/new`)에서 운영 태그를 선택해 저장할 수 있게 연결한다.

## 관련 tasks.md ID

- 없음 (OPS — AI worklog 이력으로만 기록)

## 수정 파일 목록

- `src/components/customer/CustomerTagsSectionClient.tsx`
- `src/components/customer/CustomerTagsSectionClient.module.css`
- `src/components/customer/CustomerCreateForm.tsx`
- `src/components/customer/CustomerCreateForm.module.css`
- `src/app/(app)/customers/new/page.tsx`
- `src/actions/customer-tag-options.ts`
- `docs/tasks.md`
- `docs/worklogs/2026-05-28_feat_customer-tags-connect.md`

## 변경 내용 요약

- `CustomerTagsSectionClient`에서 `Surface`/`DataTableRow`/`DataCell` 의존을 제거하고, 카드형 섹션 UI로 JSX를 교체(로직/state/toggle 흐름 유지).
- 태그 섹션 CSS에서 `color-mix()`를 제거하고 `var(--ds-*)`, `var(--color-*)` 토큰 기반 스타일로 전체 교체.
- `/customers/new`에서 `getTagOptions()`를 prefetch하여 `CustomerCreateForm`에 전달.
- 등록 폼에서 태그 선택 상태(`category -> value`)를 관리하고, 거래처 생성 성공 후 `upsertCustomerTag`로 선택 태그를 순차 저장(저장 실패 시에도 등록 자체는 완료되는 정책 유지).
- `customer-tag-options`의 `DEFAULT_SEED` 중 **업종** 옵션만 보강(시드 함수 로직은 변경하지 않음).

## migration 여부

- 없음 (DB 구조 변경 없음)

## 테스트 결과

- `npx tsc --noEmit` — pass
- `npm run build` — pass

## 남은 위험

- 태그 저장은 등록 성공 후 “추가 단계”로 수행되므로, 태그 저장 실패 시 거래처는 생성되지만 태그는 누락될 수 있음(의도된 운영 우선 정책).

## 다음 권장 작업

- `/customers` 운영 목록에서 태그 기반 필터/정렬이 필요하면, 현재 선택 가능한 카테고리(특히 ‘업종’)를 운영 정책에 맞게 고정/정리.
- 태그 저장 실패를 사용자에게 더 명확히 알리고 싶으면(예: banner), “등록은 성공/태그만 실패” 메시지 UX를 별 작업으로 정의.

