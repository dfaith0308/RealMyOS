# PAYMENTS-TAXONOMY-DESIGN-001 — `payments` 회계 이벤트 taxonomy 설계

> **목적**: `payments` 테이블이 담는 **여러 회계·운영 이벤트**의 의미를 분리하고, **`type` taxonomy**와 **`status`/`direction`/`reversal_of_id` 역할**을 정렬해 향후 append-only accounting event bus로 확장 가능한지 평가한다.  
> **범위**: **설계 문서만**. 코드·migration·DB 변경 없음.  
> **근거**: 본 문서의 포렌식은 **`realmyos` 저장소**의 migration·TypeScript를 `grep`/`read`로 확인한 사실에 한정한다. `CREATE TABLE public.payments` DDL은 증분 migration에 **없음**(`docs/PLATFORM-ERP-ARCH-001.md`와 동일 취지). `create_payment_atomic` 등 **일부 RPC 본문은 저장소에 없음** — 해당 부분은 명시적으로 “운영 DDL 대조 필요”로 표기한다.

---

## SECTION 1 — 현재 `payments` 구조 포렌식 (type / direction / status)

### 1-1. `type` 컬럼

| 항목 | 사실 (저장소 기준) |
|------|-------------------|
| 증분 migration에 `ALTER TABLE … ADD type` | `grep`으로 **`realmyos/supabase/migrations/` 내 `payments`용 `type` DDL은 미검색**. `docs/CONTEXT.md`에는 수동 절차로 `ADD COLUMN IF NOT EXISTS type text` 언급. |
| 앱 코드에서 `payments.type` 사용 | **`settlement-control.ts`**: 조회 시 `.eq('type', 'settlement')` 다수; `processSettlement` INSERT payload에 **`type: 'settlement'`** (`L751–767` 근처). **`trade-monitor.ts`**: `.eq('type', 'settlement')` (`grep` 결과). |
| storefront / RFQ 수금 INSERT에 `type` 명시 | **`commerce.ts`** `tryRecordPlatformReceivablePayment` payload에 **`type` 키 없음** (`L2342–2358`). **`commerce-reversal.ts`** reversal INSERT 시 **`o.type != null`일 때만** `payload.type` 설정 (`L233–234`) — 원본에 type 없으면 **미설정**. |
| RFQ 납품 대금(accept bid) RPC | **`20260506150000_create_accept_bid_atomic.sql`** `INSERT INTO public.payments` 컬럼 목록에 **`type` 없음** (`L126–136`). |
| 지급 생성 RPC | **`20260507050000_create_disbursement_with_allocations.sql`** `INSERT`에 **`type` 없음** (`L75–105`). |

**정리**: `type`은 **정산(`settlement`) 경로에서만 명시적으로 세팅·필터**되는 패턴이 강하고, **storefront·RFQ 일반 수금·지급 RPC INSERT에는 컬럼 자체가 빠지는 경우가 많다**. 즉 **taxonomy가 코드에 일관되게 박혀 있지 않다**.

### 1-2. `status` (증분 migration에서 확인된 CHECK)

**파일**: `supabase/migrations/20260506160000_payments_status_add_pending.sql`

```sql
CHECK (status IN ('pending', 'confirmed', 'reversed'));
```

| 항목 | 사실 |
|------|------|
| 허용 값 (증분 CHECK) | `pending`, `confirmed`, `reversed` |
| `accept_bid_atomic` INSERT | **`'planned'`** (`20260506150000_create_accept_bid_atomic.sql` `L144`) — **현 증분 CHECK와 문자열 불일치**. 운영 baseline·적용 순서에 따라 **레거시/드rift** 가능성 → taxonomy 설계 시 **반드시 운영 DB에서 `payments.status` 실제 분포·CHECK 재확인** 필요. |

### 1-3. `direction`

