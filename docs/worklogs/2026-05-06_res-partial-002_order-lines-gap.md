# RES-PARTIAL-002 — RFQ 확정 주문의 주문라인 미생성(GAP) 분석 및 분해

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`resturant_os`에서 RFQ 확정(발주 확정) 시 `orders` 헤더만 생성되고 주문 라인 스냅샷이 누락되어, 주문 상세 화면에서 “주문 품목이 없습니다”가 노출되는 문제를 원인 단위로 확정하고, 다음 세션에서 구현 가능한 작업 단위로 분해한다.

## 관련 tasks.md ID

- RES-PARTIAL-002

## 수정 파일 목록

- `docs/tasks.md`
- `docs/worklogs/2026-05-06_res-partial-002_order-lines-gap.md`

## 변경 내용 요약

- 운영 DB에 `order_lines`, `restaurant_order_items` 테이블이 **둘 다 존재**함을 확인했다. *(결과는 사용자 제공)*
- RFQ 확정 경로는 `accept_bid_and_create_order_atomic` RPC 호출로 바뀌었으나, 해당 RPC에는 `restaurant_order_items` insert가 없어 라인 스냅샷이 생성되지 않는 것으로 정리했다.
- 주문 상세는 `getOrderDetail()`이 `restaurant_order_items`에서 라인을 조회해 `order_lines`로 반환하며, 화면은 `order_lines.length === 0`이면 TODO 문구를 포함한 빈 상태를 노출한다.
- 구현 작업을 A~C로 분해해 `tasks.md`에 등록했다.

## 확인된 사실 (근거 요약)

- **운영 DB**: `order_lines`, `restaurant_order_items` 모두 존재
- **발주 확정**: `resturant_os/src/actions/rfq.ts`의 `acceptBidAndCreateOrder()`는 `accept_bid_and_create_order_atomic` RPC 호출
- **RPC 내부**: `restaurant_order_items` insert 없음 (따라서 확정 후 라인 미생성 가능)
- **주문 상세 UI**: `resturant_os/src/app/(app)/orders/[id]/page.tsx`는 `order_lines` 기반 렌더링, 0건이면 “주문 품목 없음 + TODO” 노출
- **주문 상세 액션**: `resturant_os/src/actions/orders.ts`의 `getOrderDetail()`은 `.from('restaurant_order_items')` 조회 결과를 `order_lines`로 반환

## 원인 정리

발주 확정(=주문 생성)이 RPC 단일 호출로 이루어지지만, RPC가 주문 라인 스냅샷(`restaurant_order_items`)을 만들지 않는다.  
그 결과 주문 상세(`getOrderDetail` → `restaurant_order_items`)는 빈 배열을 반환하고, 화면에서 빈 품목 상태가 노출된다.

## 세부 항목 분해 (다음 세션 구현 범위)

- **[RES-PARTIAL-002-A] 테이블명 정합성 확인**
  - `getOrderDetail()`이 실제로 어느 테이블을 조회하는지(현재는 `restaurant_order_items`) 확정 및 문서화
  - migration: 없음

- **[RES-PARTIAL-002-B] RPC에 라인 생성 추가**
  - `accept_bid_and_create_order_atomic` RPC를 수정해 주문 확정 시 `restaurant_order_items` insert를 추가
  - 스냅샷 입력: rfq/bid의 `product_name`, `quantity`, `unit`, `unit_price`, (선택) `prev_price`, `saving` 등
  - migration: **필요** (RPC 수정)

- **[RES-PARTIAL-002-C] UI TODO 제거**
  - `orders/[id]/page.tsx`의 TODO 주석 제거
  - 라인 생성 후 정상 표시 확인

## migration 여부

- 없음 (문서 작업만)
- 다음 세션 구현 시: `RES-PARTIAL-002-B`에서 **RPC 변경 migration 필요**

## 테스트 결과

- 미실행 — 문서 변경만 수행

## 남은 위험

- 운영 DB에 `order_lines` 테이블도 존재하므로, 장기적으로 “라인 SSOT가 `restaurant_order_items`인지 `order_lines`인지” 혼선이 생길 수 있다.
  - 단기: `resturant_os`는 `getOrderDetail()`이 `restaurant_order_items`를 조회하므로 여기에 맞춰 생성하는 것이 우선.
  - 중기: `order_lines`의 역할(공급자OS용/공통용/레거시/뷰 등) 문서화 필요.

## 다음 권장 작업

- 다음 세션에서 `RES-PARTIAL-002-B`를 우선 구현해 “확정 즉시 라인 생성”을 보장하고,
  이후 `RES-PARTIAL-002-C`로 상세 화면의 TODO를 제거한다.

