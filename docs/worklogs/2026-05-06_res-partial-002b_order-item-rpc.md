# RES-PARTIAL-002-B — RFQ 확정 RPC에 주문 라인 스냅샷 생성 추가

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

RFQ 확정 시 주문 헤더만 생성되고 `restaurant_order_items` 라인이 생성되지 않아 주문 상세 화면에서 빈 품목이 노출되는 문제를 해결하기 위해, `accept_bid_and_create_order_atomic` RPC에 주문 라인 스냅샷 insert를 추가한다.

## 관련 tasks.md ID

- RES-PARTIAL-002-B
- (선행 확인) RES-PARTIAL-002-A — `getOrderDetail()` 라인 조회 테이블이 `restaurant_order_items`임을 확정

## 수정 파일 목록

- `supabase/migrations/20260506180000_update_accept_bid_add_order_item.sql`
- `docs/tasks.md`
- `docs/worklogs/2026-05-06_res-partial-002b_order-item-rpc.md`

## restaurant_order_items 컬럼 확인 결과 (운영 DB)

| column_name | is_nullable | column_default |
|---|---|---|
| id | NO | gen_random_uuid() |
| order_id | NO | null |
| tenant_id | NO | null |
| product_name | NO | null |
| quantity | NO | null |
| unit | YES | 'kg'::text |
| unit_price | NO | null |
| prev_price | YES | null |
| saving | YES | 0 |
| created_at | YES | now() |

## RPC 수정 내용 요약

- `orders` INSERT 직후 `restaurant_order_items`에 라인 스냅샷 insert 추가
  - insert 컬럼: `order_id`, `tenant_id`, `product_name`, `quantity`, `unit`, `unit_price`, `prev_price`, `saving`
  - 값 매핑:
    - `order_id` = `v_order_id`
    - `tenant_id` = `p_tenant_id` (**NOT NULL**, RULE-01 관점에서도 필수)
    - `product_name`/`quantity`/`unit` = `v_rfq.*`
    - `unit_price` = `v_bid.price`
    - `prev_price` = `v_rfq.current_price` (nullable)
    - `saving` = `v_saving_amount` (nullable default 0 있으나 명시)
- `payments` INSERT의 `status`를 `planned` → **`pending`**으로 정렬

## DB 적용 완료

- 운영 DB에서 `accept_bid_and_create_order_atomic(p_tenant_id uuid, p_rfq_id uuid, p_bid_id uuid, p_payment_due_days integer DEFAULT 30)` 갱신 확인 ✅
- 포함 내용: `restaurant_order_items` insert 추가 + payments status `pending` 수정 ✅

## migration 여부

- 파일 추가/갱신: `supabase/migrations/20260506180000_update_accept_bid_add_order_item.sql`
- 운영 DB 적용: **완료** (사용자 확인)

## 테스트 결과

- 미실행 — DB 적용 확인은 사용자 제공 결과를 근거로 기록

## 남은 위험

- `RES-PARTIAL-002-C`(주문 상세 페이지 TODO 제거)는 아직 남아있어 UX 상 “TODO” 텍스트가 계속 노출될 수 있다.
- 기존 데이터(이미 생성된 주문)의 라인은 소급 생성되지 않으므로, 과거 주문 상세는 여전히 빈 품목일 수 있다.

## 다음 권장 작업

- `RES-PARTIAL-002-C`: 주문 상세의 TODO 문구 제거 및 “빈 품목” 상태 UX 정리.

