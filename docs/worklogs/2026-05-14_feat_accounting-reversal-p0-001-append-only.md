# worklog — ACCOUNTING-REVERSAL-P0-001 append-only reversal P0

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

주문이 `cancelled`로 전환될 때 **기존 `payments`·확정 allocation 행을 덮어쓰지 않고**, [D-021]·ACCOUNTING-EVENT-MODEL-001·ACCOUNTING-REVERSAL-DESIGN-001에 맞춰 **append-only reversal 이벤트**와 **unpaid `supplier_payables` 자동 취소**, **paid payable 수동 검토 로그**를 남기는 최소 엔진을 추가한다.

## 2. 관련 `tasks.md` ID

- **[ACCOUNTING-REVERSAL-P0-001]** (신규 블록)
- **[ACCOUNTING-REVERSAL-DESIGN-001]**, **[ACCOUNTING-EVENT-MODEL-001]**, **[ACCOUNTING-EVENT-POLICY-001]** (정책·설계 연계)
- **[PLATFORM-ERP-P0-001]**, **[PLATFORM-ERP-P2-003]** (payments·payables 축)

## 3. 수정 파일 목록

| 경로 | 역할 |
|------|------|
| `supabase/migrations/20260515500000_add_reversal_fields.sql` | `payments` reversal 컬럼·부분 UNIQUE(`reversal_of_id IS NULL`만 주문당 1건)·`supplier_payables` reversal 메타 |
| `src/actions/admin/commerce-reversal.ts` | `createPaymentReversalRow`, `cancelSupplierPayable`/`WithClient`, `processCommerceOrderCancelledAccountingP0`, admin_logs |
| `src/actions/admin/commerce.ts` | `tryRecord` 중복 조회 시 `reversal_of_id IS NULL`; `cancelled` 시 P0 후처리 호출 |
| `src/actions/admin/commerce-allocation.ts` | `CommerceAllocationListRow.order_has_payment_reversal` + 목록 조회 |
| `src/components/commerce/CommerceAllocationsClient.tsx` | 회계(P0) 열·confirmed+unpaid payable **수동 역처리** 모달 |
| `docs/tasks.md` | ID·문서 사용법·OPS 작업 이력 |
| `docs/worklogs/2026-05-14_feat_accounting-reversal-p0-001-append-only.md` | 본 로그 |

## 4. 변경 내용 요약

- **Migration**: `payments`에 `reversal_of_id`(self-FK), `reversal_reason`, `reversed_by`, `reversed_at`; 기존 `payments_commerce_order_id_unique` 제거 후 **원본 row만** `commerce_order_id` UNIQUE(`reversal_of_id IS NULL`); **reversal row당 1건** `UNIQUE(reversal_of_id) WHERE NOT NULL`. `supplier_payables`에 `reversal_*` 3컬럼( `reversal_of_id`는 P0 비포함).
- **Reversal row**: 원본 inbound `confirmed`는 **UPDATE 금지**; 새 row `status=reversed`, `amount` 동일(양수 유지), 링크·사유·주체·시각 기록.
- **주문 cancelled**: 기존 `cancelPendingCommerceOrderAllocationsForOrder` 유지 → `payment_status==='paid'`이면 reversal 시도 → 주문 소속 payables 순회(unpaid 자동 취소, paid는 `commerce_payable_manual_review_required`만).
- **UI**: 확정 allocation + 연결된 payable이 **unpaid**일 때만 **수동 역처리** 버튼·사유 모달 → `cancelSupplierPayable`.

## 5. migration 여부

- **파일 추가(미적용)** — `20260515500000_add_reversal_fields.sql` (운영·dev 적용은 별도 승인·절차).

## 6. 테스트 결과

- `npx tsc --noEmit` — **pass** (로컬).
- Next lint / E2E — **미실행** (범위 밖).

## 7. 남은 위험

