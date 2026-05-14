# ACCOUNTING-EVENT-MODEL-001: 회계 이벤트 모델 및 원칙

> **목적**: 식식이OS(본 저장소 `realmyos`)에서 **운영 상태**, **회계 이벤트**, **현금 흐름 표현**, **immutable ledger 범위**를 분리해 명명하고, 이후 `ACCOUNTING-REVERSAL-DESIGN-001`·`[PLATFORM-ERP-001]`·정산·KPI 구현의 **최상위 원칙 문서**로 쓴다.  
> **범위**: **문서만** — 코드·migration 실행·DB 변경·신규 테이블 DDL 확정 없음.  
> **근거**: 본 문서의 **SECTION 1·사전 확인**은 `src/`·`supabase/migrations/`에서 확인한 사실만 기술한다. Taxonomy·원칙·lifecycle은 그 사실 위에 **본 문서가 채택하는 규범(normative)** 이며, 코드에 아직 없는 필드명은 **향후 migration 검토 대상**으로만 적는다.

**연계 문서**: [`docs/ACCOUNTING-REVERSAL-DESIGN-001.md`](./ACCOUNTING-REVERSAL-DESIGN-001.md) (역흐름 포렌식·케이스 분석).

---

## SECTION 1 — 현재 구조 포렌식 (payments / allocations / payables / KPI)

### 1.1 `payments` — 생성 경로·의미 혼재 (사실)

| 경로 | 파일·근거 | 방향·상태·식별자 (코드 기준) |
|------|-------------|-------------------------------|
| Storefront 플랫폼 미수 입금 | `src/actions/admin/commerce.ts` `tryRecordPlatformReceivablePayment` | `direction: 'inbound'`, `status: 'confirmed'`, `commerce_order_id` 연결, `order_id: null`. 중복 방지: 동일 `commerce_order_id` 기존 row 조회 후 skip. |
| RFQ 낙찰 후 지급 예정 | `supabase/migrations/20260506180000_update_accept_bid_add_order_item.sql` | `INSERT INTO payments` — `direction: 'outbound'`, 초기 `status: 'pending'`, `order_id` 연결 (주석: planned). |
| 지급 RPC | `supabase/migrations/20260507050000_create_disbursement_with_allocations.sql` | `direction: 'outbound'`, `status: 'pending'`, `amount > 0` 검증. |
| 수금 취소 | `src/actions/payment.ts` `cancelPayment` | inbound 수금 row `status → 'reversed'` (UPDATE). |
| 지급 역처리 | `supabase/migrations/20260507060000_create_reverse_disbursement.sql` | outbound `payments.status → 'reversed'`; `payment_allocations` 는 삭제하지 않음(주석). |
| 정산(플랫폼 수수료) | `src/actions/admin/settlement-control.ts` `processSettlement` | `payments` INSERT: `direction: 'inbound'`, `status: 'confirmed'`, `type: 'settlement'`, `order_id` = RFQ `orders.id`, `amount` = 수수료. |

**저장소 증분 migration 한계 (사실)**: `grep` 기준 `realmyos/supabase/migrations/` 내 **`CREATE TABLE public.payments`** DDL은 없고, `docs/PLATFORM-ERP-ARCH-001.md`에도 동일 취지가 기재되어 있다. 반면 **`settlement-control.ts`는 `payments.type` 등을 사용**하므로, 해당 컬럼은 **baseline 또는 미포함 DDL**에 존재하는 것으로 해석할 수밖에 없다(본 문서는 **코드가 실제로 INSERT하는 필드**까지만 확정).

**`payments.status` (migration 명시)**: `supabase/migrations/20260506160000_payments_status_add_pending.sql` — `CHECK (status IN ('pending', 'confirmed', 'reversed'))`.

**`commerce_order_id` vs `order_id` 배타 (migration)**: `supabase/migrations/20260515100000_add_commerce_order_id_to_payments.sql` — `chk_order_id_exclusive`: 둘 다 NOT NULL 불가.

### 1.2 Storefront KPI (`commerce_order_id` 축)