| 값 | 사용 예 (저장소) |
|----|------------------|
| `outbound` | `accept_bid_atomic` (`L145`), `create_disbursement_with_allocations` (`'outbound'::public.payment_direction`) |
| `inbound` | `settlement-control.ts` `processSettlement` payload **`status: 'confirmed'`**, **`direction: 'inbound'`**; `commerce.ts` storefront 수금 **`direction: 'inbound'`**; `commerce-reversal.ts` reversal row는 원본과 동일 inbound 유지 |

### 1-4. `reversal_of_id` (append-only P0)

**파일**: `supabase/migrations/20260515500000_add_reversal_fields.sql`

- 컬럼: `reversal_of_id` (nullable, self-FK `REFERENCES payments(id)`)
- **부분 UNIQUE**: `payments_commerce_order_id_primary_unique` — `commerce_order_id` NOT NULL **且** `reversal_of_id IS NULL` 일 때만 주문당 1건
- **`payments_reversal_of_id_unique`**: `reversal_of_id` NOT NULL 일 때 **유니크** → **원본당 reversal child 1건** (깊이>1 chain은 DB 제약상 제한)

### 1-5. `payment_method` (CHECK 확장)

**파일**: `supabase/migrations/20260515100000_add_commerce_order_id_to_payments.sql`

- 허용: `transfer`, `cash`, `card`, `platform`, **`bank_transfer`**, **`kakao_manual`**

### 1-6. 저장소에서 관측된 `type` 리터럴 (앱/마이그레이션)

| 리터럴 | 출처 |
|--------|------|
| `settlement` | `settlement-control.ts` (`processSettlement` insert, `getPlatformRevenue`·`getSettlementHistory`·`getUnifiedSettlementView` 등 필터) |
| *(미설정/NULL 다수)* | `commerce.ts` storefront insert, `accept_bid`·`disbursement` SQL, `commerce-reversal` (원본 type 없을 때) |

---

## SECTION 2 — `payments.type` taxonomy 전체 정의표 (설계안)

아래는 **현 구조를 반영한 목표 taxonomy 초안**. 실제 enum·CHECK·백필은 **정책 결정 후 P1**에서 수행.

| 제안 `type` | 의미 | 기본 `direction` | 생성 주체(현행) | reversal 가능 | KPI(플랫폼 storefront) | append-only 적합 | settlement 영향 | payout 영향 | forensic |
|-------------|------|------------------|------------------|----------------|----------------------|-------------------|----------------|------------|----------|
| **`storefront_collection`** | 식당→플랫폼 storefront 입금 확정 | `inbound` | 관리자 `paid` 확정 시 `tryRecordPlatformReceivablePayment` | **예** — append-only child row (`reversal_of_id`) | gross/net에 포함(정책대로) | **적합** | 없음(별도 supplier_payables) | 없음 | HIGH |
| **`rfq_collection`** | 공급자 맥락 RFQ 수금(inbound confirmed 등) | `inbound` | `create_payment_atomic`(RPC)·기타 | 정책 결정 | RFQ 집계·원장 | **적합** | 대사 시 간접 | 없음 | HIGH |
| **`rfq_payable_schedule`** (또는 기존 무type outbound) | 납품 대금 지급 예정(outbound planned/pending) | `outbound` | `accept_bid_atomic` 등 | 레거시: `reverse_disbursement`는 **UPDATE reversed** | 제외/별도 | **부분** — 레거시 UPDATE 존재 | 있음 | 없음 | HIGH |
| **`settlement_fee_inbound`** | 플랫폼이 공급자로부터 수수료를 “정산”으로 기록한 inbound | `inbound` | 관리자 `processSettlement` | 정책 결정 | **storefront KPI 제외** (`commerce_order_id` 없음) | **적합** | **직접** | 없음 | HIGH |
| **`payout_outbound`** | 실제 공급자 지급(은행 이체 등) | `outbound` | 미구현/별도 | 정책 결정 | 별도 | **적합** | 있음 | **직접** | HIGH |
| **`payout_reversal`** | 지급 환수/취소 append-only | `inbound` 또는 `outbound` 정책 | 미구현 | — | 별도 | **적합** | 있음 | 있음 | HIGH |
| **`adjustment`** | 운영·회계 보정 | 양방향 가능 | 관리자 승인 전제 | 수동+로그 | 정책 배제/별도 | **조건부** | 간접 | 간접 | CRITICAL |
| **`fee_accrual`** (선택) | 수수료 발생만 분리 기록할 때 | 정책 | 시스템 | — | margin 정교화 | 선택 | 있음 | 없음 | MEDIUM |

