# ACCOUNTING-REVERSAL-DESIGN-001: 회계 역흐름 구조 설계

> **범위**: 저장소 **코드·SQL migration 파일**에 근거한 포렌식 + **설계 방향**(구현·DB 적용·migration 실행 없음).  
> **고정 전제(요청대로)**: `payments` SSOT, `commerce_order_allocations` 불변 스냅샷 성격, `supplier_payables`는 confirmed allocation 기반, `applied_policy_snapshot` 불변 의도, ERP 감사는 `admin_logs` 축.

---

## SECTION 1 — 현재 취소·환불 구조 포렌식 (코드 기준 사실만)

### 1.1 Storefront `commerce_orders` 상태·환불 플래그 (관리자OS)

- **진입점**: `updateCommerceOrderStatus(id, status, expectedCurrentStatus)` — `src/actions/admin/commerce.ts`
- **상태 검증**: `validateOrderTransition(before, after, refundRequired)` 동일 파일.
  - `paid` → `refunded` 직접 전이는 **금지** 메시지: 「환불은 cancelled 상태를 거쳐야 합니다」.
  - `cancelled` → `refunded` 는 `refund_required === true` 일 때만 허용.
- **DB 패치** (`commerce_orders`):
  - `paid` → `payment_status = 'paid'` (다음 상태가 `paid` 일 때).
  - `refunded` → `payment_status = 'refunded'`.
  - `paid` → `cancelled` 시 `refund_required = true`, `refund_pending_at` 설정.
  - `cancelled` → `refunded` 시 `refund_required = false`, `refund_pending_at = null`.
- **감사 로그**: 전이 성공 시 항상 `insertAdminLog` — `action_type: 'commerce_order_status_changed'`, `target_table: 'commerce_orders'`, `new_value`에 `before_status` / `after_status` 등.
- **부가 동작**:
  - `nextStatus === 'paid'`: `tryRecordPlatformReceivablePayment` (플랫폼 inbound `payments` 1건 best-effort) + `createCommerceOrderAllocations(oid)`.
  - `nextStatus === 'cancelled'`: `cancelPendingCommerceOrderAllocationsForOrder(supabase, oid, admin_user_id)` 호출.

**스키마 (migration)**: `commerce_orders.payment_status` 는 `CHECK (payment_status IN ('unpaid','paid','refunded'))` — `supabase/migrations/20260509010000_create_commerce_tables.sql`. `refund_required` / `refund_pending_at` — `20260509020000_add_commerce_orders_columns.sql`.

### 1.2 Pending allocation 자동 취소

- **함수**: `cancelPendingCommerceOrderAllocationsForOrder` — `src/actions/admin/commerce-allocation.ts`
- **동작**: `commerce_order_allocations` 에서 `commerce_order_id` 일치 **且** `status = 'pending'` 인 행만 `status: 'cancelled'`, `cancelled_at`, `cancelled_by`, `updated_at` 갱신.
- **Confirmed 행**: 주석 및 쿼리 조건상 **갱신하지 않음**.
- **admin_logs (성공 경로)**: **없음**. DB 컬럼 `cancelled_at` / `cancelled_by` 만 남음.
- **admin_logs (실패 경로)**: DB `update` 에러 시 `commerce_allocation_cancel_failed` 기록 시도.

### 1.3 Confirmed allocation 및 주문 취소

- **자동 롤백**: `updateCommerceOrderStatus` 의 `cancelled` 분기에서 **pending 만** 처리. confirmed allocation / `supplier_payables` **자동 취소·역분개 없음** (해당 파일 내 호출 없음).

### 1.4 `payments.status = 'reversed'` 사용처 (본 저장소)