- **파일**: `src/actions/admin/platform-revenue.ts` `getStorefrontRevenueKPI`
- **집계**: `commerce_order_id IS NOT NULL`, `direction='inbound'`, `payee_tenant_id=플랫폼`, 일·월·총 매출은 **`status = 'confirmed'`** 만 합산.
- **최근 입금**: `neq('status', 'reversed')` — `pending`·`confirmed` 등 포함.
- **미수 금액**: `commerce_orders` 에서 `payment_status = 'unpaid'` 인 `total_amount` 합(주문 테이블 기준).

### 1.3 RFQ 정산·통합 뷰 (`order_id` 축)

- **파일**: `src/actions/admin/settlement-control.ts`
- **`getPlatformRevenue` / `getPendingSettlements` / `getUnifiedSettlementView` / `getAutoSettlementSuggestions` / `processSettlement`**: RFQ **`orders`** (`status='confirmed'`)와 `payments` (`status='confirmed'`, `type='settlement'` 또는 inbound 비-settlement)를 조합.
- **`reversed` / `commerce_order_id`**: 본 파일 내 문자열·필터로는 **storefront 역분개와 연결된 처리 없음**(검색 기준).

### 1.4 `commerce_order_allocations`

- **DDL**: `supabase/migrations/20260515200000_create_commerce_order_allocations.sql` — `status` CHECK `pending|confirmed|cancelled`; 품목당 **UNIQUE** `(commerce_order_item_id)`.
- **생성**: `src/actions/admin/commerce-allocation.ts` `createCommerceOrderAllocations` — 주문 `paid` 시 `pending` INSERT.
- **롤백성 DELETE (사실)**: 동일 함수에서 **INSERT 중 일부 실패 시** `insertedIds` 에 대해 **`delete().in('id', insertedIds)`** 실행. 즉 “비즈니스 확정 후 append-only”와는 별도로, **트랜잭션 실패 정리용 물리 삭제**가 코드에 존재한다.
- **취소**: `cancelPendingCommerceOrderAllocationsForOrder` — `pending` 만 `cancelled` + `cancelled_at`/`cancelled_by` UPDATE.
- **확정**: `confirmCommerceAllocation` — `pending` → `confirmed` UPDATE + `supplier_payables` INSERT 유도.

### 1.5 `supplier_payables`

- **DDL**: `supabase/migrations/20260515220000_create_supplier_payables.sql` — `status` CHECK **`unpaid|paid|cancelled`**; 금액 CHECK 비음수; `commerce_order_allocation_id` UNIQUE.
- **테이블 COMMENT (migration)**: 「실제 지급·payments와 분리」.
- **앱**: `src/actions/admin/supplier-payables.ts` — **조회·집계만**; `paid`/`cancelled` 로 바꾸는 update 액션은 본 턴 `src/` 검색에서 **없음**.

### 1.6 가격·품목 스냅샷

- **파일**: `supabase/migrations/20260515400000_create_pricing_policies.sql` — `commerce_order_items.applied_policy_snapshot` COMMENT: 주문 시점 immutable JSON.

### 1.7 현재 KPI 철학 (코드에서 읽히는 것)

- **플랫폼 storefront 매출**: `payments` **confirmed inbound** (스냅샷이 아니라 **현재 status 필터**).
- **공급자 allocation 요약**: `getCommerceAllocationsAdminData` — 집계 맵에 **`pending`·`confirmed`** 의 `supplier_payable_amount` 만 합산 (`cancelled` 는 미포함).

### 1.8 한 줄 평가 (사실 요약)

동일 테이블 `payments`에 **고객/공급자 실제 입출금 성격의 행**과 **RFQ 정산 수수료(`type: 'settlement'`) 행**이 공존하고, storefront·정산·수금 취소는 **서로 다른 서브시스템**에서 기록된다. **“돈만” 또는 “회계만”으로 단일 정의되지 않은 채 SSOT로 쓰이고 있다**는 점이 현행의 핵심이다.

---

## SECTION 2 — 회계 이벤트 Taxonomy (5개 개념 정의표)

아래는 **본 문서가 채택하는 정의**. 열 “현행 매핑”은 실제 코드·스키마에 붙은 이름/패턴이다.