**현행 매핑 제안 (백필 시)**

| 현재 식별 특성 | 제안 `type` |
|----------------|------------|
| `commerce_order_id` NOT NULL · inbound · confirmed · reversal 없음 | `storefront_collection` |
| `reversal_of_id` NOT NULL · storefront 맥락 | `storefront_reversal` (또는 `storefront_collection` + `reversal_of_id`만으로도 구분 가능하나 KPI에서 type 필터를 쓰려면 분리 유리) |
| `order_id` NOT NULL · inbound · `type != settlement` | `rfq_collection` |
| `type = 'settlement'` (코드 명시) | `settlement_fee_inbound` (이름은 기존 `settlement` 호환 가능) |
| `order_id` NOT NULL · outbound · pending | `rfq_payable_schedule` |
| disbursement RPC 생성 | `payout_outbound` 또는 `rfq_payable_schedule`로 통합 여부 **결정 필요** |

---

## SECTION 3 — `type` vs `status` 역할 분리 (설계 원칙)

### `type` (회계 이벤트 종류)

- **행 생성 시점에 확정**하는 것이 이상적.
- **불변(immutable)** 을 목표로 하고, 의미 변경이 필요하면 **상쇄 row** 또는 **adjustment** type.

### `status` (처리·운영 lifecycle)

- **은행 입금 확인**, **정산 승인**, **지급 완료** 등 운영 절차 표현.
- **reversed**: (레거시) **동일 row의 효력 소멸**을 나타내는 값. **append-only reversal row**(`reversal_of_id` child)와 **개념이 다름** — 문서·코드에서 혼용 시 KPI·forensic 오류.

### 반드시 문서화할 차이

| 용어 | 의미 |
|------|------|
| **reversal row** | 새 `payments` 행, `reversal_of_id →` 원본, amount는 양수 유지, KPI에서 차감 이벤트로 읽음 (`commerce-reversal.ts`, `platform-revenue.ts`). |
| **`status = reversed`** | 기존 행 UPDATE로 소멸 표시 (`reverse_disbursement.sql` 주석·UPDATE). **overwrite 계열**. |
| **cancelled** | `payments.status` CHECK **증분 기준에 없음** — 다른 도메인(`supplier_payables.cancelled` 등)과 혼동 주의. |

### 제안 표: `type` × 허용 `status` (초안)

| type (제안) | allowed `status` (목표) | append-only 적합 | overwrite 위험 |
|-------------|-------------------------|------------------|----------------|
| `storefront_collection` | `pending` → `confirmed` (운영상 필요 시); 원칙 확정 후 `reversed` **금지**하고 reversal row만 | 높음 | 낮음(정책 준수 시) |
| `storefront_reversal` | `reversed` 고정 또는 단일 종결 상태 | 높음 | 낮음 |
| `settlement_fee_inbound` | `confirmed` 고정(현행) | 높음 | 낮음 |
| `rfq_payable_schedule` | `pending` → `confirmed` → (레거시) `reversed` UPDATE | 중간 | **기존 UPDATE 경로** |
| `adjustment` | `confirmed` 단일 또는 소수 상태 | 중간 | 중간(권한·이유 필수) |

---

## SECTION 4 — lifecycle state machine (type별, 설계 초안)

### `storefront_collection` (목표)

```text
(optional pending) → confirmed
         ↘ storefront_reversal row (append-only, 원본 confirmed 유지)
```

| 전이 | 자동 | 관리자 | reversal | append-only 이벤트 | admin_logs |
|------|------|--------|----------|-------------------|------------|
| → confirmed | 주문 `paid` 확정 트리거에 연동 가능 | 현행: 관리자 상태 변경 | reversal row | 예 | `platform_payment_recorded` 등 현행 |

