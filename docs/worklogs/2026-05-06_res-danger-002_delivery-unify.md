# Phase 3 — RES-DANGER-002 납품 완료 처리 단일화(markOrderDelivered)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

식당OS의 납품 완료 처리에서 UI 버튼이 `updateOrderStatus`만 호출해 “상태만 완료”되고, 납품 피드백(ingredient 갱신/price_history 기록/delivered_at)이 누락되던 경로를 제거한다. 납품 완료는 반드시 `markOrderDelivered` 단일 액션을 통해 수행되도록 정렬한다.

## 관련 tasks.md ID

- RES-DANGER-002

## 수정 파일 목록

- `resturant_os/src/actions/orders.ts`
- `resturant_os/src/components/orders/OrderCompleteButton.tsx`
- `resturant_os/src/components/rfq/BidCompareClient.tsx`
- `resturant_os/src/components/today/TodayDeliveryCard.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-06_res-danger-002_delivery-unify.md`

## 수정 전/후 비교 (요약)

### 수정 전

- `OrderCompleteButton.tsx`는 `updateOrderStatus(tenantId, orderId, 'completed')`만 호출.
- `updateOrderStatus`는 orders.status만 변경하고 `delivered_at`/ingredient 갱신/price_history 기록이 없음.
- `markOrderDelivered(order_id)`에만 납품 피드백 로직이 있으나, 주요 UI 경로에서 사용되지 않음.

### 수정 후

- `markOrderDelivered`를 `markOrderDelivered(tenant_id, order_id)` 시그니처로 변경하고,
  - orders 조회 시 `buyer_tenant_id = tenant_id`로 스코프
  - tenant 불일치 시 `권한 없음`으로 실패 처리
  - orders update에도 `buyer_tenant_id = tenant_id` 조건을 추가
- `OrderCompleteButton.tsx`는 `markOrderDelivered(tenantId, orderId)`를 호출하도록 변경.
- 기존 호출부(`BidCompareClient`, `TodayDeliveryCard`)도 새 시그니처로 정렬.

## tenant 검증 추가 근거

- 납품 완료는 상태 변경 외에 ingredient/price_history 등 다중 write를 동반하므로, 앱 레이어에서 tenant 소유권(`buyer_tenant_id`)을 명시적으로 검증·스코프하여 타 테넌트 주문 처리 위험을 줄인다.

## migration 여부

- 없음

## 테스트 결과

- 에디터 진단: 수정한 4개 파일에서 linter 오류 없음

## 남은 위험

- `resturant_os` 작업 트리에 이미 존재하던 다른 변경(`.env.development`, `supabase/schema.sql` 등)은 본 작업 범위 밖이며 별도 정리가 필요할 수 있음.

## 다음 권장 작업

- 납품 완료/지급 완료 등 “행동 버튼”이 호출하는 서버 액션의 tenant 스코프 패턴을 일관되게 표준화한다.