| 개념 | 의미 (본 문서) | 운영 상태 vs 회계 이벤트 | 원장/스냅샷에 미치는 효과 | ledger immutable (목표) | 현행 매핑 (사실) |
|------|----------------|---------------------------|---------------------------|---------------------------|------------------|
| **cancelled** | 비즈니스·물류·주문(또는 allocation/payable)의 **의사결정에 따른 종료 상태**. “이제 이 단위는 더 이상 유효하지 않다”는 표시. | **운영 상태**에 가깝지만, ERP에 **부채·지급예정을 없애는 효과**를 줄 수 있어 회계적으로도 의미 있음. | allocation `cancelled` 는 **지급예정 스냅샷 수치를 바꾸지 않고** status만 변경(동일 row). `commerce_orders.status=cancelled` 등. | **목표**: 비즈니스 취소는 **삭제가 아닌 상태 전이 + 시각/주체**. 금액 컬럼 UPDATE 금지. | `commerce_order_allocations.status`, `commerce_orders.status`, `supplier_payables.status` 값으로 존재 가능(DDL상). |
| **void** | **아직 최종 확정되지 않은 연결(배분)** 을 “이력은 남기되 효력 없음”으로 표시. | **회계 이벤트에 가까운 ‘효력 제거 표시’** (원 배분 row 유지). | 집계에서 제외(부모 `payments.status` 또는 `collection_allocations.status`). | **append-only에 가깝다**: row 삭제 대신 `voided` + 시각·사유. | `collection_allocations` — `cancel_order_and_void_allocations` RPC, `voidPaymentAllocation` (`src/actions/payment.ts`). |
| **reversal** | **이미 유효했던 `payments`(또는 동등 SSOT) 행의 경제적 효력을 소멸**시키는 사건. | **회계 이벤트** (취소·환불과 별개로 먼저 정의 가능). | 동일 row `status=reversed` 로 집계 제외 **또는** (목표) **상쇄 row 추가**. | **목표**: **금액 필드 UPDATE 금지**; 효력 소멸은 **새 이벤트 row 또는 명시적 reversal 링크**로 남김. 현행은 `payments` UPDATE `reversed` 존재. | `cancelPayment`, `reverse_disbursement` SQL. |
| **refund** | **대금이 이동한 뒤 고객에게 돌려주는 실제 현금 흐름**(또는 그에 준하는 결제망 환불). | **현금 흐름 이벤트**; 회계적으로는 보통 **reversal/storno와 별도 전표**로 다루는 경우가 많음(일반론). | `payments` outbound/inbound 추가, PG 수수료, 공제 등 **별도 사건**이 붙을 수 있음. | 환불 = reversal 아님(본 문서 **구분 확정**): reversal이 “원 인식의 상쇄”라면, refund은 “고객에게 자금 반환”으로 **별도 이벤트**로 모델링한다. | `commerce_orders`: `refund_required`, `payment_status='refunded'` 필드·전이는 **`src/actions/admin/commerce.ts`** 에 존재. **`payments` 자동 연동은 동 파일 내 없음** (`ACCOUNTING-REVERSAL-DESIGN-001` 정합). |
| **adjustment** | **정책·실수·대사 차이**를 바로잡는 **의도된 보정**; 임의 CRUD 숫자 패치가 아님. | **회계 이벤트** (승인·사유·증빙 필수). | **상쇄 분개·추가 전표**로만 표현(본 문서 원칙). | **임의 UPDATE 금지**; `admin_logs` + (향후) adjustment 이벤트. | 현행 전용 타입은 **미구현**. `credit_line_override_set` 등은 다른 도메인의 `admin_settings` 조정 예시로만 존재(`settlement-control.ts`). |

#### storefront / allocation / payable 예시 (용어 고정)

- **storefront `cancelled`**: 주문 상태·`refund_required` 플래그 — **운영 상태**; `payments` inbound 자동 reversal **없음**(사실).
- **allocation `cancelled`**: **지급예정 스냅샷 row**의 종료; 금액 컬럼은 유지되고 status·cancel metadata만 갱신( pending 취소 경로).
- **payable `cancelled`**: DDL상 가능하나 **앱에서 취소 update 없음**(사실).

---

## SECTION 3 — `payments` SSOT 역할 비교 (옵션 A / B / C + 권장안)

### 옵션 A — `payments` = 실제 돈 흐름만, 회계 이벤트는 별도 원장

