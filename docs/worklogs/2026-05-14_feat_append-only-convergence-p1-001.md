| 필드 | 값 |
|------|------|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

[D-024] transition debt를 줄이기 위해 RFQ outbound·inbound 결제 취소를 **원본 `payments` UPDATE 없이** append-only reversal row(`reversal_of_id`, `status=reversed`, `amount` 양수)로 수렴하고, 원장·정산 뷰·KPI에서 **상쇅된 원본 inbound**가 이중 집계되지 않도록 최소 필터를 추가한다.

## 관련 `tasks.md` ID

- **[APPEND-ONLY-CONVERGENCE-P1-001]**
- 연계: **[APPEND-ONLY-CONVERGENCE-POLICY-001]**, [D-021]~[D-024], **[ACCOUNTING-REVERSAL-P0-001]**, **[KPI-REVERSAL-P0-001]**

## 수정 파일 목록

- `supabase/migrations/20260515600000_log_payment_reversal_audit.sql` — `log_payment_reversal_audit` RPC (감사 action_type 화이트리스트)
- `src/lib/inbound-payment-superseded.ts` — superseded 원본 id 조회 + subset 헬퍼
- `src/actions/payment.ts` — append-only reversal, `cancelPayment`/`cancelDisbursement`, purchase 재계산, 목록/잔액 필터, 감사 RPC 호출
- `src/actions/ledger.ts` — 일별 현금흐름·고객 잔액·통계 집계에서 superseded 원본 제외
- `src/actions/admin/settlement-control.ts` — `getUnifiedSettlementView` paid 합산 시 superseded 제외
- `src/actions/analytics.ts`, `src/actions/dashboard.ts`, `src/actions/sales.ts` — inbound confirmed 집계 시 superseded 제외
- `src/actions/admin/commerce-reversal.ts` — storefront reversal INSERT 시 `type` soft guard + `payment_type_missing_warned`
- `docs/tasks.md` — 본 Epic 작업 이력

## 변경 내용 요약

- **Outbound / inbound**: `insertOutboundReversal` / `insertInboundPaymentReversal`로 reversal row INSERT; 원본 row는 변경하지 않음.
- **기본 경로**: `cancelPayment`·`cancelDisbursement`는 append-only 우선; 실패 시 **D-024 transition debt fallback**으로 기존 UPDATE / `reverse_disbursement` RPC 유지 및 `*_legacy_fallback_used` 감사 기록.
- **Purchases**: `payment_allocations` 기준으로 outbound가 append-only로 상쇅된 경우 allocation을 제외하는 방식으로 **기존 RPC와 동일한 경제적 의미**를 맞춤.
- **이중 집계 방지**: inbound append-only 상쇅이 있는 원본 `payments.id`를 `fetchInboundSupersededOriginalPaymentIds`로 모아 원장·대시보드·영업·분석·통합 정산 paid 집계에서 제외(자식 reversal 행은 `status=reversed`로 기존 쿼리에서 이미 제외).
- **Storefront**: `createPaymentReversalRowInternal`에서 원본 `type` 누락 시 taxonomy `payout_reversal`로 명시 + `payment_type_missing_warned` 로그.

## migration 여부

- **파일 추가**: `20260515600000_log_payment_reversal_audit.sql` — 저장소에만 추가; **운영 DB 적용은 별도 승인·절차** (본 로그 기준 미적용 가정).

## 테스트 결과

- `npx tsc --noEmit` — **성공**
- `npm run lint` — **실패** (기존 프로젝트 이슈: `QuoteCreateClient.tsx`, `PaymentCreateForm.tsx`, `Surface.tsx` 등; **본 변경 파일 관련 신규 오류 없음**)

## 남은 위험

- `collection_allocations` + `payments!inner` 기반 **평균 결제기간** 등 일부 조인 경로는 superseded 필터를 아직 넣지 않았을 수 있음(영향 범위는 제한적).
- append-only 성공 후 `purchases` 재계산 실패 시 부분 불일치 가능 — 운영에서 모니터링 필요.

## 다음 권장 작업

- `log_payment_reversal_audit` migration **스테이징/운영 적용** 후 supplier 세션에서 감사 로그 RPC 검증.
- allocation·기타 조인 기반 KPI에 superseded 필터 필요 여부 **샘플 데이터로 점검**.
- P1 검증 완료 후 **legacy fallback 제거** 일정 확정.
