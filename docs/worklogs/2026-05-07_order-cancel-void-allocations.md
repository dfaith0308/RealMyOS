# 주문 취소 시 collection_allocations void 처리 (원장/평균결제기간 정합)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

주문이 취소될 때, 해당 주문에 이미 배분된 수금(`collection_allocations`)이 남아 평균결제기간·원장/집계에 영향을 주지 않도록 정리한다. RULE-10에 따라 물리 삭제가 아닌 **void 상태 전환**으로 처리한다.

## 관련 tasks.md ID

- (OPS) 주문 취소 시 수금 배분 void 처리
- 연계: `SUP-TODO-004-C-4` (평균결제기간 계산에서 active만 집계)

## 수정 파일 목록

- `supabase/migrations/20260507110000_add_void_to_collection_allocations.sql`
- `supabase/migrations/20260507111000_create_cancel_order_and_void_allocations.sql`
- `src/actions/order.ts`
- `src/actions/analytics.ts`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_order-cancel-void-allocations.md`

## 변경 내용 요약

- `collection_allocations`에 void 메타 컬럼을 추가:
  - `status` (`active`/`voided`)
  - `voided_at`, `voided_reason`
- 주문 취소 시 “주문 취소 + 배분 void”를 단일 트랜잭션으로 처리하는 RPC `cancel_order_and_void_allocations`를 도입하고, 앱 `cancelOrder`에서 이를 호출하도록 변경.
- 평균결제기간 계산은 `collection_allocations.status='active'`만 집계하도록 필터 추가.

## migration 여부

- migration 파일 추가 (운영 DB 적용 완료는 사용자 확인 사항)

## 테스트 결과

- `npx tsc --noEmit` (pass)

## 남은 위험

- `update_customer_stats` RPC 호출은 여전히 별도 호출로 남아 있으며, 장기적으로는 RULE-02(원장 단일 소스) 전환 이후 의존 제거가 필요하다.
- `allocate_payment_fifo`가 order 취소 직후 재호출되는 경우, voided row를 제외하고 다시 배분될 수 있는지 RPC 내부 로직/동시성 조건은 추가 검증 여지가 있다.

## 다음 권장 작업

- `allocate_payment_fifo` RPC가 `collection_allocations.status='active'`만 합산/조회하도록 확실히 고정되어 있는지(운영 함수 본문) 1회 점검하고, 필요 시 migration으로 보강한다.
- 원장 화면/수금 상세에서 “배분 void 이력”을 노출할지(감사 UX) 검토한다.