### `settlement_fee_inbound` (현행에 가까움)

```text
insert confirmed (단일 상태)
```

- **reversal**: 정책 미정 — append-only adjustment vs 금지.

### `rfq_payable_schedule` / disbursement (레거시 포함)

```text
pending → confirmed → (레거시) reversed via UPDATE
```

- **충돌**: storefront는 **UPDATE 금지** 방향, RFQ disbursement는 **UPDATE reversed** 존재 — **단일 state machine으로 통합 불가** until 레거시 이행.

---

## SECTION 5 — reversal 가능 type / 불가능 type (설계)

| type (제안) | reversal 가능 | 방식 | 조건 | chain |
|-------------|---------------|------|------|-------|
| `storefront_collection` | 예 | **append-only child** (`reversal_of_id`, amount 양수) | 원본 confirmed·중복 방지 유니크 | **1** (현 DB unique) |
| `storefront_reversal` | N/A | 자기 자신이 상쇄 이벤트 | — | 원본에 대해 1건 |
| `rfq_collection` | 정책 결정 | 미구현 표준화 | — | — |
| `settlement_fee_inbound` | 정책 결정 | adjustment 또는 child | — | — |
| `rfq_payable_schedule` | 사실상 예(레거시) | **status UPDATE reversed** | RPC 조건 | 제한적 |
| `payout_outbound` | 정책 결정 | append-only 권장 | — | — |
| `adjustment` | 해당 없음 | 새 adjustment 행 | 승인·사유 | — |

**권장**: 신규·storefront 축은 **append-only reversal row**만 표준으로 하고, RFQ disbursement의 **UPDATE reversed**는 **장기적으로 폐지 또는 별도 type으로 격리** 후 동일 패턴으로 이행.

---

## SECTION 6 — KPI aggregation 기준 (type별 정의, 설계)

| KPI | 포함 type (목표) | 제외 | reversal 처리 |
|-----|------------------|------|----------------|
| **storefront net revenue** | `storefront_collection` gross − `reversal_of_id` 행 합 | `order_id` RFQ·`settlement` | 차감 (`platform-revenue.ts` 현행과 동일 패턴) |
| **RFQ GMV / 수금** | `orders` 확정 + (수금 `payments` inbound, **`type` 정책 정렬 후**)) | storefront | 정책 미정 |
| **platform_margin (P0)** | net revenue − `supplier_payables` | `payments.type` 직접 아님 | payables 별도 테이블 |
| **settlement KPI (`getPlatformRevenue`)** | `orders` + `payments` **`type=settlement`** | storefront | **현행 코드 기준 reversal 미반영** |
| **receivable (ledger)** | `getCustomerLedger` inbound confirmed (`ledger.ts`) | storefront | **type 필터 없음** — 혼입 위험 |

**위험 요약**: `type`이 NULL인 행이 RFQ 수금·storefront·기타에 **공존**하면, **direction+status만으로는 KPI 분리 불충분** — taxonomy·백필 없이는 **표본 한도(예: 50k) 내에서만 의미** 있는 지표가 될 수 있음.

---

## SECTION 7 — settlement / payout type chain (설계)

목표 체인 (개념):

```text
supplier_payable confirmed (별도 테이블)
  → settlement_event (현: payments type settlement, RFQ order 기준)
  → payout_outbound (미구현: 실제 이체)
  → payout_reversal (선택)
```

| 단계 | accounting event? | operational? | 자동/수동 | KPI |
|------|---------------------|----------------|-----------|-----|
| `supplier_payables` | 예(채무) | 혼합 | 확정 시 insert | margin P0 |
| `settlement` payment | 예(수수료 인식) | 관리자 버튼 | 수동 | RFQ settlement 뷰 |
| payout | 예(현금 유출) | 운영 | 미구현 | 별도 |

**결론**: `settlement`과 **실제 payout**은 **다른 accounting event**로 보는 것이 장기적으로 맞다. 현재는 **후자가 `payments`에 표준화되어 있지 않다**.

