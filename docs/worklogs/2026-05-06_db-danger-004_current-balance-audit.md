# DB-DANGER-004 — customer_stats.current_balance 의존성·UI 감사 (문서화만)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`customer_stats.current_balance`(RPC delta 저장, RULE-02 이슈)에 대해 **저장소 코드 기준** 읽기·쓰기·UI 의존성을 정리하고, **즉시 수정 없이** `tasks.md`에 이행 방향만 남긴다.

## 관련 tasks.md ID

- `DB-DANGER-004`

## 수정 파일 목록

- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-06_db-danger-004_current-balance-audit.md` (본 파일)

*(앱 코드·DB·migration 변경 없음.)*

## current_balance 읽기 경로 전수 (TS 필드명 기준)

| 경로 | DB `customer_stats.current_balance` 사용 여부 | 실제 값 소스 | UI·소비 |
|------|-----------------------------------------------|-------------|---------|
| `ledger.getCustomerLedger` → `summary.current_balance` | 미사용 | `getAccountsReceivable` | `customers/[id]/ledger/page.tsx` 요약 금액 |
| `ledger.getCustomersWithBalance` → `current_balance` (= `receivable_amount`) | 미사용 | 주문·수금·opening 집계 | `getCustomersWithScore`·`/customers` 등 |
| `ledger.getCustomersWithScore` | 미사용 | 상동 | `calcAction` 입력, 대시보드·거래처 목록 |
| `order-query.getOrderList` → `OrderListItem.current_balance` | 미사용 | `getCustomersWithBalance` 맵 | `OrdersClient` 행 잔액 |
| `dashboard.getTodayCollections` → `CollectionTarget.current_balance` | 미사용 | `getAccountsReceivable` | 대시보드 “오늘 수금할 거래처” |
| `ledger.getCustomersWithStats` | **SELECT에 컬럼 포함** | **JS에서 컬럼 값 미사용**; 출력 `current_balance`는 집계 | **`src` 내 호출부 없음** (UI 미연결) |

*참고: `fund.ts`의 `accounts.current_balance`는 **별 테이블(계좌)** — 본 감사 대상 아님.*

## UI 미사용 확인 근거

- 화면에 노출되는 “미수/잔액”은 **주문·수금·opening 기반 `getAccountsReceivable` 계열**로 계산된 **`current_balance` 필드**를 쓰며, **`customer_stats` 행의 `current_balance` 컬럼을 읽어 표시하는 코드 경로는 없음** (저장소 기준).
- 유일하게 해당 컬럼을 조회하는 `getCustomersWithStats`는 **컬럼 값을 결과에 반영하지 않으며**, **다른 파일에서 호출되지 않음**.

## RULE-02 위반 유지 이유

- 운영에서 **`update_customer_stats` 등으로 컬럼에 delta 누적 저장**하는 패턴이 **forensic·tasks 기준으로 확정**된 바 있음.
- 앱 UI가 그 컬럼을 안 읽더라도, **DB에 “잔액 유사” 파생이 별도 저장**되면 **단일 원장 소스 원칙(RULE-02)과의 긴장**은 남음 → 항목은 **구조위험으로 유지**, **즉시 DROP·대규모 수정은 하지 않음** (승인된 범위).

## 장기 이행 방향

- **원장 단일 소스**로 수렴할 때 `customer_stats.current_balance`를 **deprecated / cache 전용**으로 명시.
- RPC·delta **쓰기 경로**를 집계·원장과 정합되게 줄이거나 제거한 뒤, 의존성·감사 가능 시점에 **컬럼 제거** (즉시 삭제 금지).

## migration 여부

- 없음.

## 테스트 결과

- 미실행 — 문서만 갱신.

## 남은 위험

- `create_payment_atomic` RPC **내부**가 `customer_stats`를 갱신하는지는 **본 저장소에 함수 본문 없음** — 운영 DDL·대시보드 대조 시 후속 확인.

## 다음 권장 작업

- Phase 2·`SUP-PARTIAL-004` 등과 맞춰 RPC·원장 설계 합의 후 migration·코드 단계적 정리.