| 항목 | 내용 |
|------|------|
| 장점 | 의미 단일화·대사 명확. |
| 단점 | **현행과 충돌**: 이미 `type: 'settlement'` 정산 row가 `payments`에 insert됨(`settlement-control.ts`). 분리 시 이중 조회·이행 비용 큼. |
| migration 비용 | 높음(데이터 이전·동시 운영 기간). |
| ERP·settlement | 장기적으로 유리하나 단기 파급 큼. |

### 옵션 B — `payments` = 실제 돈 + 회계 이벤트 통합, reversal도 새 row

| 항목 | 내용 |
|------|------|
| 장점 | SSOT 단일 테이블 유지, append 상쇄 row로 **UPDATE 최소화** 가능. |
| 단점 | `amount` CHECK·의미 혼재로 **집계 쿼리가 복잡**; `type`·`direction`·`commerce_order_id`/`order_id` 조합 규율 필수. |
| KPI | 모든 집계에 **이벤트 타입·상태·부호 규칙**을 명시해야 함. |
| append-only | **새 row**로 상쇄하면 정합; 현행 `reversed` UPDATE 와 공존 시 **이행 규칙** 필요. |

### 옵션 C — 하이브리드: `payments` 유지 + **의미 분리·연결 키·상쇄 이벤트**(별도 범용 `ledger_entries` 테이블을 **본 문서에서 신설 정의하지 않음**)

| 항목 | 내용 |
|------|------|
| 장점 | **현행 연속성**: storefront bridge·RFQ 정산·수금 취소 패턴을 단계적으로 정리 가능. |
| 단점 | 당분간 **타입·상태·ID 축** 규율을 엄격히 문서화하지 않으면 혼선 반복. |
| transition | ① 집계·이벤트 규칙을 문서·코드 주석으로 고정 → ② `reversal_of_id` 등 **연결 메타**(migration 검토) → ③ 필요 시 분리 테이블. |
| future | 옵션 A로의 이전 여지. |

### 권장안 (본 문서 **확정**)

- **옵션 C (하이브리드)를 채택**한다.
- **이유 (사실 기반)**:
  1. `payments`는 이미 **storefront inbound**, **RFQ outbound**, **정산 수수료 inbound**를 모두 담는다(1.1).
  2. `20260515100000_add_commerce_order_id_to_payments.sql` 주석: **RFQ/orders settlement flow must remain untouched** — 즉 storefront 연결은 **기존 RFQ 축을 깨지 않는 전제**가 명시되어 있다.
  3. 완전 분리(옵션 A)는 이중 시스템 기간이 필연적이고, 통합만으로(옵션 B)는 **현행 `reversed` UPDATE**와의 정합 설계가 필요하다.

**옵션 C 하에서의 SSOT 정의 (본 문서 확정)**:

- **`payments`는 “자금·정산 이벤트의 물리적 저장소(SSOT)”**이며, 행마다 **`type`(또는 동등 분류 키)** 로 **의미**를 반드시 구분한다.
- **“실제 돈”과 “회계 조정”을 구분하는 단일 기준**은 **행의 `type` + `direction` + `order_id`/`commerce_order_id` + 부호 규칙**으로 고정한다(값은 구현·migration에서 반영).

---

## SECTION 4 — immutable ledger 원칙 (본 문서 확정)

### 4.1 총칙

- **운영 상태 수정**과 **회계 숫자 수정**을 분리한다.
- **회계 숫자**(주문 시점 단가·할인·수수료 분해·확정 allocation 금액·확정 시점의 `supplier_payables` 금액 등)는 **UPDATE로 덮어쓰지 않는다**가 목표다.
- **효력 소멸·취소**는 **(우선순위)**  
  1) **append-only 상쇄 이벤트 row**  
  2) **불가피한 기존 패턴**: `voided` / `reversed` 같은 **상태 마킹**(금액 필드 불변 전제)  
  순으로 설계한다.

### 4.2 테이블별 (현행 사실 + 본 문서 목표)