---

## SECTION 8 — append-only compatibility 평가

| 구역 | 평가 | 근거 |
|------|------|------|
| storefront inbound + reversal | **높음** | 새 row만 추가, 유니크로 중복 방지 |
| `processSettlement` insert | **높음** | insert 한 번 |
| `reverse_disbursement` | **낮음** | **UPDATE `status=reversed`** — append-only 원칙과 충돌 |
| `accept_bid` outbound `planned` | **정합성 리스크** | CHECK와 문자열 불일치 가능 |
| taxonomy 추가만 | migration·백필 **비용 중~대** | RFQ·레거시 row `type` NULL 다수 |

**현실 평가**: **동일 테이블로 “완전 append-only ledger”까지 일괄 도달은 어렵다**. 레거시 UPDATE 경로를 **읽기 전용 레거시**로 격리하고, 신규 이벤트만 append-only로 통일하는 **하이브리드 이행**이 현실적.

---

## SECTION 9 — `ledger_entries` 필요성 평가

| 질문 | 판단 |
|------|------|
| `payments` 단일로 모든 accounting event 표현 가능? | **단기**: 가능(현 옵션 C). **중기**: type·링크·금액 정렬 후에도 **복식부기·계정과목·집계 재현**이 필요하면 부족해진다. |
| reversal chain | `reversal_of_id` + 유니크로 **깊이 1** 수준은 확보. **다단계 chain**은 별도 모델 필요. |
| settlement/payout lifecycle | **연결 키(`settlement_id` 등)** 없이는 **체인 추적이 약함** — `ledger_entries` 또는 **`payments`에 reference 컬럼 세트**로 보강 검토. |

**지금 당장 필요한가?** — **아니오 (P0/P1)**. storefront·reversal·margin P0는 `payments`+`supplier_payables`로 운영 가능.

**나중에 필요한가?** — **예**, 다음 신호가 있을 때: 복식부기·세무 계정·감사 샘플링 자동화·payout↔settlement **다대다**·국세/원천 분리.

---

## SECTION 10 — reverse-ledger 장기 방향

| 항목 | 현 구조 유지 비용 | reverse-ledger 전환 비용 |
|------|------------------|---------------------------|
| KPI | type NULL로 **필터 복잡도 증가** | 계정별 재작성·이행 테스트 대형 |
| settlement | `settlement`만 식별 용이 | 체인 모델 재정의 |
| supplier | payables는 이미 분리 | payments와 대사 규칙 증가 |

**권장 시점 (`ledger_entries` 또는 동등 모델)**: **payout 자동화·세무 계정·복식부기 요구가 생기는 분기** — 그 전까지는 **`payments.type` 정규화 + `reversal_of_id` 표준 + 레거시 UPDATE 격리**가 비용 대비 효과가 큼.

---

## SECTION 11 — migration 필요 목록 (설계만, 실행 금지)

1. **`payments.type`**: NOT NULL + CHECK 또는 enum (taxonomy 확정 후).
2. **백필 스크립트**: `commerce_order_id` 기반 → `storefront_collection`; `order_id`+inbound+비settlement → `rfq_collection`; 등 **룰 테이블**.
3. **`planned` vs CHECK**: 운영 `payments.status` 분포 조사 후 **`accept_bid` RPC와 CHECK 정합**.
4. (선택) **`payments.event_subtype`** / **`accounting_stream`** 등 second-axis — 정책 후.

---

## SECTION 12 — 구현 우선순위 제안 (P0 / P1 / P2)

| 단계 | 내용 |
|------|------|
| **P0** | 문서·정책 합의만 (본 문서 + `DECISIONS` 반영). |
| **P1** | `type` CHECK + 백필 + 앱 INSERT 경로에 type 강제; `reverse_disbursement` 롱텀 대체 설계. |
| **P2** | payout 표준화·`ledger_entries` 또는 reference graph·복식부기. |

---

## SECTION 13 — 사람이 결정해야 하는 정책 목록

