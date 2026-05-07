# 2026-05-07 — SUP-MISSING-010 주문상태 이중 구조 구현

## 목표

- PRODUCT §6-4 주문관리의 “상태 이중 구조”를 코드/화면에 반영
  - `status`: 거래상태(원장) — draft/confirmed/cancelled
  - `order_status`: 주문상태(운영) — 접수→확인→출고준비→출고완료→납품완료→취소
- 두 상태 혼용 금지(로직 완전 분리)

## DB

- 운영 DB에 `orders.order_status` 추가 완료
- 저장소 migration 소급 생성:
  - `supabase/migrations/20260507180000_add_order_status.sql`

## 구현 내용

### 1) 주문상태 변경 액션

- `src/actions/order.ts`
  - `updateOrderStatus(order_id, order_status)`
    - `order_status`만 변경 (status는 건드리지 않음)
    - `order_logs`에 변경 이력 기록(before/after order_status)

### 2) 주문 목록/상세 UI 반영

- `src/actions/order-query.ts`
  - `getOrderList`에 `order_status` 포함 + `order_status` 필터 지원

- `src/app/(app)/orders/page.tsx`, `src/components/order/OrdersClient.tsx`
  - 주문 row에 `order_status` 표시
  - 주문현황 탭(운영 처리용) 추가:
    - 전체 / 오늘납품 / 지연 / 출고준비 / 완료
  - 별도 “주문상태” 드롭다운 필터 추가

- `src/app/(app)/orders/[id]/page.tsx` (신규)
  - 주문 상세에서 status(거래상태)와 order_status(주문상태)를 구분 표시
  - 운영 상태 전이 버튼(접수→…→납품완료, 취소 포함) 제공
  - 최근 변경 이력(order_logs) 표시

## 테스트

- `npx tsc --noEmit`

## 메모

- PRODUCT의 “오늘 납품/지연”은 납품희망일 기반이 이상적이나, 현 스키마에 납품희망일 컬럼이 노출되어 있지 않아 order_date 기반 근사치로 탭 필터를 구성했다.