| 테이블 | immutable (본 문서) | 허용 수정 (목표) | 현행 코드와의 긴장 |
|--------|----------------------|------------------|---------------------|
| `payments` | **금액·연결 ID·type·direction** 생성 후 **불변**이 목표. | **효력 소멸만**: 상쇄 row 추가 **또는** (레거시) `status=reversed` 등 **비금액 필드**. | `cancelPayment`·`reverse_disbursement`는 **UPDATE**로 `reversed` 설정(사실). |
| `commerce_order_allocations` | **확정(`confirmed`) 이후 금액 필드 불변**이 목표. | `pending`: 취소 시 status·cancel metadata; **실패 롤백용 DELETE**는 “미커밋 비즈니스 데이터”에 한정. | `createCommerceOrderAllocations`의 **DELETE 롤백** 존재(사실). |
| `supplier_payables` | **INSERT된 금액 필드 불변**이 목표. | `status`·paid metadata·(향후) 상쇄 연결. | paid/cancelled **update 앱 없음**(사실). |
| `commerce_order_items` | 품목·가격·`applied_policy_snapshot` **불변**이 목표. | 없음(운영 수정은 별도 정책). | migration COMMENT가 immutable 명시. |
| `applied_policy_snapshot` (컬럼) | JSONB **삭제·덮어쓰기 금지** 목표. | 없음. | COMMENT 근거. |

### 4.3 `admin_logs` 최소 기준 (본 문서 확정)

- **회계 의미를 바꾸는 모든 액션**(취소·reversal·환불 확정·정산·allocation 확정·payable 생성/실패)은 **`admin_logs`에 남기는 것**을 원칙으로 한다.
- **현행 갭**: pending allocation 일괄 취소 **성공 시** dedicated log 없음 — `ACCOUNTING-REVERSAL-DESIGN-001` SECTION 1.2와 동일 사실.

---

## SECTION 5 — reversal lifecycle 정의 (본 문서 규범 + 현행 자동/수동)

단계는 **목표 모델**이다. “현행 자동”은 코드에 있는 것만 표기한다.

| 단계 | 내용 | 자동(현행) | 수동·정책 | append-only |
|------|------|------------|-----------|----------------|
| 1 | 취소·환불 **요청** | — | 주문 상태 전이는 관리자 UI·`updateCommerceOrderStatus` | 요청 이벤트 로그 권장 |
| 2 | **reversal 이벤트** 생성 | storefront inbound **자동 없음** | `cancelPayment` / `reverse_disbursement` 경로는 별 화면 | 목표: 상쇄 row 또는 링크된 reversal |
| 3 | allocation | `pending`→`cancelled` 자동 | `confirmed` **자동 없음** | `cancelled` 는 상태 전이 |
| 4 | `supplier_payables` | 연동 없음 | 전부 정책·향후 구현 | 상쇄/adjustment 권장 |
| 5 | `payments` | 정산·입금은 별 RPC | reversal 정책 필요 | 상쇄 row 권장 |
| 6 | `admin_logs` | 주문 상태·allocation 실패·payable 생성 등 일부 | 성공 루틴 보강 필요 | 이벤트 append |
| 7 | KPI | `confirmed` inbound 합산 등 **status 필터** | 취소 주문 제외 규칙 미정 | 이벤트 원장 정합 후 재정의 |
| 8 | settlement | RFQ `orders`·`type=settlement` 기준 | `commerce_orders` 미연계 | 정책 |
| 9 | export | 코드 범위 밖 | 배치 ID·기간 메타 정책 | — |

### 상태별 분기 (allocation / payable — 본 문서)

| 상태 | allocation | supplier_payables (있을 때) |
|------|------------|------------------------------|
| **pending** | 주문 operational 취소 시 **자동 cancelled** 가능(현행). | 보통 **미생성**. |
| **confirmed** | **자동 reversal 없음**; 수동 정책. | **unpaid** row 생성됐을 수 있음 → 취소와 **별도 정합** 필요. |
| **paid** | — | **상쇄·차기 정산** 이벤트 없으면 표현 한계(DDL 비음수). |

---

## SECTION 6 — 부분 취소 단위 (현행 불가 원인 + 목표 단위)

### 6.1 현행 불가 원인 (사실)

- `commerce_order_allocations_item_unique` — **품목당 allocation 1건** (`20260515200000_...sql`).
- 주문 품목·가격은 `commerce_order_items` + `applied_policy_snapshot` 로 **라인 스냅샷** 고정.
- `supplier_payables` 는 allocation 1:1 UNIQUE.

