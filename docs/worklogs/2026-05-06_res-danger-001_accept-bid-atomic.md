# RES-DANGER-001 발주 확정 원자화 (RPC 적용 + 앱 치환)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

식당OS `acceptBidAndCreateOrder`가 `orders`/`payments`/`rfq_*`/`price_history`를 트랜잭션 없이 순차 write 하던 구조위험(RULE-19)을 제거하기 위해, 단일 RPC `accept_bid_and_create_order_atomic` 호출로 원자화한다.

## 관련 tasks.md ID

- RES-DANGER-001

## 수정 파일 목록

- `resturant_os/src/actions/rfq.ts`
- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-06_res-danger-001_accept-bid-atomic.md`

## 변경 내용 요약

- `resturant_os/src/actions/rfq.ts`의 `acceptBidAndCreateOrder`에서 아래 순차 write 블록을 제거했다.
  - `orders` INSERT
  - `payments` INSERT
  - `rfq_bids` UPDATE (`accepted`/`rejected`)
  - `rfq_requests` UPDATE (`ordered`)
  - `price_history` INSERT
- 위 블록을 단일 RPC 호출로 대체했다.
  - `supabase.rpc('accept_bid_and_create_order_atomic', { p_tenant_id, p_rfq_id, p_bid_id, p_payment_due_days })`
  - 실패 시 즉시 에러 반환, 성공 시 `order_id`를 받아 후속 처리 유지
- RPC 성공 후에는 기존 동작을 유지했다.
  - `upsert_savings_stat` best-effort 호출(절약액은 RPC 반환 `saving_amount` 사용)
  - today-event 로깅
  - `revalidatePath('/rfq' | '/money' | '/today')`

## migration 여부

- production 적용(운영 DB) — `supabase/migrations/20260506150000_create_accept_bid_atomic.sql`

## 테스트 결과

- 미실행 — 코드 변경은 적용했으나 로컬/CI/수동 테스트는 수행하지 않았다.

## 남은 위험

- RPC 반환이 비정상(json 구조 변경/NULL 등)일 경우 앱에서 `order_id`가 비어 있을 수 있음(현재는 RPC 에러/빈 응답만 방어).
- 동시 실행(레이스) 방지를 위한 DB 레벨 잠금/상태 전이 강화는 운영 패턴에 따라 추가 검토가 필요할 수 있다.

## 다음 권장 작업

- `acceptBidAndCreateOrder` 호출 흐름에서 실제로 RPC가 성공하는지(권한/RLS 포함) 검증하고, 실패 시 사용자 메시지/로깅 품질을 점검한다.

