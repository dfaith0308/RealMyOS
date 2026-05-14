# APPEND-ONLY-CONVERGENCE-DESIGN-001 — append-only accounting 수렴 설계

> **범위**: 설계 문서만. 코드·migration 실행·DB 변경 없음.  
> **전제(고정)**: `DECISIONS.md` **[D-021]** · **[D-022]** · **[D-023]** · `payments` hybrid SSOT · settlement row append-only 불변 · `paid` = 지급 finality · **UPDATE `reversed` = transition debt** ([D-023] Q3).  
> **Epic 축(6)**: (1) outbound append-only 전환 (2) `reverse_disbursement` 제거 방향 (3) reversal chain 정책 closure (4) taxonomy enforcement 준비 (5) semantics alignment (6) outbound/storefront convergence.

---

## SECTION 1 — 사전 확인 결과 (두 패턴 현황 + 차이 분석)

### 1.1 `reverse_disbursement` (저장소 기준)

| 항목 | 사실 |
|------|------|
| **정의** | `supabase/migrations/20260507060000_create_reverse_disbursement.sql` — 함수 `public.reverse_disbursement(p_tenant_id uuid, p_payment_id uuid) RETURNS uuid`. |
| **UPDATE 대상** | `UPDATE public.payments SET status = 'reversed', updated_at = now() WHERE id = p_payment_id` — **`status`·`updated_at` 만 변경** (금액·`reversal_of_id` 등 없음). |
| **선행 검증** | `direction = 'outbound'` AND `(payer_tenant_id OR tenant_id) = p_tenant_id` AND `status != 'reversed'`; `p_tenant_id = get_my_tenant_id()`. |
| **호출** | `src/actions/payment.ts` **`cancelDisbursement`** → `supabase.rpc('reverse_disbursement', { p_tenant_id, p_payment_id })`. UI: `src/components/disbursements/DisbursementsClient.tsx`. |
| **`reversal_of_id`** | **RPC에서 사용·설정하지 않음**. |
| **`admin_logs`** | **RPC 내부 없음**. `cancelDisbursement` 액션도 **insertAdminLog 호출 없음**(본 파일 기준). |
| **후속 처리** | `payment_allocations`에서 `purchase_id` 수집 → 각 `purchases`에 대해 `effective_paid` = `SUM(allocated_amount)` JOIN `payments` **`status IN ('pending','confirmed')`** 만 집계 → **`purchases.status`** 를 `paid` / `partial` / `unpaid` 로 **UPDATE**. `payment_allocations` 행은 **삭제하지 않음**(주석). |
| **settlement 영향** | 본 RPC는 **outbound 지급 취소**만 다룸. **`type='settlement'` RFQ 수수료 inbound** 와 **직접 연결 없음**. |
| **KPI** | 관리자 storefront KPI(`getStorefrontRevenueKPI` 등)는 **본 RPC 미호출**. RFQ·매입 축 집계와 분리. |

### 1.2 Storefront reversal (`commerce-reversal.ts` + migration)

| 항목 | 사실 |
|------|------|
| **함수** | `createPaymentReversalRowInternal` / `createPaymentReversalRow` — `commerce_order_id` 기준. |
| **원본 선택** | `payments` **inbound**·`status='confirmed'`·`reversal_of_id IS NULL`·`commerce_order_id = oid` **maybeSingle**. |
| **INSERT** | **신규 row** — `reversal_of_id = origId`, `reversal_reason`, `reversed_by`, `reversed_at`, 금액은 원본과 동일, `status: 'reversed'`(상쇅 row), `memo`에 `[reversal]` 접미. `type`/`settlement_memo`는 원본 있으면 복사. |
| **원본 row** | **UPDATE 없음** — 원본은 **`confirmed` 유지**. |
| **중복 방지** | `payments_reversal_of_id_unique` (`reversal_of_id` NOT NULL 시 UNIQUE) + 사전 `dup` 조회; DB `23505` 시 skip. |
| **`admin_logs`** | 성공 시 `commerce_payment_reversal_created`, 실패 시 `commerce_payment_reversal_failed`. |
| **KPI** | `getStorefrontRevenueKPI`: gross = `reversal_of_id IS NULL` + `confirmed`; reversal 합 = `reversal_of_id NOT NULL`; `payment_date` 기준 구간 합. |
| **migration** | `20260515500000_add_reversal_fields.sql` — `reversal_of_id` 컬럼·부분 유니크 인덱스. |