### 6.2 목표 단위 (본 문서 확정)

| 단위 | 현재 가능 | schema | forensic | settlement |
|------|-----------|--------|----------|------------|
| **주문 전체** | 예 (상태·pending allocation) | 추가 없음 | 낮음 | 영향 단순 |
| **품목(line)** | **부분 수량은 불가**; 라인 전체 취소도 allocation UNIQUE로 **추가 분해 어려움** | 라인당 복수 allocation 또는 수량 컬럼 필요 | 중간 | 중간 |
| **수량** | 미지원 | allocation에 수량·남금액 또는 sub-line | 높음 | 높음 |

**권장 목표 단위 (본 문서 확정)**: **단기는 주문 전체**, **중기는 품목(line) 단위**(수량 분할은 **스키마 변경 후**).

---

## SECTION 7 — supplier payable cutoff 정책 (본 문서 규범)

| 구간 | 정책 방향 (본 문서) | 운영 리스크 |
|------|---------------------|-------------|
| **unpaid** | 주문·allocation 취소와 **대사 가능한 자동 cancelled 또는 상쇄 이벤트**를 허용(구현은 별도). | 자동 시 **정산 컷오프**와 충돌 가능 → **컷오프 전/후** 규칙이 사람이 결정해야 함(SECTION 13). |
| **confirmed (allocation)** | allocation 자체에 `confirmed` 값은 있으나 **payable.status에 confirmed 없음** — 용어 혼동 방지: “확정된 지급예정”은 **allocation confirmed + payable unpaid** 조합으로 본다. | 수동 확정 누락 시 취소 지연. |
| **paid** | **음수 금액 불가**(DDL) → **차기 정산 차감·별도 adjustment·공급자 채권** 중 하나는 필수. | 지급 후 환불 시 **이중 지급·미상계**. |

---

## SECTION 8 — KPI 계산 기준 (본 문서 확정 방향 + 현행 사실)

### 8.1 현행 (사실)

- **storefront 매출·일·월**: `getStorefrontRevenueKPI` — inbound **`confirmed`** 만; `reversed` 제외.
- **미수 표시**: `commerce_orders.payment_status='unpaid'` 합.
- **allocation 합**: `pending`+`confirmed` (confirmed만 아님).
- **RFQ 정산 잔액**: `getUnifiedSettlementView` — `orders.confirmed` + `payments` **confirmed** inbound(비-settlement) + settlement rows.

### 8.2 본 문서가 KPI에 요구하는 원칙 (normative)

- KPI는 **“유효 경제 이벤트 집합”**을 명시한 뒤 집계한다. 최소한:
  - **`payments.status=reversed` 는 “유효 입금”에서 제외** (이미 storefront 매출에 반영).
  - **주문 `cancelled` / `refunded`** 와 **storefront inbound `confirmed`** 의 불일치를 해소하는 규칙을 **사람이 확정**해야 함(SECTION 13).
- **append-only ledger 기반 KPI**는 **이벤트 스트림**(상쇄 포함)을 단일 소스로 삼을 때 가능 — 현행은 **테이블 스냅샷+status 필터** 혼합이다.

---

## SECTION 9 — forensic / audit 원칙 (본 문서 확정)

- **취소 후에도** 주문 라인·가격 스냅샷·(가능한 경우) 최초 allocation/payment row는 **삭제하지 않는다**.
- **`applied_policy_snapshot` 삭제 금지**.
- **`admin_logs`**: who / when / why 중 **why는 `reason` 또는 `new_value` JSON**으로 남긴다(가능한 범위).
- **reversal reason**: 사람이 읽을 수 있는 **사유 문자열**을 원칙적으로 필수(구현 시).
- **법인 감사·세무·분쟁 시 재현**: “당시 어떤 정책·금액이었는가”는 **스냅샷 + 이벤트 순서**로 재구성 가능해야 한다 — **숫자 UPDATE로 끝내지 않는다**(목표).

---

## SECTION 10 — migration 필요 목록 (설계 검토만, 실행 금지)

