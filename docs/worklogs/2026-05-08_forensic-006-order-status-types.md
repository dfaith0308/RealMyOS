| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

- `orders.status`(원장/거래상태)와 `orders.order_status`(운영상태)가 이중 축으로 존재하는 상황에서,
  `order_status`가 코드 전반에서 `string`으로만 처리되어 발생하는 **타입 안전성 부족**을 해소한다.
- 두 상태의 목적이 다름을 명시하고, **혼용 금지**를 결정 문서로 고정한다.

## 변경 내용

### 1) 타입/상수 추가 (`src/types/order.ts`)

- `OrderOperationStatus` 유니온 타입 추가
- `ORDER_OPERATION_STATUS_LIST` / `ORDER_OPERATION_STATUS_LABEL` 추가

### 2) 사용처 타입 적용

- `src/actions/order.ts`
  - `updateOrderStatus()`의 `order_status` 인자를 `OrderOperationStatus`로 교체
- `src/actions/order-query.ts`
  - `OrderListItem.order_status` 및 필터 `order_status` 타입을 `OrderOperationStatus`로 교체
- `src/components/order/OrdersClient.tsx`
  - 필터/상태 select를 `ORDER_OPERATION_STATUS_LIST` 기반으로 교체
- `src/app/(app)/orders/*`
  - 목록 페이지에서 querystring 값을 `OrderOperationStatus`로 검증 후 적용
  - 상세 페이지에서 상태 전이/표시를 `OrderOperationStatus`로 정렬

### 3) 결정 문서 추가

- `docs/DECISIONS.md`에 **[D-019] 주문 상태 이중 축 확정** 추가

## 테스트

- `npx tsc --noEmit`: 통과