| 위치 | 사실 |
|------|------|
| `src/actions/payment.ts` `cancelPayment` | 테넌트 수금 취소 시 `status → 'reversed'`. 주석에 「ledger 집계에서 자동 제외」. |
| `src/actions/payment.ts` `getPaymentList` | 필터 없을 때 `status IN ('confirmed','reversed')` 로 조회(역전건도 목록에 포함). |
| `supabase/migrations/20260507060000_create_reverse_disbursement.sql` | Outbound 지급 `reverse_disbursement` RPC: `payments.status = 'reversed'`. `payment_allocations` 행은 **삭제하지 않음**; 부모 `payments.status` 로 의미 부여(주석). |
| `src/actions/admin/platform-revenue.ts` `getStorefrontRevenueKPI` | 월/일/총 매출 집계: `commerce_order_id` 연결 inbound **`status = 'confirmed'`** 만. `reversed` 는 집계에서 제외. |
| 동 파일 `recentBase` | 최근 입금 목록: `neq('status', 'reversed')` — pending·confirmed 등 표시. |
| `src/components/commerce/StorefrontRevenueKpiSection.tsx` | UI 문구: reversed 제외 설명. |
| `src/components/disbursements/DisbursementsClient.tsx` | `reversed` 옵션·스타일. |

**Storefront 주문(`commerce_order_id`) 경로에서 `cancelPayment` / `reverse_disbursement` 를 호출하는 코드**: 본 턴 `src/` 검색 기준 **연결 없음** (관리자 주문 상태 변경만 확인).

### 1.5 RFQ/B2B `orders` 취소와 `collection_allocations`

- **진입점**: `cancelOrder` — `src/actions/order.ts`
- **RPC**: `cancel_order_and_void_allocations(p_tenant_id, p_order_id)` — `supabase/migrations/20260507111000_create_cancel_order_and_void_allocations.sql`
  - `orders.status → cancelled`
  - `collection_allocations`: `order_id` 일치·`tenant_id`·`status='active'` → `status='voided'`, `voided_at`, `voided_reason='order_cancelled'`
- **수동 void**: `voidPaymentAllocation` — `src/actions/payment.ts` (`collection_allocations` 를 `voided` 로).

### 1.6 `settlement-control.ts` 와 `reversed`

- **grep 결과**: `src/actions/admin/settlement-control.ts` 내 문자열 `reversed` **없음**. 정산·플랫폼 수익 로직은 주로 RFQ `orders`·기존 settlement 테이블 축(파일 상단~중반 조회 기준).

### 1.7 식당OS `resturant_os` (참고: 동일 DB 가정 시 스키마 정합 주의)

- `resturant_os/src/actions/orders.ts` `cancelOrder`: `payments` 의 `status='planned'` 행을 `status='cancelled'` 로 업데이트.
- **본 저장소(realmyos) migration** `20260506160000_payments_status_add_pending.sql`: `payments.status` CHECK 는 **`('pending','confirmed','reversed')`** 만 허용.
- 위 조합은 **식당OS 코드 vs realmyos DB 제약** 간 불일치 가능성을 시사(운영 DB가 어느 쪽 migration을 적용했는지는 본 문서 범위 밖).

### 1.8 현재 구조가 “상태 기반”인지 “원장 기반”인지 (코드·migration 기준 평가)

- **물리 삭제 회피**: `reverse_disbursement`·`cancel_order_and_void_allocations` 주석에 **삭제 금지** 명시. `collection_allocations` 는 void **상태 전이**로 역효과 표현.
- **`payments`**: 금액 row는 유지하고 **`status` 전이(`reversed`)** 로 효력 상실을 표현하는 경로가 **구현되어 있음** (`cancelPayment`, `reverse_disbursement`).
- **이중 기록(전용 reverse 금액 row)**: `payments` 테이블에 **음수 금액 보정 row를 INSERT 하는 앱 코드**는 본 턴 검색에서 **미확인**.
- **결론 (사실 서술)**: B2B 수금·지급 쪽은 **“불변 row + 상태·void로 효력 제어”** 에 가깝고, storefront 플랫폼 inbound 1건은 **단일 confirmed row** + 주문 취소 시 **자동 reversed 없음**.

---

## SECTION 2 — Reversal 방식 비교 (방식 A vs 방식 B)

### 방식 A: 상태만 변경 (`reversed` / `cancelled` 등)