### 1.3 추가 확인: 공급자OS **inbound** 수금 취소 (`cancelPayment`)

| 항목 | 사실 |
|------|------|
| **경로** | `src/actions/payment.ts` **`cancelPayment`** — 동일 테넌트 `payments` 조회 후 **`update({ status: 'reversed' })`** (금액 불변). |
| **주석** | “ledger가 confirmed만 집계하므로 취소 시 자동으로 잔액 원복”. |
| **의미** | **storefront append-only reversal(INSERT)** 과 달리, **RFQ outbound와 동일하게 `status` 전이로 효력 소멸**을 표현하는 **세 번째 transition 패턴**(inbound·공급자 UI). |

### 1.4 두 패턴(＋α) 차이 요약

| 차원 | **패턴 A — storefront 상쇅 row (INSERT)** | **패턴 B — outbound `reverse_disbursement` (UPDATE)** | **패턴 α — `cancelPayment` inbound (UPDATE)** |
|------|------------------------------------------|------------------------------------------------------|-----------------------------------------------|
| 효력 소멸 | **새 row** + 링크 | **동일 row** `status` 변경 | **동일 row** `status` 변경 |
| `reversal_of_id` | **있음** | **없음** | **없음** |
| Forensic | 원본·상쇅 **이중 행** 추적 용이 | **한 행**만 보이며 “언제 reversed 됐는지”는 `updated_at` 의존 | 패턴 B와 유사 |
| KPI | **`reversal_of_id`** 로 gross/net 분리 가능 | 집계에서 **`status=reversed` 제외** 패턴(매입 `effective_paid` 등) | confirmed 집계에서 제외 |
| Append-only 적합성 | **높음** ([D-021] 목표와 정합) | **낮음** (행 의미가 **시간에 따라 변함**) | **낮음** |
| **왜 A가 reference model인가** | 금액·연결 ID **불변 row**를 남기고, 상쇄를 **별 이벤트**로 분리해 **[D-021]**·**[D-023]** 의 “correction = 새 이벤트”와 **동일한 언어**를 쓸 수 있음. |

### 1.5 Taxonomy enforcement — **저장소만으로 확인 가능한 사실**

| 항목 | 사실 |
|------|------|
| **`payments.type` NULL 비율** | **저장소만으로는 운영 DB 비율 산출 불가** — COUNT는 **DB 조회 필요**(본 설계 턴 미실행). |
| **`type = 'settlement'`** | `settlement-control.ts` **`processSettlement`** INSERT에 명시. 집계·히스토리에서 `.eq('type','settlement')` 사용. |
| **storefront inbound INSERT** | `commerce.ts` `tryRecordPlatformReceivablePayment` payload에 **`type` 필드 없음** — **NULL 가능**(스키마 기본). |
| **outbound INSERT** | `create_disbursement_with_allocations` SQL 컬럼 목록에 **`type` 없음** — **NULL 가능**. |
| **type 강제 가드** | **신규 row에 `type` 필수를 강제하는 공통 Server Action/RPC 검증**은 본 턴 코드 검색상 **미존재**([D-022] 방향과 별도). |
| **KPI `type` 의존** | storefront KPI는 **`commerce_order_id`·`reversal_of_id`·`status`** 중심. RFQ settlement KPI는 **`type=settlement`**. |

### 1.6 Reversal chain (저장소 기준)

| 항목 | 사실 |
|------|------|
| **UNIQUE** | `payments_reversal_of_id_unique` — **원본당 reversal child 최대 1건** (storefront inbound 상쇅). |
| **reverse of reversal** | **전용 경로 없음**. DB상으로 “reversal row를 `reversal_of_id` 원본으로 하는 또 다른 row”는 **정책 미정의**. |
| **adjustment fallback** | **전용 `adjustment` INSERT 경로 없음**(코드 검색 범위 내). |

---

## SECTION 2 — outbound append-only 전환 방식 (A/B/C 비교 + 권장안)

### 방식 A: 신규 RPC로 교체 (`reverse_disbursement` 폐기)

| 기준 | 평가 |
|------|------|
| 코드 영향 | **큼** — 호출부·문서·권한 전부 교체 |
| 정합성 위험 | 이행 중 **이중 취소** 방지 필요 |
| rollback | 구버전 RPC 복구로 **가능하나** 운영 혼선 |
| migration | **필수** — 새 함수·권한·인덱스 |
| 운영 중단 | **중~높음**(빅뱅 배포 시) |
| append-only | **가장 명확** |
| debt 관리 | 레거시 제거가 빠름 |