| 필드·요소 | 필수 | 권장 | 향후 고려 |
|------------|------|------|-----------|
| `reversal_of_id` (또는 동등 FK) | | 권장 | 상쇄 row 패턴 시 사실상 필수 |
| `reversed_by` / `reversed_at` | | 권장 | 현행 `reversed` UPDATE 와 정합 |
| `reversal_reason` | | 필수에 준함 | 감사 대응 |
| `refund_amount` / `partial_refund_amount` | | | 부분 환불 도입 시 |
| `rollback_note` | | | `admin_logs`로 대체 가능 |
| `adjustment_reason` / `adjustment_by` | | | adjustment 도입 시 |
| `payments` 이벤트 `type` 정규화·CHECK | | 권장 | 코드가 이미 `settlement` 사용 |

---

## SECTION 11 — 구현 전략 비교

| 기준 | 전략 A: status 최소 | 전략 B: immutable reverse-ledger |
|------|---------------------|-------------------------------------|
| 구현 난이도 | 낮음 | 중~고 |
| 운영 안정성 | 단기 양호 | 중장기 양호 |
| ERP·forensic·settlement·payable | 열위 | 우위 |

**본 문서 확정 권장**: **전략 B를 최종 목표**로 하되, **옵션 C 전제**로 `payments` 축을 단계적으로 이행(기존 `reversed`·void와 공존 기간 명시). — `ACCOUNTING-REVERSAL-DESIGN-001` 권고와 정렬.

---

## SECTION 12 — 구현 우선순위 (P0 / P1 / P2)

- **P0**: `payments`·주문·allocation·환불 상태의 **의미 규율 문서화 + admin_logs 공백 제거**(성공 경로 포함).  
- **P1**: **상쇄 이벤트·연결 키**(`reversal_of_id` 등) 설계 승인·migration 초안(실행은 별도 승인).  
- **P2**: 부분 취소·paid payable 조정·정산 export 메타.

---

## SECTION 13 — 사람이 결정해야 하는 정책 목록

1. **`payments` 행 타입** 분류표(입금·출금·정산·상쇄·수수료)를 운영·회계가 합의할 것.  
2. **환불 완료(`refunded`)** 와 **`payments` reversal** 의 순서·필수 여부.  
3. **KPI**에 취소·환불을 반영하는 시점(주문 상태 vs 입금 vs 환불 완료).  
4. **정산 컷오프** 전후 취소 시 공급자 지급·플랫폼 수수료 처리.  
5. **부분 환불** 도입 여부 및 최소 단위.  
6. **paid `supplier_payables`** 이후 역전 수단(추가 지급·차감·채권 테이블).  
7. **allocation `confirmed` 후 주문 취소** 를 자동 허용할지 전면 수동인지.  
8. **`admin_logs` 최소 필드**와 보존·조회 권한.  
9. **외부 ERP·세금계산서**와의 이벤트 순서(본 문서는 법률 자문 없음).  
10. **baseline DB**에만 있는 `payments` 컬럼과 **저장소 migration**의 동기화 책임(스키마 출처).

---

## 별도: 사람이 결정해야 하는 정책 목록

- **SECTION 13과 동일.**

---

## 참조 (코드·migration 파일)

- `src/actions/admin/commerce.ts` — storefront 주문 상태·환불 플래그·`tryRecordPlatformReceivablePayment`
- `src/actions/admin/commerce-allocation.ts` — allocation 생성·DELETE 롤백·확정·pending 취소
- `src/actions/admin/platform-revenue.ts` — storefront KPI
- `src/actions/admin/settlement-control.ts` — RFQ 정산·`processSettlement`
- `src/actions/payment.ts` — `cancelPayment`, `collection_allocations` void
- `supabase/migrations/20260506160000_payments_status_add_pending.sql`
- `supabase/migrations/20260506180000_update_accept_bid_add_order_item.sql`
- `supabase/migrations/20260507050000_create_disbursement_with_allocations.sql`
- `supabase/migrations/20260507060000_create_reverse_disbursement.sql`
- `supabase/migrations/20260507111000_create_cancel_order_and_void_allocations.sql`
- `supabase/migrations/20260515100000_add_commerce_order_id_to_payments.sql`
- `supabase/migrations/20260515200000_create_commerce_order_allocations.sql`
- `supabase/migrations/20260515220000_create_supplier_payables.sql`
- `supabase/migrations/20260515400000_create_pricing_policies.sql`
