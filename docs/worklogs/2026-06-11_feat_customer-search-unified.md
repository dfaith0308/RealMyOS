# 거래처 검색 통일 (상호명·대표자명·연락처)

| 항목 | 내용 |
|------|------|
| **상태** | 완료 |
| **완료일** | 2026-06-11 |
| **브랜치** | `dev` |

## 작업 목적

공급자OS 거래처 선택 UI에서 검색 기준을 **상호명(`name`) + 대표자명(`representative_name`) + 연락처(`phone`)** 로 통일하고, `/ledger` 허브의 native `<select>`를 검색형 combobox로 교체한다.

## 관련 `tasks.md` ID

- `SUP-TODO-004` — 원장 진입·거래처 선택 UX
- `SUP-PARTIAL-001` — 운영 화면 링크·선택 정합
- 문서 사용법(로드맵) — 거래처 검색 IA 통일

## 수정 파일 목록

- `src/actions/ledger.ts` — `getLedgerCustomers` 필드 확장
- `src/actions/order.ts` — `getCustomersForOrder` 필드 확장
- `src/types/order.ts` — `CustomerForOrder` 타입 확장
- `src/components/ledger/LedgerHubClient.tsx` — combobox 교체
- `src/components/ledger/LedgerHubClient.module.css` — 신규
- `src/components/order/OrderCreateForm.tsx` — 검색·드롭다운 표시
- `src/components/payment/PaymentCreateForm.tsx` — 검색·드롭다운 표시
- `src/app/(app)/orders/quotes/QuoteCreateClient.tsx` — 검색·드롭다운 표시
- `docs/tasks.md`, 본 worklog

## 변경 내용 요약

- 서버 액션 select에 `phone`, `representative_name` 추가 (DB 스키마 변경 없음).
- 클라이언트 필터: 이름 lowercase includes, 전화번호 하이픈 제거 후 includes, 대표자명 lowercase includes.
- `/ledger` 매출원장: CSS Module combobox, 최대 8건 드롭다운, 선택 시 `/customers/[id]/ledger` 이동.
- 주문·수금·견적 등록 폼: 동일 필터 로직 + 드롭다운에 대표자명·연락처 서브라인 표시.

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` — **pass**
- `npm run build` — **pass**
- 브라우저 수동 검색(상호/대표자/연락처 4자리) — 미실행

## 남은 위험

- `/customers/all`, `CustomersOpsListClient`, 주문·수금 **목록** 필터 `<select>`는 이번 범위 밖 — 여전히 이름만 표시·이름만 검색(또는 select 전체).
- 거래처 1000건+ 시 `/ledger`는 클라이언트 필터이므로 초기 로드·메모리 부담은 기존과 동일.

## 다음 권장 작업

- 목록 필터(`OrdersClient`, `PaymentsClient`)도 combobox 패턴으로 통일 검토.
- 공통 `matchCustomerQuery()` 유틸 추출로 중복 제거(chore).