- **KPI 의미**: `getStorefrontRevenueKPI`는 여전히 `status=confirmed` inbound만 합산하므로 **취소 주문의 원 입금 row**는 누계에 남음; reversal row는 `reversed`라 합산 제외 → **숫자는 “과대”일 수 있음**(P1에서 정책 반영 필요).
- **원본+reversal 공존** 후 다른 코드가 `commerce_order_id`만으로 `maybeSingle()` 조회하면 깨질 수 있음 — 본 작업에서 `tryRecordPlatformReceivablePayment` dup 조회를 **`reversal_of_id IS NULL`**으로 한정함. 추가 호출부는 지속 점검 권장.

## 8. 다음 권장 작업

- Migration **dev/staging 적용** 후 `TEST-RUN-ERP-001` 취소 시나리오 재실행.
- P1: KPI가 reversal·주문 운영 상태를 반영하도록 집계 규칙 설계(자동 재계산은 별 Epic).

---

## SECTION 1 — 사전 확인 결과 (코드 기준)

- **`updateCommerceOrderStatus`**: `cancelled` 시 기존에는 `cancelPendingCommerceOrderAllocationsForOrder`만 호출. **이번에** P0 후처리 추가(주문 업데이트·상태 로그 이후, 실패해도 주문 롤백 없음).
- **`cancelPendingCommerceOrderAllocationsForOrder`**: `status=pending`만 `cancelled` + `cancelled_at`/`cancelled_by`; confirmed는 비터치(유지).
- **`payments`**: 기존 migration에 `commerce_order_id` **부분 UNIQUE**가 있어 **reversal 두 번째 행 불가** → 본 migration에서 **부분 UNIQUE 재정의**로 해소.
- **`supplier_payables`**: 스키마에 `cancelled_at`/`cancelled_by` 존재; status는 `unpaid|paid|cancelled`.
- **KPI**: `getStorefrontRevenueKPI`의 매출 합산은 `confirmed`만; reversal row는 `reversed` → **이중 합산은 없음**; 다만 취소 후에도 **원 confirmed row가 KPI에 남음**.

## SECTION 2 — migration 내용

- 위 요약 및 `supabase/migrations/20260515500000_add_reversal_fields.sql` 본문 참조.

## SECTION 3 — payments reversal row 생성 흐름

- `createPaymentReversalRowInternal` → 원본 1건 선택 → 중복(reversal 이미 있음 / 23505) 시 skip → INSERT → `commerce_payment_reversal_created` / 실패 시 `commerce_payment_reversal_failed`.
- 공개 `createPaymentReversalRow`는 **세션 `user_id`와 `admin_user_id` 인자 일치** 필수.

## SECTION 4 — supplier_payables cancellation 흐름

- `cancelSupplierPayableWithClient`: **unpaid만** `cancelled` UPDATE + `reversed_*`·`reversal_reason` + `commerce_payable_cancelled`.
- **paid·기타**: UPDATE 없이 `commerce_payable_manual_review_required` + 사용자에게 안내 메시지.

## SECTION 5 — `updateCommerceOrderStatus` 연동

- 순서: pending allocation 취소 → `processCommerceOrderCancelledAccountingP0` (`payment_status==='paid'`일 때만 reversal 시도 플래그).

## SECTION 6 — UI 변경

- `/admin/commerce/allocations`: **회계(P0)** 열(입금 reversal 여부·payable 지급/취소 안내), **수동 역처리** 버튼(확정 + unpaid payable + payable id 존재), 사유 모달.

## SECTION 7 — admin_logs 추가·사용

- `commerce_payment_reversal_created` / `commerce_payment_reversal_failed`
- `commerce_payable_cancelled` / `commerce_payable_manual_review_required`

## SECTION 8 — KPI 영향 여부

- **합산 식 깨짐(이중 카운트)**: 없음 (`confirmed`만 집계, reversal은 `reversed`).
- **의미 정합**: 취소 주문 매출이 KPI에서 자동 차감되지는 않음 → **P1 재설계 권장**(본 P0 범위 밖).

## SECTION 9 — 남은 limitation

- KPI 재계산·취소 반영: **미구현**
- refund automation·PG 환불: **미구현**
- confirmed/paid payable **자동** reversal: **미구현**
- partial refund: **미구현**
- append-only **완전** ledger·reverse ledger chain: **미구현**

**현재 구조는 append-only 방향의 P0이며, 완전한 reverse-ledger accounting은 P1/P2 범위이다.**