| 항목 | 평가 |
|------|------|
| 장점 | 구현 단순·저장 공간 증가 적음·기존 `payments`/`reverse_disbursement` 패턴과 정렬. |
| 단점 | 동일 금액이 “유효였다가 무효”로 바뀌는 **이벤트 순서**·**사유**·**책임자**가 row 자체에 약하게 남을 수 있음(별도 로그 없으면). |
| 감사추적 | `admin_logs`·별도 reason 컬럼이 **있을 때** 가능. 현재 storefront 취소 시 allocation 성공 로그 **부재**(SECTION 1). |
| immutable ledger “위반” 여부 | **물리 삭제 없이 상태만 바꾸는 것**은 migration 주석상 허용된 패턴. 다만 “숫자 변조 없이 무엇이 언제 무효화됐는가”는 **별도 이벤트 원장**이 없으면 취약. |
| 복식부기 관점 | 원 장부(entry)가 “무효”로만 남고 **대응 분개**가 시스템에 없으면 외부 ERP와의 **대사 단위**가 모호해질 수 있음(설계 이슈). |
| forensic | **가능 조건**: 상태 전이 전후 스냅샷·로그·불변 주문/라인 데이터가 모두 남을 때. 현재는 일부 축에서 **공백**(allocation 성공 시 admin_logs 없음, storefront `payments` 자동 reverse 없음). |
| 운영·집계 단순성 | 집계 시 `status IN (...)` 필터로 단순화 가능(이미 KPI는 confirmed만 합산). |
| 데이터 손실 | 물리 삭제 없으면 **낮음**; 다만 **의미상 “유효 잔액” 오판** 리스크는 존재. |

### 방식 B: 원본 유지 + reverse row (음수 또는 reversal 표시)

| 항목 | 평가 |
|------|------|
| 장점 | 각 경제 이벤트가 **append-only** 로 쌓여 “누가·언제·얼마를 상쇄했는지”를 row 단위로 재현하기 좋음. |
| 단점 | row 수 증가·중복 방지·멱등 키·대사 쿼리 복잡도 증가. |
| 감사추적·immutable | **정합성 높음**(전제: 삭제 금지·링크 키 `reversal_of_id` 등). |
| 복식부기 | 상쇄 분개·storno 패턴과 모델링이 잘 맞음(일반론). |
| forensic | 원본+상쇄가 모두 남아 **재현성**이 높음. |
| 성능 | 단일 주문 단위에서는 보통 무시 가능; 대량 배치 시 인덱스 설계 필요. |

### 외부 생태계 관행 (일반론, 본 저장소 코드 아님)

- **Stripe / Shopify**: 결제 객체의 refund·void는 보통 **별도 이벤트/객체**로 노출되며, 원 승인 row만 조용히 덮어쓰지 않는 경우가 많음(통합·대사 목적).
- **ERP / 회계 / ledger**: 전기 취소는 **storno·반대 전표·별도 전표 유형**이 흔함; 단순히 “확정을 미확정으로 되돌리기”만으로는 감사 대응이 어려운 경우가 많음(일반론).

### 권장 (설계 문서 관점)

- **권장**: 장기적으로 **방식 B(append-only 상쇄 이벤트)** 를 **회계 의미의 SSOT** 로 두고, 기존 `payments.status='reversed'` 는 **결제수단 객체 수명주기** 또는 **하위 레이어**로 유지·정렬하는 **하이브리드**가 정합성과 운영의 균형에 유리.
- **이유**: 현재도 `collection_allocations` void는 **“별도 상태 이벤트”** 에 가깝고, 플랫폼 매출 KPI는 **`confirmed` 만** 잡는 등 **집계 경계**가 이미 존재. 역사를 **한 줄 수정**으로 끝내면 `admin_logs`·외부 ERP와의 **갭**이 재발함(SECTION 1 사실).

---

## SECTION 3 — `payments` reversal 설계 (주문 취소·환불 시)

### 현행 요약 (사실)

- Storefront `paid` 시 **최대 1건** inbound `payments` (`commerce_order_id` UNIQUE 인덱스 — `20260515100000_add_commerce_order_id_to_payments.sql`).
- 주문 `cancelled` / `refunded` 시 **해당 inbound를 자동 `reversed` 하지 않음** (`commerce.ts` 내 로직 없음).

