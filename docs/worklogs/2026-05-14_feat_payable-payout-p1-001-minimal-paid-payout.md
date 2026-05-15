| 필드 | 값 |
|------|------|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

[D-023]에 따라 **settlement와 별개로** `supplier_payables`를 **실제 지급 finality(`paid`)**로 옮기고, SSOT인 `payments`에 **append-only outbound 지급 이벤트**(`payout_outbound`)를 남긴다. settlement 자동화·배치·PG는 범위 밖.

## 관련 `tasks.md` ID

- **[PAYABLE-PAYOUT-P1-001]**
- 연계: **[D-023]**, **PLATFORM-ERP-P2-003**, **[PAYMENTS-TAXONOMY-DESIGN-001]** (`payout_outbound`)

## 수정 파일 목록

- `src/lib/inbound-payment-superseded.ts` — `PAYMENTS_TYPE_PAYOUT_OUTBOUND` 상수
- `src/actions/admin/supplier-payables.ts` — `markSupplierPayableAsPaid`, 목록 `paid_by`, `insertAdminLog` 헬퍼
- `src/actions/admin/commerce-reversal.ts` — paid payable 취소 시도 시 `supplier_payable_manual_review_required`
- `src/components/commerce/CommercePayablesClient.tsx` — 미지급 행 지급 완료 버튼·모달·paid 배지·열 보강
- `src/app/(admin)/admin/commerce/payables/page.tsx` — 설명 문구
- `docs/tasks.md` — Epic 블록·작업 이력

## 변경 내용 요약

- `unpaid` payable만 **paid + paid_at/paid_by** 갱신 후 **`payments`** INSERT(플랫폼→공급자 outbound, `confirmed`, `payment_method=platform`, `memo`에 payable id, **`commerce_order_id`/`order_id` NULL**로 storefront inbound unique·KPI 혼선 방지).
- payout INSERT 실패 시 payable을 **unpaid로 롤백**하고 `supplier_payable_paid_failed` 기록.
- 기본 호출은 `payments_type_override` 없음 → D-022 soft로 **`payment_type_missing_rejected`** 감사 1건 + `supplier_payable_paid`(INSERT는 항상 진행).
- paid payable에 대한 `cancelSupplierPayable`는 **UPDATE 없이** 거절 + `supplier_payable_manual_review_required`.

## migration 여부

- **없음** (기존 `supplier_payables`·`payments` 스키마만 사용).

## 테스트 결과

- `npx tsc --noEmit` — **성공**

## 남은 위험

- TS·앱 트랜잭션만으로 **payable UPDATE와 payout INSERT** 원자성은 DB 트랜잭션 수준은 아님(극히 짧은 창에서 불일치 이론상 가능). payout 성공 후 `supplier_payable_paid` admin_logs 실패는 데이터는 이미 확정.

## 다음 권장 작업

- 필요 시 **`mark_supplier_payable_paid` SECURITY DEFINER RPC**로 원자화.
- payout과 payable을 잇는 **명시 FK/참조 컬럼**(migration 별도 승인) 검토.
