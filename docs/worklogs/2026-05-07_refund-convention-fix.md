# 반품 컨벤션 불일치 수정 (order_type=refund 가정 제거)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

운영 DB의 `orders.order_type`가 `sale/purchase`만 갖는 상황에서, 코드가 `order_type='refund'`를 가정해 반품 집계를 수행하던 불일치를 제거한다. 반품은 “sale 주문의 음수 금액” 컨벤션으로 통일한다.

## 관련 tasks.md ID

- (컨벤션) 반품/환불 처리 규약

## 수정 파일 목록

- `src/actions/analytics.ts`
- `src/lib/ledger-calc.ts`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_refund-convention-fix.md`

## 변경 내용 요약

- `getRiskSignals`의 “반품 많은 상품” 계산에서 `order_type='refund'` 가정을 제거.
  - **반품 라인**: `isSalesOrder(o)` 이면서 `line_total < 0` 인 라인 합(음수 유지)
  - **매출 라인**: `line_total > 0` 인 라인 합
  - `refund_ratio = |refund_revenue| / sales_revenue`
- `isSalesOrder` 주석에 “반품은 order_type이 아니라 음수 line_total로 구분” 컨벤션을 명시.

## migration 여부

- 없음

## 테스트 결과

- `npx tsc --noEmit` (pass)

## 남은 위험

- 반품을 “라인 단위 음수”로 모델링하므로, 주문 단위로 sale/refund를 분리해 보고 싶다면 추가적인 규약(예: 주문 합계 음수면 반품 주문으로 표시)이 필요할 수 있다.
- `line_total=0` 라인은 매출/반품 집계에서 제외된다(의도: 노이즈 제거).

## 다음 권장 작업

- 반품 입력 UX(사용자가 음수 라인을 만들게 되는 플로우)가 실제 운영에서 어떻게 발생하는지(주문 수정/취소/환불 시나리오)를 1회 점검하고, 필요 시 “반품 전용 UI”를 별도 ID로 분리한다.