### CASE A — 입금 전 취소 (`payment_status = unpaid`)

- **Receivable (플랫폼)**: `getStorefrontRevenueKPI` 는 `payments` confirmed 합과 별도로 `commerce_orders.payment_status='unpaid'` 합을 “미수”로 표시. 입금 전 취소면 **inbound row 자체가 없을 수 있음** → receivable 표시는 주문 금액 기준과 실제 입금의 **개념 분리** 유지 필요(정책).
- **Payable**: allocation은 `paid` 전환 시 생성되므로 보통 **미생성** 또는 pending만 존재. pending은 주문 `cancelled` 시 자동 cancelled.
- **platform_margin**: allocation 미확정이면 **원장상 마진 확정 전** 상태.

### CASE B — 입금 후 취소 (`payment_status` 가 paid였다가 취소·환불 플로우)

- **Receivable / 매출 KPI**: confirmed inbound가 남아 **매출·총매출에 포함**될 수 있음(`getStorefrontRevenueKPI`). 주문은 `cancelled` + `refund_required` 일 수 있으나 **`payments` 역처리 자동 없음** → 시스템 상 **과매출·과미수** 표시 가능성(정책·구현 결정 필요).
- **설계 선택지 (구현 아님)**:
  1. 동일 `payments` row 를 `reversed` + 사유·시각·주체 컬럼(또는 연결 이벤트 테이블).
  2. **상쇄 inbound** (음수 금액 허용 시 별도 CHECK) 또는 **별도 `payment_reversals` 이벤트 테이블**이 `payments.id` 를 참조.

### CASE C — 부분 환불

- **현행**: 부분 환불 금액·라인 단위 역분개 **미구현**(관련 컬럼·액션 없음).
- **영향**: 단일 `commerce_order_id` UNIQUE payments 는 **부분만 역**하기 어려움 → 설계상 **분할 입금 row** 또는 **allocation 단위 수금**으로 모델을 쪼개야 할 가능성이 큼(정책).

### CASE D — settlement 이후 환불

- **`settlement-control.ts`**: storefront `payments.reversed` 와의 연동 **없음**(문자열 부재).
- **위험**: 외부 정산 export 후 시스템만 역처리하면 **대사 단절**. 역이벤트에 **export 배치 ID / 회계 기간**을 묶는 메타가 필요(정책).

### 세금계산서·증빙 (시스템 관점만)

- 본 저장소에서 세금계산서 발행 모듈은 **본 문서 범위의 포렌식에 포함하지 않음**(검색 미수행). 설계상으로는 **역이벤트가 별도 전표/객체로 남는지**가 증빙 연속성에 유리.

---

## SECTION 4 — Allocation rollback 설계

### Pending 취소 (현행 유지 가능성)

- **가능**: 자동 cancelled 는 이미 동작. `cancelled_at` / `cancelled_by` 는 migration으로 컬럼 존재.
- **부족**: 성공 시 **`admin_logs` 없음** → “누가 취소했는지”는 `cancelled_by` 로는 복구 가능하나 **주문 상태 변경 로그와의 연결**은 운영자가 `commerce_order_id` 로 수동 조인해야 함.
- **Reverse row 필요성**: 스키마상 동일 allocation id에 대해 **pending→cancelled 한 줄**이면 대부분 충분; 다만 **감사 이벤트 테이블**을 권장(SECTION 10).

### Confirmed 취소

- **자동 취소**: **없음**.
- **수동 review**: `commerce_allocation_manual_review_required` **액션 타입은 코드·문서(TEST-RUN-ERP-001) 기준 미구현**.
- **Payable 연동**: `confirmCommerceAllocation` 이 성공 시 `supplier_payables` INSERT (`status='unpaid'`). 주문 취소와 **연동 해제 없음**.
- **Reverse allocation**: **미구현**. 설계 후보: (a) 별도 `commerce_allocation_reversals` 이벤트, (b) 동일 테이블에 상쇄 row — 현 UNIQUE `commerce_order_item_id` 는 **라인당 1 allocation** 이므로 **부분 취소**와 충돌(SECTION 4.3).

