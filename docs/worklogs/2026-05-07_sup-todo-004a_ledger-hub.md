# SUP-TODO-004-A — `/ledger` 원장관리 진입점 신설

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |

## 작업 목적

PRODUCT.md §6-10 「원장관리」의 매출원장·매입원장 2메뉴 구조에 맞춰 `/ledger` 진입점을 신설하고, 거래처/매입처 선택과 기간 필터를 제공한다. 매출원장 상세는 기존 `/customers/[id]/ledger`로 위임, 매입원장 상세는 `SUP-TODO-004-B`로 분리.

## 관련 `tasks.md` ID

- `SUP-TODO-004-A`

## 수정 파일 목록

- `src/actions/ledger.ts` — `getLedgerCustomers`, `getLedgerSuppliers` 추가
- `src/app/(app)/ledger/page.tsx` — 신규 서버 페이지(인증·셀렉트 데이터 fetch)
- `src/components/ledger/LedgerHubClient.tsx` — 탭/셀렉트/기간 필터/이동 처리
- `src/components/layout/Sidebar.tsx` — 원장관리 `href`를 `/ledger`로 교체
- `docs/tasks.md`
- 본 worklog

## 변경 내용 요약

- **데이터**: 매출원장 셀렉트는 `customers`(`tenant_id`·`is_buyer=true`·미삭제), 매입원장 셀렉트는 `purchases`(`tenant_id`)에서 `counterparty_name` distinct 후 정렬·중복 제거(앱 레이어).
- **UI**:
  - 탭 `kind=sales` / `kind=purchases` (URL 동기화).
  - 기간 필터 `from`/`to` URL 파라미터(기본: 이번달 1일 ~ 오늘).
  - 매출원장: 거래처 선택 시 `/customers/[id]/ledger`로 이동(기존 화면 재사용).
  - 매입원장: 매입처 선택 시 `/ledger?kind=purchases&supplier=…` 유지하며 “상세는 004-B” 안내 박스, 매입/지급 목록 바로가기.
- **Sidebar**: 원장관리 default `href`를 기존 `/sales/history`(자동화영업)에서 `/ledger`로 변경. 영업이력은 자동화영업 그룹 내 링크로 유지.

## migration 여부

없음.

## 테스트 결과

- `npx tsc --noEmit` — 통과 (realmyos).

## 남은 위험

- **매입원장 셀렉트가 `purchases.counterparty_name` 텍스트 distinct**: 동일 매입처가 다른 표기로 들어가면 분리 표시. SUP-TODO-003-B(상품 선택 → `default_supplier_id` 자동 채움) 적용 시 정합 자연 향상.
- 기간 필터는 매출원장에서 본 페이지에 적용되지 않고 거래처 원장으로 위임됨(기존 화면 변경 없음). 추후 `/customers/[id]/ledger`에 `from`/`to` 전달은 004-B 검토 가능.

## 다음 권장 작업

- `SUP-TODO-004-B` 원장 컬럼/세금/기초잔액/누적잔액(매입원장 상세 포함).
- `SUP-TODO-004-C` `/analytics` 매출분석 라우트.