### 방식 B: 동일 함수명·래퍼 내부만 INSERT

| 기준 | 평가 |
|------|------|
| 코드 영향 | 클라이언트 **변경 최소** |
| 정합성 | 함수명은 유지하나 **동작이 INSERT로 바뀌어** 운영자 교육·모니터링 필요 |
| migration | **필수** — `reversal_of_id` outbound 의미·CHECK |
| append-only | **가능** |
| debt 관리 | “이름은 reverse_disbursement인데 실제는 INSERT” **혼동 위험** |

### 방식 C: 신규 경로 추가 + 레거시 점진 deprecate (**권장**)

| 기준 | 평가 |
|------|------|
| 코드 영향 | **단계적** — 신규 RPC + 기존 유지 기간 |
| 정합성 | **병행 기간**에 규칙·대시보드로 **이중 패턴 감시** 필요 |
| rollback | 레거시 RPC **유지**로 **용이** |
| migration | **단계적** — 컬럼·인덱스 먼저, RPC 후 |
| 운영 중단 | **상대적 최저** |
| append-only | 최종적으로 **동일 목표** 도달 |
| debt 관리 | **[D-023]** “즉시 강제 전환 금지”와 **정합** |

**권장안: 방식 C**를 1순위로 한다. 필요 시 **B(래퍼)** 를 “호출부 변경 최소화” 보조 수단으로 **C의 2단계와 결합**할 수 있다.

---

## SECTION 3 — `reverse_disbursement` 제거(대체) 순서 설계

> **목표**: outbound 취소 = **INSERT 상쇅 row** + `reversal_of_id`(또는 동등 링크) + `purchases` 재계산 규칙을 **INSERT 기반 집계**에 맞춤.

| 단계 | 내용 | 선행 조건 | 검증 | rollback | migration | KPI·로그 |
|------|------|-----------|------|----------|-----------|----------|
| **1** | **신규 INSERT 경로** (예: `record_outbound_payment_reversal` 또는 동등) — 원본 outbound **유지**·상쇄 row **추가**·`purchases` 합산을 **`reversal_of_id` 또는 `status` 규칙 통일** 문서화 | **[D-023]** lifecycle·[D-022] taxonomy 순서 합의 | 스테이징에서 취소 전후 **`payment_allocations`·`purchases`** 샘플 비교 | 레거시 RPC **유지** | **필요** — outbound용 `reversal_of_id` 의미·nullable·UNIQUE 정책 | 매입 KPI 쿼리 **조건 변경** 시 회귀 |
| **2** | **레거시 deprecate** — 문서·주석·관리자 공지; 신규 경로 **기본** | 1 통과 | 호출 비율 모니터링 | 신규 경로 비활성화 | 없음 | `admin_logs` **신규 액션 타입** 권장 |
| **3** | **데이터 정합성 검증** — 과거 `UPDATE reversed` 행과 신규 상쇅 row **공존 기간** 리포트 | 2 안정화 | 배치 리포트 | — | 선택적 **백필 스크립트**(승인별도) | — |
| **4** | **레거시 UPDATE 경로 제거** | 3 완료·감사 승인 | 전체 회귀·운영 리허설 | **함수 복원** migration | **DROP/REPLACE** | — |

**즉시 제거 금지 이유** ([D-023]과 정합): 운영 DB에 **이미 적용된 RPC**·매입 집계 로직이 **`status=reversed` 전제**로 동작; 무중단 이행·`purchases` 정합·권한·RLS를 **준비 없이 바꾸면** 미수·매입 상태 **오염 위험**.

---

## SECTION 4 — reversal chain 정책 closure

### 4.1 depth 1 고정 근거 (정책·기술)

- **KPI**: storefront는 이미 **gross − reversal row** 단순 모델 — depth>1 시 **중첩 차감·이중 카운트** 위험.
- **Forensic**: `payments_reversal_of_id_unique` 가 **1:1 상쇅**을 사실상 강제.
- **운영 실수**: 다단 reversal은 **원인 추적·승인** 비용 급증.
- **settlement / payout** ([D-023]): finality 이후는 **adjustment** — chain 확장과 **충돌**.
- **대사**: 은행·매입·수수료 **삼자 대사**는 **단일 상쇄 링크**가 안전.

### 4.2 reverse-of-reversal

