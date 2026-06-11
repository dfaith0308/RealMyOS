# 거래처 combobox 키보드 네비게이션 (↑↓ Enter Esc)

| 항목 | 내용 |
|------|------|
| **상태** | 완료 |
| **완료일** | 2026-06-11 |
| **브랜치** | `dev` |

## 작업 목적

거래처 검색 combobox 4곳에 방향키·Enter·Escape 키보드 선택을 추가해 현장 입력 속도를 높인다.

## 관련 `tasks.md` ID

- `SUP-TODO-004` — `/ledger` 거래처 선택 UX
- 문서 사용법 — 거래처 검색 combobox 키보드 접근성

## 수정 파일 목록

- `src/components/ledger/LedgerHubClient.tsx`
- `src/components/ledger/LedgerHubClient.module.css`
- `src/components/order/OrderCreateForm.tsx`
- `src/components/payment/PaymentCreateForm.tsx`
- `src/app/(app)/orders/quotes/QuoteCreateClient.tsx`
- `docs/tasks.md`, 본 worklog

## 변경 내용 요약

- `activeIndex`(-1 초기) + `handleKeyDown`: ArrowDown/Up, Enter(활성 항목만), Escape.
- 검색어 변경 시 `activeIndex` -1 리셋.
- 활성 항목 `var(--ds-neutral-100)` 하이라이트 (`dropdownItemActive` / `ddItemActive`).
- PaymentCreateForm: 기존 키보드 없음 → 신규 추가.

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` — **pass**
- 브라우저 키보드 수동 확인 — 미실행

## 남은 위험

- Enter 시 `activeIndex === -1`이면 선택 없음(의도). 첫 ↓ 누른 뒤 Enter 필요.

## 다음 권장 작업

- 목록 필터 select도 combobox+키보드 패턴 통일 검토.
