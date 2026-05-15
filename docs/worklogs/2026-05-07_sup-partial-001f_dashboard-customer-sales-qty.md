# SUP-PARTIAL-001-F — 대시보드 거래처 매출 TOP5 수량 컬럼 추가

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

대시보드의 “거래처 매출 TOP 5(이번달)”가 금액만 보여서 PRODUCT §6-1 요구(수량 컬럼 포함)를 충족하지 못했다.  
DB에 파생값을 저장하지 않고(RULE-02), 런타임 집계로 거래처별 판매 수량을 함께 표시해 운영 판단을 빠르게 한다.

## 관련 tasks.md ID

- SUP-PARTIAL-001-F

## 수정 파일 목록

- `src/actions/dashboard.ts`
- `src/app/(app)/dashboard/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-partial-001f_dashboard-customer-sales-qty.md`

## 변경 내용 요약

- `getDashboardData()`의 “거래처 매출 TOP5” 집계에 **판매 수량(quantity)** 를 추가했다.
  - 쿼리: `orders` 조회에 `order_lines(quantity)`를 포함
  - 집계: 거래처별로 `effectiveOrderAmount` 합산(금액) + `order_lines.quantity` 합산(수량)
- 대시보드 “거래처 매출 TOP 5” UI에 금액 아래 줄로 수량(`N개`)을 표시했다.

## migration 여부

- 없음

## 테스트 결과

- `npx tsc --noEmit` (pass)

## 남은 위험

- 수량은 `order_lines.quantity` 합산이므로, 라인이 없는 주문/비정상 데이터가 있으면 수량이 0으로 집계될 수 있다.
- 동일 거래처 키 매핑(`buildCustomerKey`)이 `customer_id`/snapshot 이름 조합에 의존하므로, 데이터 품질에 따라 일부 합산이 분산될 수 있다(기존 금액 집계와 동일한 성격).

## 다음 권장 작업

- “상품 매출 TOP 5”에도 판매 수량 컬럼이 필요하다면(`order_lines.quantity` 기반) 동일 방식으로 확장한다.