- **정책**: **금지 방향** — 오류·중복 입금은 **`adjustment` 전용 이벤트**(INSERT, 사유·승인자·`admin_logs` 필수)로 분리.
- **UX**: “reversal 취소” 버튼 대신 **“조정 기록”** 워딩 권장.

### 4.3 reversal 이후 재주문

- **권장**: **신규 `commerce_orders` + 신규 payments** — 기존 `reversal_of_id` 체인에 **재연결하지 않음**. 동일 주문 “재활성화”는 **비권장**(이력 붕괴).

---

## SECTION 5 — taxonomy enforcement 준비 설계 ([D-022] 정합)

### 5.1 신규 row `type` 강제 — 수단 비교

| 수단 | 장점 | 단점 |
|------|------|------|
| Server Action 가드 | 배포 빠름·비즈니스 규칙 표현 용이 | 클라이언트·RPC 우회 시 **틈** |
| DB CHECK / NOT NULL | **강한 SSOT** | 백필·순서 없이면 **INSERT 실패** |
| RPC validation | 지급·지출 **원자 구간**에 집중 | 앱 분산 INSERT는 **별도 가드** 필요 |
| **복합** | **[D-022]** 순서와 정합 | 구현·운영 복잡도↑ |

**준비**: P1 이전에는 **Server Action + 주요 RPC** 우선, **CHECK는 백필 후**.

### 5.2 NULL legacy backfill (설계만)

- **우선순위**: **storefront `commerce_order_id` inbound** (KPI·reversal 직결) → **RFQ outbound/inbound** → **`settlement`** (의미 이미 고정).
- **실패 시**: **트랜잭션 단위** 백필·**dry-run** 리포트·**rollback** 스크립트(별 승인).
- **Forensic**: 백필 전후 **`admin_logs`** 또는 execution log에 **배치 ID** 남김.

### 5.3 enforcement 검증

- **`type IS NULL` 모니터링**: 일별 COUNT(운영 배치).
- **KPI**: NULL row **제외·별도 버킷** 규칙을 `platform-revenue`·RFQ 집계 문서에 고정.
- **Drift**: `CONTEXT.md` **[SCHEMA-DRIFT-001]** 절차와 연동.

---

## SECTION 6 — semantics alignment 수렴 순서

| 순서 | 단계 | 선행 정책 | 구현 범위(개념) | KPI | Forensic | 검증 |
|------|------|-----------|-----------------|-----|----------|------|
| 1 | **Storefront inbound 상쇅** | [D-021] | **완료(P0)** — INSERT reversal | reversal-aware net | `admin_logs` | 운영 리허설 |
| 2 | **Outbound append-only** | [D-023] Q3 | **P1** — §2·§3 | 매입 `effective_paid` 조건 변경 | 상쇅 row + 로그 | 매입 샘플 |
| 3 | **Settlement correction** | [D-023] Q2 | **P2** — adjustment 이벤트만 | RFQ settlement KPI | 이벤트 체인 | 감사 시나리오 |
| 4 | **Payout lifecycle** | [D-023] Q1 | **P2** — `paid`·payout 이벤트 | `platform_margin` 정확도 | 대사 키 | 은행 대사 |

**추가 부채(문서화)**: **`cancelPayment`(inbound UPDATE)** 는 **패턴 α** — 장기적으로 **INSERT 상쇅 또는 “취소 이벤트 테이블”** 로 맞출지 **§11 결정**.

---

## SECTION 7 — 수렴 완료 시 `payments` 최종 모델(목표)

- **모든 inbound collection**: INSERT `confirmed` 원본 → 취소·환불은 **INSERT** 상쇅 + `reversal_of_id` (**또는** 동등 링크 스키마).
- **모든 outbound disbursement**: INSERT `pending`/`confirmed` 원본 → 취소는 **INSERT** 상쇅 + 링크; **`effective_paid`** 는 **확정+미상쇅** 규칙으로 통일.
- **adjustment**: **항상 INSERT** 별도 `type`/이벤트.
- **overwrite**: **없음** (금액·주문 연결 키 불변).
- **settlement** (`type='settlement'`): **[D-022]** 명칭 유지하되 **[D-023]** 의미 — **인식 이벤트**; 정정은 **별 row**.
- **payout**: `payments` 또는 연결 테이블에 **자금 사실** 이벤트([D-023]) — 본 문서는 **위치만 예약**.
- **taxonomy**: 모든 신규 row **`type` 필수** + CHECK([D-022] P1).

---

