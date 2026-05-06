# RES-DANGER-001 원자화 RPC migration 초안 작성

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

식당OS의 발주 확정(`acceptBidAndCreateOrder`)이 `orders`/`payments`/`rfq_*`/`price_history`를 트랜잭션 없이 순차 write 하는 구조위험(RULE-19)을 해소하기 위해, 단일 트랜잭션 RPC `accept_bid_and_create_order_atomic`의 **migration SQL 초안**을 작성한다.

## 관련 tasks.md ID

- RES-DANGER-001

## 수정 파일 목록

- `realmyos/supabase/migrations/20260506150000_create_accept_bid_atomic.sql`
- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-06_phase3_res-danger-001_accept-bid-atomic-draft.md`

## 변경 내용 요약

- `public.accept_bid_and_create_order_atomic(p_tenant_id, p_rfq_id, p_bid_id, p_payment_due_days)` 함수를 생성/갱신하는 migration SQL 초안을 작성했다.
- RPC 내부에서 아래 작업을 **하나의 트랜잭션(함수 호출)** 로 수행하도록 구성했다.
  - RFQ tenant 소유권 검증
  - RFQ가 이미 `ordered`면 에러 반환(중복 실행 방지)
  - BID 조회 및 상태 검증
  - `orders` insert
  - `payments` insert (`planned`, `outbound`, `due_date = current_date + p_payment_due_days`)
  - `rfq_bids` accepted/rejected 갱신
  - `rfq_requests` ordered 갱신
  - `price_history` insert (ingredient barcode는 optional 조회)
- `upsert_savings_stat`은 RPC 밖에서 best-effort로 유지(현행 의도 유지).

## migration 여부

- 파일 추가 — `supabase/migrations/20260506150000_create_accept_bid_atomic.sql` (미적용, DB 실행 금지)

## 테스트 결과

- 미실행 — SQL은 초안 생성만 했고 DB 적용/호출 테스트는 수행하지 않았다.

## 남은 위험

- 실제 운영 DB의 테이블/컬럼 타입(`rfq_requests.status`, `rfq_bids.status`, `payments.*`)과 완전 일치 여부는 적용 전 검증이 필요하다.
- 동시 실행(레이스) 방지를 위해 상태 검증 외에 `SELECT ... FOR UPDATE` 또는 유니크 제약/상태 전이 규칙 강화가 필요할 수 있다.

## 다음 권장 작업

- 승인 후 dev/validation 환경에 적용해 실제 컬럼/enum 정합 및 RLS 하에서의 호출 성공 여부를 검증한다.
- `acceptBidAndCreateOrder`를 RPC 호출로 치환하고, 앱 레이어에서 `upsert_savings_stat` 및 today-event 로깅만 후처리로 유지한다.

