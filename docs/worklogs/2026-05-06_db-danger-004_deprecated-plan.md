# Phase 2 — DB-DANGER-004 deprecated 주석 + 제거 단계 합의

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`customer_stats.current_balance`가 RPC에서 delta 누적으로 갱신되는 **캐시성 컬럼**이며 RULE-02(원장 단일 소스) 위반이라는 사실을 코드에 “deprecated”로 명시하고, 즉시 DROP 없이 단계적으로 제거하는 계획을 Phase 2 산출물로 고정한다.

## 관련 tasks.md ID

- DB-DANGER-004

## 수정 파일 목록

- `realmyos/src/actions/order.ts`
- `docs/tasks.md`
- `docs/worklogs/2026-05-06_db-danger-004_deprecated-plan.md`

## deprecated 주석 추가 위치

- `realmyos/src/actions/order.ts`
  - `update_customer_stats` RPC 호출부 바로 위에 NOTE 주석 추가
  - **로직 변경 없음** (주석만)

## 단계 계획 (확정)

- **Phase 2**: deprecated 주석 추가 (이번 작업)
- **Phase 3~4**: `update_customer_stats` 제거 방향 결정 (RPC/쓰기 경로 축소 또는 제거)
- **Phase 6**: `customer_stats.current_balance` 컬럼 자체 제거 (별도 DB 승인 작업)

## 제거 전제 조건

- UI/집계의 미수 표시는 `getAccountsReceivable` 등 **원장/집계 단일 소스** 기준을 유지한다.
- `customer_stats.current_balance` 컬럼 값에 의존하는 경로가 없음을 재확인(또는 제거/대체)한 뒤에만 RPC/컬럼 제거를 진행한다.

## migration 여부

- 없음

## 테스트 결과

- 에디터 진단: linter 오류 없음 (주석/문서 변경만)

## 남은 위험

- 운영에서 RPC가 외부/배치에 의해 호출될 수 있어, 코드에서의 의존 제거만으로는 즉시 위반이 해소되지 않을 수 있다.

## 다음 권장 작업

- Phase 3~4에서 RPC/쓰기 경로(주문 취소 외) 존재 여부를 재점검하고, 제거/대체 기준을 문서로 확정한다.