## SECTION 8 — transition debt 목록 및 우선순위

| # | debt | 위험도(상대) | 우선순위 |
|---|------|--------------|----------|
| 1 | **`reverse_disbursement` UPDATE outbound** | **높음** — append-only·forensic과 불일치 | **P1** |
| 2 | **`cancelPayment` UPDATE inbound** (공급자OS) | **중~높음** — storefront와 **이중 철학** | **P1~P2** |
| 3 | **`payments.type` NULL 다수** | **중간** — 집계·필터 혼선 | **P1** ([D-022]) |
| 4 | **settlement 정정 경로 부재** | **중간** — 운영 “삭제” 유혹 | **P2** ([D-023]) |
| 5 | **payable `paid`·payout 이벤트 미구현** | **중간** — margin·finality | **P2** ([D-023]) |

---

## SECTION 9 — migration 필요 목록 (실행 금지)

1. Outbound용 **`reversal_of_id`** (또는 별 UUID 링크)·**부분 UNIQUE** — 원본당 상쇅 1건 등.
2. **`effective_paid` / KPI** SQL·뷰를 **INSERT 상쇅**에 맞게 변경.
3. **`reverse_disbursement`**: REPLACE → 신규 본문 또는 **신규 함수 + GRANT**.
4. **선택**: 과거 `UPDATE reversed` 행에 대한 **읽기 전용 뷰** “legacy_reversed”.
5. **`type` CHECK / NOT NULL** — [D-022] 백필 후.

---

## SECTION 10 — 구현 우선순위 제안 (P0 / P1 / P2)

| 단계 | 내용 |
|------|------|
| **P0** | 본 문서·`tasks.md`·운영 런북에 **패턴 A/B/α** 명시; **즉시 RPC 제거 금지**. |
| **P1** | **방식 C**로 outbound INSERT 상쇅 도입·`reverse_disbursement` deprecate·집계 조건 이행·**[D-022]** type 가드 1차. |
| **P2** | settlement adjustment·payout·`cancelPayment` 수렴·double-entry 검토. |

---

## SECTION 11 — 사람이 결정해야 하는 정책 목록

1. Outbound 상쇅 row의 **`status`** 값(`reversed` vs `confirmed`+부호 반대 등) — KPI·CHECK와 **일관**.  
2. **`reversal_of_id` outbound UNIQUE** — 지급 분할·부분취소 시 **허용 깊이**.  
3. **패턴 α (`cancelPayment`)** — storefront와 **동일 INSERT 모델로 통일할지**·시점.  
4. **병행 기간** 최대 허용 기간·**강제 컷오버** 일정.  
5. **백필** 시 `type` 추론 규칙 **승인 주체**.  
6. **adjustment** `type` 문자열·**감사 필수 필드**.  
7. **외부 은행 대사**를 `payments` 안에 둘지 **별 테이블**할지.

---

## 필수 리스크·대안 요약

| 주제 | 내용 |
|------|------|
| **두 패턴 공존 실제 위험** | 동일 테이블에서 **“취소=새 row” vs “취소=UPDATE”** 혼재 → 운영·감사·쿼리 **오해**·이중 집계 버그. |
| **수렴 불가 시 대안** | `payments`는 **사실만** 두고 **`payment_events` append-only** 로 전면 이전(대규모) — **P2 이후** 검토. |
| **taxonomy 선행 조건** | [D-022] **lifecycle·semantics 확정**([D-023]) 후 백필·CHECK. |
| **depth 1 근거** | §4.1 + DB **UNIQUE** 사실. |
| **outbound 전환 리스크** | **`purchases.status` 재계산**·기간 중 **이중 취소**·RLS·권한. |

---

## 연계 문서

- `docs/ACCOUNTING-LIFECYCLE-DESIGN-001.md`, **`DECISIONS.md` [D-021] [D-022] [D-023]**  
- `docs/PAYMENTS-TAXONOMY-DESIGN-001.md`, `docs/ACCOUNTING-EVENT-MODEL-001.md`  
- `tasks.md` **`[PLATFORM-ERP-001]`**, **[ACCOUNTING-REVERSAL-P0-001]**, **[KPI-REVERSAL-P0-001]**

---

**본 문서는 append-only 수렴 설계 단계이며, 실제 outbound 전환은 P1 범위**에서 별도 승인·migration으로 수행한다.

**현재 outbound accounting은 transition debt 상태이며, storefront append-only semantics로 점진 수렴 예정**이다.
