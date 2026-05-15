| 필드 | 값 |
|------|------|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

**REFUND-LIFECYCLE-P1-001**: `cancelled`→`refunded` 전환 시 회계 이벤트는 추가하지 않되, **감사·운영 가시성**을 위해 `admin_logs`를 보강하고, **`payout_outbound`에 대한 append-only outbound reversal 시도**를 soft-block하며, **refunded인데 inbound reversal 자식이 없는** storefront gross KPI 케이스(케이스 B)만 최소 필터한다. 완전한 refund automation·settlement 연동은 범위 밖이다.

## 관련 `tasks.md` ID

- **[REFUND-LIFECYCLE-P1-001]**
- 연계: **[KPI-REVERSAL-P0-001]**, **[APPEND-ONLY-CONVERGENCE-P1-001]**, **[PAYABLE-PAYOUT-P1-001]**, **[ACCOUNTING-REVERSAL-P0-001]**, `DECISIONS.md` [D-021]~[D-024]

## 수정 파일 목록

- `src/actions/admin/commerce.ts` — `updateCommerceOrderStatus` `nextStatus === 'refunded'` 후처리 로그
- `src/actions/payment.ts` — `insertOutboundReversal` `payout_outbound` 차단
- `src/actions/admin/platform-revenue.ts` — `getStorefrontRevenueKPI` gross 케이스 B 필터
- `supabase/migrations/20260515700000_log_payment_reversal_audit_payout_blocked.sql` — `log_payment_reversal_audit`에 `payout_reversal_blocked` 허용
- `docs/tasks.md` — 작업 이력

## 변경 내용 요약

- **refunded**: 전환 직후 `commerce_order_refunded` (`commerce_order_id`, `payment_status`, 전환 전 `refund_required`, `existing_reversal_exists`). `supplier_payables.status=paid`이면 건별 `commerce_refund_paid_payable_exists`. 자동 reversal·payable 취소 없음.
- **payout_outbound**: `insertOutboundReversal` 초기에 차단, 한국어 오류 반환, `logPaymentReversalAudit('payout_reversal_blocked', …)`.
- **KPI**: gross 행 중 주문이 refunded/refunded payment_status이고 원본 입금 id에 대해 `reversal_of_id` 자식이 없으면 gross에서 제외; reversal 있으면 기존 gross+net 구조 유지.

## migration 여부

**파일 추가(미적용)** — `20260515700000_log_payment_reversal_audit_payout_blocked.sql` (AUTO/운영 적용은 별도 승인).

## 테스트 결과

- `npx tsc --noEmit` — **pass** (exit 0).

## 남은 위험

- RPC 미적용 환경에서는 `payout_reversal_blocked` 감사 insert가 RPC 화이트리스트 오류로 누락될 수 있음(개발 콘솔 warn 기존 패턴과 동일).
- KPI는 `PAY_FETCH_LIMIT` 내 gross/reversal만 반영하는 기존 한계 유지.

## 다음 권장 작업

- Staging에서 migration 적용 후 `payout_outbound` 차단 경로로 `log_payment_reversal_audit` 성공 여부 확인.
- refund 자동화·settlement↔payable·부분 환불은 별도 Epic에서 설계·구현.
