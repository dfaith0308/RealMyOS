# 식식이OS 커머스 운영 상태 플로우

## Listing 상태 전이 규칙

| 전이 | 조건 | 행위자 |
|------|------|--------|
| draft → visible | 가격/이미지/정책 확인 후 | 관리자 |
| visible → hidden | 일시 비노출 | 관리자 |
| visible → sold_out | 재고 없음 | 관리자 |
| visible → discontinued | 판매 영구 종료 | 관리자 |
| hidden → visible | 재공개 | 관리자 |
| sold_out → visible | 재입고 | 관리자 |
| discontinued → * | 불가 (영구 종료) | 금지 |

## 주문 상태 전이 규칙

| 전이 | 조건 | 행위자 |
|------|------|--------|
| pending_payment → paid | 결제 확인 | 자동(카드) / 관리자(무통장/카카오) |
| paid → preparing | 준비 시작 | 관리자 |
| preparing → shipped | 배송 시작 | 관리자 |
| shipped → completed | 수령 확인 | 관리자 (초기 자동 완료 금지) |
| pending_payment → cancelled | 결제 전 취소 | 관리자 또는 식당 |
| paid → cancelled | 결제 후 취소 → 환불 트리거 | 관리자 |
| cancelled → refunded | 환불 완료 | 관리자 |
| shipped → cancelled | 금지 | 금지 |
| completed → * | 금지 | 금지 |
| paid → refunded | 금지 (cancelled 거쳐야 함) | 금지 |

## 환불 원칙
환불은 반드시 cancelled 상태를 거친다.
paid → refunded 직접 전이 금지.
이유: 취소 사유 / 주문 상태 / 정산 연결 필요.

## 자동 completed 금지 (초기)
초기에는 관리자 확인 기반 completed 처리.
자동 completed는 MVP 이후 검토.
이유: 실제 배송 누락/분쟁 가능성.

## visible 상태와 주문 가능 여부 분리
visible 상태는 노출 가능 상태이며
실제 주문 가능 여부는 별도 운영 판단으로 제한될 수 있다.

## 결제 방식별 처리 흐름

### 카드결제
pending_payment → paid (PG 콜백 자동)
→ preparing → shipped → completed

### 무통장입금
pending_payment → [관리자 입금 확인] → paid
→ preparing → shipped → completed

### 카카오 주문 전달
pending_payment → [관리자 카카오 확인] → paid
→ preparing → completed
(shipped 생략 가능)

## Timeout 정책
pending_payment 24시간 초과 시:
→ 자동 cancelled
→ 관리자 알림

## 금지 원칙
- 자동 주문 생성 금지 (RULE-30)
- shipped → cancelled 금지
- completed → 변경 금지
- discontinued → 복귀 금지
- paid → refunded 직접 전이 금지
- commerce_orders ↔ orders 혼용 금지 (RULE-28)
- 자동 completed 금지 (MVP 이후 검토)

## 가격 스냅샷 원칙
주문 시점 가격은 commerce_order_items.unit_price에 저장.
이후 listing 가격 변경되어도 과거 주문 금액 불변.
RULE-03(과거 데이터 불변) 적용.

---