### 부분 취소 vs 전체 취소

- **스키마**: `CREATE UNIQUE INDEX ... commerce_order_allocations_item_unique ON (commerce_order_item_id)` — **품목당 allocation 1건** 가정.
- **부분 수량 취소**: 동일 `commerce_order_item_id` 에 대해 **추가 allocation을 만들 수 없음**(UNIQUE). 부분 취소를 allocation으로 표현하려면 **스키마·규칙 변경**이 선행.
- **전체 취소**: 주문 단위 `cancelled` + pending allocation 일괄 cancelled 로 **대부분 정리** 가능.

---

## SECTION 5 — `supplier_payables` reversal 설계

### 스키마 (migration 사실)

- `status` CHECK: **`'unpaid' | 'paid' | 'cancelled'`** — `20260515220000_create_supplier_payables.sql`.
- 앱 코드의 “confirmed payable” 표현은 **`commerce_order_allocations.status='confirmed'`** 쪽이지, `supplier_payables.status` 에 **`confirmed` 값은 없음**.

### 앱 코드 (사실)

- `getSupplierPayablesAdminData`: 조회·KPI 집계만.
- **`supplier_payables` 를 `cancelled` / `paid` 로 바꾸는 update 액션**: 본 턴 `src/` 검색 기준 **없음**.
- **지급 실행·paid 처리 UI**: `src/app/(admin)/admin/commerce/payables/page.tsx` 문구상 **미포함**.

### 설계 방향 ( unpaid / paid 역전 )

- **Unpaid 취소**: `status='cancelled'` + `cancelled_at/by` + **사유**는 최소; 감사는 `admin_logs` 필수 권장.
- **Paid reversal**: 현 스키마는 **음수 `payable_amount` 불가**(CHECK `>= 0`). **상쇄 row** 또는 **supplier 클레임/차감 원장** 테이블이 없으면 **“이미 지급” 역전은 DB상 표현 불가**에 가깝음.

---

## SECTION 6 — Snapshot 유지 원칙

### `applied_policy_snapshot` (migration 주석)

- `COMMENT ON COLUMN ... applied_policy_snapshot` : 「주문 시점 정책 immutable 스냅샷(JSON). 정책 변경 후에도 ERP 복구용.」— `20260515400000_create_pricing_policies.sql`
- **취소 시 삭제**: 앱 코드에서 주문 취소 시 `commerce_order_items` 삭제·스냅샷 NULL 처리 **검색 결과 없음**.

### `commerce_order_allocations`

- 금액·비율은 UPDATE 로 취소 처리( pending → cancelled )되나, **confirmed 행은 취소 시에도 금액 필드가 바뀌지 않음**(자동 경로 없음).

### 권장 방향 (근거)

- **삭제 금지·스냅샷 유지**: 이미 migration·정책 주석이 **forensic·세금 분쟁 대응**을 명시.
- **운영 실수 복구**: 과거 시점 가격·수수료 분해를 **재계산 가능**하게 함.

---

## SECTION 7 — 복식부기 관점 위험 분석 (HIGH / MID / LOW)

| 위험 | 등급 | 근거(현행) |
|------|------|------------|
| 입금 confirmed `payments` 가 남은 채 주문만 cancelled/refunded 표시 | **HIGH** | inbound 자동 reverse 없음; KPI는 confirmed 합산. |
| confirmed allocation + unpaid `supplier_payables` 가 주문 취소 후에도 잔존 | **HIGH** | 취소 시 연동 없음. |
| 동일 사건에 대해 수동으로 `payments` 와 주문 상태를 따로 바꿀 때의 불일치 | **MID** | 트랜잭션 단일 RPC 부재. |
| 부분 환불·부분 취소 불가로 운영이 **수동 조정**에 기대 | **MID** | 스키마·액션 부재. |
| `cancelPending...` 성공 시 `admin_logs` 부재 | **MID** | DB 컬럼으로는 추적 가능하나 ERP 감사축은 약함. |
| duplicate reversal (같은 payment 두 번 reversed 시도) | **LOW~MID** | `cancelPayment` 는 이미 reversed 거부; storefront inbound 자동 경로 없음. |
| race (동시에 paid 확정·취소) | **MID** | `updateCommerceOrderStatus` 는 `eq('status', beforeStatus)` 낙관적 락 1회. |

