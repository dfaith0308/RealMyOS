# SUP-PARTIAL-007 console/TODO 정리 (RULE-13 준수)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

저장소 `rules.md` [RULE-13]에 따라, 프로덕션 코드에 남아 있는 `console.error/warn/log` 및 의미 없는 TODO 주석(또는 코드에 남아있는 미구현 안내)을 정리해 “성공/실패와 무관한 디버그 출력”을 제거한다.

## 관련 tasks.md ID

- SUP-PARTIAL-007

## 수정 파일 목록

- `realmyos/src/actions/order.ts`
- `realmyos/src/actions/dashboard.ts`
- `realmyos/src/actions/ledger.ts`
- `realmyos/src/app/(app)/orders/page.tsx`
- `realmyos/src/app/(app)/payments/page.tsx`
- `realmyos/src/components/order/OrderCreateForm.tsx`
- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-06_sup-partial-007_console-todo-cleanup.md`

## 변경 내용 요약

- 아래 파일들에서 `console.*`를 제거했다(로직 변경 없음).
  - `src/actions/order.ts`: ORDER-AMOUNT, SAVE-PRICE-ERR, LOAD-PRICE
  - `src/actions/dashboard.ts`: getTodayCollections 동명이인 제외 warn
  - `src/actions/ledger.ts`: getPendingCollectionMap error 및 PERF 로그, unexpected error 로그
  - `src/app/(app)/orders/page.tsx`: /orders PERF 로그
  - `src/app/(app)/payments/page.tsx`: /payments PERF 로그
  - `src/components/order/OrderCreateForm.tsx`: TAX/TOTAL mismatch 디버그 로그
- `order.ts`의 `buyer_tenant_id` 미입력 TODO 주석은 코드에서 제거하고, 요구사항/연동 전제는 `docs/tasks.md`의 `SUP-TODO-001`로 **문서 이관**했다.

## 제거 안전성 판단 근거

- 제거 대상 `console.*`는 모두 “관측/디버깅/성능 로그”로, 반환값/DB write/분기 조건에 사용되지 않았다.
- TODO는 로직을 대체하지 않고 “미구현/연동 전제” 설명이었으므로, 코드에서 제거하되 문서에 남겨 추적성은 유지했다.

## migration 여부

- 없음

## 테스트 결과

- 미실행 — 로그/주석 제거 작업이며 linter로 정적 확인만 수행했다.

## 남은 위험

- 운영 장애 분석 시 기존 로그 단서가 줄어들 수 있다. 필요 시 별도의 구조화 로깅/모니터링 도입을 검토한다.

## 다음 권장 작업

- `console.*` 대신 서버 로깅/모니터링을 도입할지(또는 개발 환경에서만 허용할지) RULE 수준에서 합의한다.