1. **`type` 단일 컬럼 vs `domain`+`subtype` 이중축** 여부.  
2. **NULL type 허용 기간** — 즉시 금지 vs 이행 기간.  
3. **`settlement` 명칭 유지 vs `settlement_fee_inbound`로 리네임** (코드·리포트 영향).  
4. **RFQ 수금 `type` 없는 기존 row** 백필 룰·예외.  
5. **`reverse_disbursement` UPDATE** 를 언제까지 허용할지·폐지 일정.  
6. **`accept_bid` `planned` status** 를 CHECK와 어떻게 맞출지.  
7. **reversal chain 깊이 1 고정**을 제품 정책으로 채택할지.  
8. **`fee_event` 분리** 여부(플랫폼 fee vs 순매출).  
9. **payout 기록 위치** (`payments` only vs 은행 모듈 별도).  
10. **KPI에서 `type=NULL` 행 처리** — 제외 vs 추정 백필.

---

## 부록 A — INSERT 경로 요약 (파일·함수·핵심 필드)

| 경로 | 파일 | 함수/SQL | direction | status | type | 기타 식별자 |
|------|------|-----------|-----------|--------|------|-------------|
| storefront 입금 | `src/actions/admin/commerce.ts` | `tryRecordPlatformReceivablePayment` | inbound | confirmed | *(미설정)* | `commerce_order_id`, `payee_tenant_id`=플랫폼 |
| storefront reversal | `src/actions/admin/commerce-reversal.ts` | `createPaymentReversalRowInternal` | inbound | reversed | 원본과 동일(있을 때만) | `reversal_of_id`, `commerce_order_id` |
| RFQ 정산 수수료 | `src/actions/admin/settlement-control.ts` | `processSettlement` | inbound | confirmed | **`settlement`** | `order_id`=RFQ `orders.id` |
| RFQ 납품 대금(지급 예정) | `supabase/migrations/20260506150000_create_accept_bid_atomic.sql` | `accept_bid_atomic` 내부 | outbound | **planned** (파일 기준) | 없음 | `order_id` |
| 지급 + allocations | `supabase/migrations/20260507050000_create_disbursement_with_allocations.sql` | `create_disbursement_with_allocations` | outbound | pending | 없음 | `order_id` |
| 공급자 수금 | `src/actions/payment.ts` | `createPayment` → RPC `create_payment_atomic` | (RPC 내부) | confirmed 등 | **저장소에 RPC 본문 없음** | `customer_id`, inbound |

---

## 부록 B — KPI 함수별 필터 (코드 기준)

| KPI 함수 | 포함 `payments` | 제외 | reversal 처리 |
|----------|------------------|------|----------------|
| `getStorefrontRevenueKPI` | `commerce_order_id` NOT NULL, inbound, payee=플랫폼; gross=`confirmed`+`reversal_of_id` null; reversal=`reversal_of_id` not null | RFQ·settlement | net = gross − reversal 합 |
| `getPlatformRevenue` | `type=settlement` & confirmed (월 정산액); GMV는 `orders` | storefront | reversal 미명시 |
| `getUnifiedSettlementView` 등 | `order_id` in RFQ orders; inbound confirmed **`neq` settlement** vs **`eq` settlement** | storefront | 상이 |

---

**현재 구조의 append-only 한계**: RFQ disbursement **`reversed` UPDATE**·`type` **미설정 다수**·`planned`/`CHECK` **잠재 불일치**.  
**`ledger_entries` 필요 시점**: 복식부기·payout 체인·세무 계정이 요구될 때.  
**settlement/payout 위험**: 동일 테이블에 **수수료 inbound(`settlement`)**와 **실지급 outbound**가 혼재할 경우 **type 없이 조회하면 의미 혼동** — taxonomy·필터 강제가 선행된다.

---

## 사람이 결정해야 하는 정책 목록 (요약 반복)

위 **SECTION 13** 10항이 본 설계의 **승인 게이트**다. 이 목록이 확정되기 전까지 **`type` CHECK·NOT NULL 강제 migration 실행은 권장하지 않는다.**
