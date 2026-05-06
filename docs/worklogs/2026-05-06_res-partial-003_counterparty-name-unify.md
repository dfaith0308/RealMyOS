# RES-PARTIAL-003 payments 거래처명 컬럼 통일 (`counterparty_name`)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

같은 `payments` 테이블에 거래처명 컬럼을 `supplier_name`/`counterparty_name`로 혼용하는 문제를 제거해, 표시/집계/PRODUCT §9 모델 정합을 확보한다.

## 관련 tasks.md ID

- RES-PARTIAL-003

## 수정 파일 목록

- `realmyos/supabase/migrations/20260506150000_create_accept_bid_atomic.sql`
- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-06_res-partial-003_counterparty-name-unify.md`

## 변경 내용 요약

- **통일 방향 확정**: `payments.counterparty_name` 단일 사용.
- **앱 레이어(수동 추가)**: `resturant_os/src/actions/money.ts`의 `addManualPayment`는 이미 `counterparty_name`을 사용하고 있어 변경 없음(정합 ✅).
- **RFQ 확정(RPC)**: `accept_bid_and_create_order_atomic`의 `payments` INSERT에서 거래처명 컬럼을 `supplier_name` → `counterparty_name`으로 통일했다.

## migration 여부

- production 적용 완료(운영 DB) — `supabase/migrations/20260506150000_create_accept_bid_atomic.sql`

## 테스트 결과

- 미실행 — migration 파일 업데이트만 수행했고, 별도의 호출 테스트는 수행하지 않았다.

## 남은 위험

- 운영 DB의 `payments`가 `supplier_name`을 실제로 보유/사용하는 레거시 경로가 남아 있다면, 해당 경로도 점검이 필요하다.

## 다음 권장 작업

- `payments` 표시/리포트/조회 쿼리가 `counterparty_name`을 기준으로 일관되게 사용되는지 점검한다.

