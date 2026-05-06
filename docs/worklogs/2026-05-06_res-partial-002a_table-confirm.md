# RES-PARTIAL-002-A — 주문 상세 라인 테이블/타입 정합성 확정

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

RFQ 확정 주문에서 주문 상세가 빈 품목으로 보이는 문제(RES-PARTIAL-002)의 선결 조건으로, 주문 상세 라인 조회가 실제로 어떤 테이블/타입을 사용하고 있는지 확정한다. 이번 작업은 “확인만” 수행하며 코드 로직 수정은 하지 않는다.

## 관련 tasks.md ID

- RES-PARTIAL-002-A

## 수정 파일 목록

- `docs/tasks.md`
- `docs/worklogs/2026-05-06_res-partial-002a_table-confirm.md`

## 확인 결과 (확정)

- **테이블명(SSOT)**: `restaurant_order_items`
  - 근거: `resturant_os/src/actions/orders.ts`의 `getOrderDetail()` 라인 조회가 `.from('restaurant_order_items')`로 고정되어 있음
- **변수명(코드 내 별칭)**: `order_lines`
  - 근거: `getOrderDetail()` 반환 타입이 `{ order_lines: OrderItemRow[] }`이며,
    `orders/[id]/page.tsx`에서 `const { order, order_lines } = result.data`로 사용
- **타입명**: `OrderItemRow`
  - 위치: `resturant_os/src/actions/orders.ts` 내부 `export interface OrderItemRow`

## `restaurant_order_items` 조회 컬럼 목록 (getOrderDetail 기준)

`resturant_os/src/actions/orders.ts`의 select:

- `id`
- `order_id`
- `product_name`
- `quantity`
- `unit`
- `unit_price`
- `prev_price`
- `saving`
- `created_at`

## RPC에 추가해야 할 insert 컬럼 목록 (다음 단계용)

`accept_bid_and_create_order_atomic`가 주문 확정 시 `restaurant_order_items`를 채우도록 수정할 때,
최소 아래 컬럼을 생성해야 주문 상세가 정상 표시된다.

- `order_id` (주문 헤더 id)
- `product_name`
- `quantity`
- `unit`
- `unit_price`
- `prev_price` (없으면 NULL)
- `saving` (없으면 0)
- `created_at` (없으면 now())

> 주의: 실제 테이블 DDL에 추가 필수 컬럼(예: tenant_id)이 있는지 여부는 운영 DDL로 재확인 필요.
> 다만 현 `getOrderDetail()` 코멘트 상 “tenant 컬럼이 없으므로 order_id로만 조회” 전제가 이미 코드에 존재한다.

## migration 여부

- 없음 (확인 작업만)

## 테스트 결과

- 미실행 — 확인/문서 작업만 수행

## 남은 위험

- `orders/[id]/page.tsx`의 TODO는 아직 남아있고, 실제 fix는 `RES-PARTIAL-002-B`(RPC에 라인 insert 추가)에서 수행해야 한다.

## 다음 권장 작업

- `RES-PARTIAL-002-B`: `accept_bid_and_create_order_atomic` RPC에 `restaurant_order_items` insert 추가.