### TOP 5 (가장 위험한 지점)

1. **Storefront confirmed `payments` 와 주문 취소/환불 상태의 비동기화**  
2. **`supplier_payables` unpaid 잔존 + allocation confirmed 고정**  
3. **부분 취소 불가로 인한 수동 장부**  
4. **감사 로그 공백(allocation cancel 성공)**  
5. **정산·export 축과 reversal 축의 무링크(`settlement-control` 미연계)**

---

## SECTION 8 — 세금·정산 영향 (시스템 관점만)

- **세금계산서**: 본 저장소 내 발행 파이프라인은 본 문서에서 **다루지 않음**(미검색).
- **Settlement cycle 중 reversal**: `settlement-control` 이 `reversed` 를 인지하지 않으면 **월별 집계·잔여 미정산**이 실제 현금 흐름과 어긋날 수 있음.
- **platform_margin 역전**: allocation·payable·수수료가 **라인 스냅샷에 고정**되어 있어, 취소 이벤트 없이는 **이익 잔고가 과대** 가능.
- **Export 후 reversal**: 배치 키 없이면 **supplier statement mismatch** 재현 어려움.

---

## SECTION 9 — 운영 리스크 TOP 5 (코드 기준)

1. **취소 후에도 unpaid `supplier_payables`·confirmed allocation 잔존**  
2. **환불은 주문 필드만 반영되고 `payments` inbound는 그대로**  
3. **KPI·매출은 confirmed payment 기준이라 취소 주문과 불일치 가능**  
4. **`admin_logs`에 allocation 취소 성공 기록 없음** (실패만)  
5. **부분 취소 불가 → 운영 수동·스프레드시트 의존**  

(추가) **reverse 중복**은 API 일부에서 방어하나, **통합 플로우 부재**로 운영 실수 여지.

---

## SECTION 10 — migration 필요 목록 (설계 검토만, 실행 없음)

| 항목 | 필요 가능성 | 권장 여부 | 비고 |
|------|-------------|-----------|------|
| `payments.reversal_of_id` / `reversed_at` / `reversed_by` / `reversal_reason` | 상쇄·추적 강화 시 **높음** | 권장 | 현재는 상태만 변경하는 경로가 중심. |
| 별도 `commerce_payment_events` (append-only) | 여러 결제·부분환불 시 **높음** | 권장 | SSOT를 이벤트로 올리는 패턴. |
| `refund_amount` / `partial_refund_amount` on `commerce_orders` | 부분 환불 시 **중간** | 가능 | 정책 확정 후. |
| `supplier_payables` 상쇄 row 또는 `supplier_payable_adjustments` | paid 이후 조정 시 **높음** | 권장 | 음수 금액 CHECK 회피. |
| `rollback_note` (주문·allocation·payable 공통) | 운영 **중** | 선택 | `admin_logs.new_value`로 대체 가능. |
| allocation **부분 수량** 지원을 위한 스키마 완화(UNIQUE 재설계) | 부분 취소 시 **높음** | 정책 후행 | 현 UNIQUE와 충돌. |

---

## SECTION 11 — 구현 전략 비교

| 기준 | 전략 A: status 기반 최소 | 전략 B: immutable reverse-ledger |
|------|-------------------------|-------------------------------------|
| 구현 난이도 | 낮음 | 중~고 |
| 운영 안정성 | 단기 양호·**중장기 대사 리스크** | 높음(명시적 이벤트) |
| ERP 정합성 | 낮~중 | 높음 |
| 확장성 | 부분 환불·다중 결제에 취약 | 유리 |
| supplier settlement | paid 이후 표현 한계 | 조정 테이블로 확장 |
| forensic | 로그·상태에 의존 → **현재 갭** | 유리 |

