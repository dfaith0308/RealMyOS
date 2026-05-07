# 2026-05-07 — SUP-MISSING-006 수금 분배 UI 구현

## 목표

- PRODUCT §6-8 수금관리에서 “수금 → 주문 배분” 운영 플로우를 UI로 복원
- `collection_allocations`(FIFO/RPC)와 연결하여 미수/평균결제기간 계산의 입력을 확보
- migration 없이 **UI/액션만**으로 구현

## 구현 내용

### 1) 수금 상세 페이지 신설

- 경로: `src/app/(app)/payments/[id]/page.tsx`
- 수금 기본 정보(거래처/수금일/방식/수금액/예치금/메모) 표시
- 원장으로 빠른 이동: `/customers/[id]/ledger`

### 2) Actions 확장 (`src/actions/payment.ts`)

- `getPaymentDetail(payment_id)`: 수금 상세 조회(tenant scope)
- `getPaymentAllocations(payment_id)`: `collection_allocations` + `orders` 조인
- `getCustomerOpenOrdersForAllocation(customer_id)`: 거래처의 미수 주문 목록(기배분 합산 후 remaining 계산)
- `allocatePaymentFifo(payment_id)`: `allocate_payment_fifo` RPC 호출 + revalidate
- `addPaymentAllocation({ payment_id, order_id, allocated_amount })`
  - 주문별 “추가 배분” (1 write: insert 또는 update 누적)
  - tenant + payment/customer/order 스코프 검증
  - 배분 금액 검증(미배분/주문 미수 초과 방지)
- `voidPaymentAllocation({ allocation_id, reason })`
  - `status=voided`로 비활성화(물리 삭제 금지)

### 3) 배분 UI

- 컴포넌트: `src/components/payment/PaymentAllocationClient.tsx`
- KPI: 수금액 / 배분 합계(활성) / 미배분
- 버튼:
  - “주문에 분배(FIFO)” → `allocate_payment_fifo` 호출
- 수동 배분:
  - 미수 주문 리스트에서 주문별 “추가 배분” 입력 + `addPaymentAllocation` 실행
  - 기존 배분 내역은 `voidPaymentAllocation`로 비활성화 가능

### 4) 진입점 추가

- `src/components/payment/PaymentsClient.tsx` 목록에서 `/payments/[id]`로 “상세/분배 →” 링크 제공

## 테스트

- `npx tsc --noEmit`

## 주의 / 메모

- `allocate_payment_fifo`는 `payment.amount` 기준으로 배분하며, 기존 배분 합계는 테이블 합으로 계산됨
- 수동 배분은 “주문별 추가 배분” 단위로 1회 1 write를 유지(원칙적으로 RPC 기반 일괄 저장보다 안전)