**권장안**: **전략 B를 목표**로 하되, 단기적으로 기존 `reversed`·void 패턴과 **공존**하는 점진 이행(하이브리드)이 리스크가 가장 낮음.

---

## SECTION 12 — 구현 우선순위 제안 (P0 / P1 / P2)

- **P0**: Storefront 주문 취소·환불 완료와 **`payments` inbound** 의 **일관된 상태** + **`admin_logs` 이벤트**(allocation 성공 포함).  
- **P1**: confirmed allocation + `supplier_payables` 에 대한 **명시적 취소/조정 플로우**(paid 전).  
- **P2**: 부분 환불·**정산·export 링크**·paid 이후 supplier 차감 원장.

---

## SECTION 13 — 사람이 결정해야 하는 정책 목록

아래는 **시스템이 대신 결정할 수 없는** 비즈니스·회계·운영 정책이다.

1. **입금 확인 후 취소** 시: 실제 환불이 완료되기 전/후 어느 시점에 **수금 원장을 무효·상쇄**할 것인가.  
2. **`payments` SSOT** 를 “결제 객체”로 둘지 “회계 이벤트”로 둘지, 혹은 **이중 레이어**로 분리할지.  
3. **부분 환불** 허용 여부와 최소 단위(주문·라인·수량).  
4. **confirmed allocation** 을 주문 취소로 **자동 되돌릴지**, **항상 수동 승인**할지.  
5. **`supplier_payables` 가 unpaid** 일 때 주문 취소와 **동시 자동 cancelled** 할지, 정산 컷오프(월말 등)를 둘지.  
6. **`supplier_payables` paid 이후** 역전을 **추가 지급·차감·다음 정산 반영** 중 무엇으로 할지.  
7. **플랫폼 매출·미수 KPI** 에 취소·환불을 반영하는 **정의**(예: 발생주의 vs 입금주의 vs 환불완료 기준).  
8. **외부 ERP·세금계산서** 발행 시점과 reversal 의 **순서 고정 규칙**.  
9. **감사 로그**에 남겨야 하는 최소 필드(사유·금액·외부 결제 ID 등)와 **보존 기간**.  
10. **식당OS·관리자OS** 가 동일 DB를 쓸 때 **`payments.status` 허용값** 통일(코드 간 불일치 해소).

---

## 별도: 사람이 결정해야 하는 정책 목록

- **본 문서 SECTION 13과 동일 목록**이다. 구현 시에는 각 항목에 대해 **소유 부서·승인자·문서 ID**를 `DECISIONS.md` 또는 별도 결정록에 남길 것.

---

## 참조 파일 (포렌식에 직접 사용)

- `src/actions/admin/commerce.ts` — `updateCommerceOrderStatus`, `validateOrderTransition`, `tryRecordPlatformReceivablePayment`
- `src/actions/admin/commerce-allocation.ts` — `cancelPendingCommerceOrderAllocationsForOrder`, `confirmCommerceAllocation`, `createSupplierPayableFromAllocation`
- `src/actions/admin/platform-revenue.ts` — `getStorefrontRevenueKPI`
- `src/actions/payment.ts` — `cancelPayment`, `getPaymentList`, `voidPaymentAllocation`
- `src/actions/order.ts` — `cancelOrder` + RPC 호출
- `src/actions/admin/supplier-payables.ts` — 조회만
- `supabase/migrations/20260506160000_payments_status_add_pending.sql`
- `supabase/migrations/20260507111000_create_cancel_order_and_void_allocations.sql`
- `supabase/migrations/20260507060000_create_reverse_disbursement.sql`
- `supabase/migrations/20260515200000_create_commerce_order_allocations.sql`
- `supabase/migrations/20260515210000_commerce_order_allocations_cancel_audit.sql`
- `supabase/migrations/20260515220000_create_supplier_payables.sql`
- `supabase/migrations/20260509010000_create_commerce_tables.sql`, `20260509020000_add_commerce_orders_columns.sql`
- `supabase/migrations/20260515400000_create_pricing_policies.sql`
- `docs/TEST-DEV/TEST-RUN-ERP-001.md` — `commerce_allocation_manual_review_required` 부재 명시
