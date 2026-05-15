# APPEND-ONLY-CONVERGENCE-P1-SPEC-001 — P1 구현 범위 명세

> **성격**: **구현 전 참고용 범위 명세서**이다. 구현 지시문·구현 완료 보고서가 아니다.  
> **정책 고정**: `DECISIONS.md` **[D-021]** · **[D-022]** · **[D-023]** · **[D-024]** · 설계 [`APPEND-ONLY-CONVERGENCE-DESIGN-001.md`](./APPEND-ONLY-CONVERGENCE-DESIGN-001.md).  
> **Epic**: 구현 시 **`[APPEND-ONLY-CONVERGENCE-P1-001]`** (`tasks.md`). 정책 닫기는 **`[APPEND-ONLY-CONVERGENCE-POLICY-001]`** + **[D-024]**.

---

## 0. P1에서 하지 않는 것 (제외 범위, 고정)

- legacy **`type` NULL backfill**
- DB **`CHECK` / `NOT NULL`** enforcement
- **settlement correction** 이벤트·RPC
- **payout lifecycle**·**`supplier_payables.paid`** 전이 구현
- **partial cancellation** (할부·부분취소)
- **external reconciliation** (은행 대사 자동화)
- **double-entry ledger**
- **settlement** append-only correction (별 정책·P2)
- **reverse-of-reversal** 허용
- **adjustment taxonomy** 확정

---

## 대상 1: `reverse_disbursement` → append-only (outbound)

### 현재 (사실)

- RPC `public.reverse_disbursement(uuid, uuid)` — `payments` **`UPDATE status='reversed'`** 만 수행 (`supabase/migrations/20260507060000_create_reverse_disbursement.sql`).
- `payment_allocations` 보존, `purchases.status` 재계산.

### 목표 (P1)

- **신규 INSERT** 상쇅 row: 원본 row **유지** · **`reversal_of_id` = 원본 `id`** · **`amount` = 원본 `amount` (양수)** · **`status = 'reversed'`** (상쇅 row 의미는 [D-024] Q1과 storefront P0 정합).
- **원본 row에 대한 `UPDATE` 금지**(효력 소멸은 상쇅 row로만 표현).

### 구현 명세 (이름은 예시 — 실제 식별자는 구현 턴에서 확정)

**신규 RPC 또는 Server Action (예: `insert_outbound_reversal`)**

입력(개념): `payment_id`, `reason`, `admin_user_id` (또는 세션에서 유도).

동작 순서:

1. **원본 payment 조회** — `direction = 'outbound'`, 테넌트 일치, `status` 가 취소 가능 상태(예: `confirmed`/`pending` — **현행 RPC와 동일 전제를 문서화한 뒤** 구현).
2. **`reversal_of_id IS NULL`** 인 원본에 대해 **이미 상쇅 row 존재 여부** 검사 — 중복 시 거절 또는 idempotent skip(정책은 구현 턴에서 단일화).
3. **신규 row INSERT**  
   - `direction` = 원본과 동일  
   - `status` = `'reversed'`  
   - `amount` = **원본과 동일한 양수** ([D-024] Q1)  
   - `reversal_of_id` = 원본 id  
   - `reversal_reason`, `reversed_by`, `reversed_at`  
   - 기타 FK·`order_id`·`payment_allocations` 연계는 **원본 복사 규칙**을 명세서 부록으로 적을 것(구현 턴).
4. **`purchases.status` 재계산** — **기존 `reverse_disbursement`와 동일한 경제적 의미**를 유지하도록, 집계 조건을 **`payments.status IN ('pending','confirmed')` 만이 아니라** 상쇅 row 모델에 맞게 **조정**한다(구현 턴에서 SQL 확정; 본 명세는 “semantics 유지”만 고정).
5. **`admin_logs`**  
   - 성공: `outbound_payment_reversal_created` (또는 동일 의미의 `action_type`)  
   - 실패: `outbound_payment_reversal_failed`
6. **원본 row `UPDATE` 금지**.

### `reverse_disbursement` (기존 RPC)

- **즉시 제거 대상 아님** — **deprecated transition debt**로 표시.
- 신규 경로 **검증·KPI·운영 리허설 완료 후** 제거 또는 내부 위임(별 migration 승인).

### migration (명세만, **실행 금지**)

- outbound(및 필요 시 공통)에 대한 **`reversal_of_id` 부분 UNIQUE** — 원본당 상쇅 1건 등([D-024] depth 1 방향과 정합).
- 기존 **이미 `UPDATE`로 `reversed` 된 행**과 신규 INSERT 방식의 **공존 기간** 리포트·검증 쿼리.

---

## 대상 2: `cancelPayment` → append-only (inbound, 패턴 α)

### 현재 (사실)

- `src/actions/payment.ts` **`cancelPayment`** — `update({ status: 'reversed' })` ([D-024] Q2).

### 목표 (P1)

- **신규 경로 (예: `insert_inbound_payment_reversal`)** — storefront `createPaymentReversalRow` 와 **동일 철학**: 원본 유지·상쇅 INSERT·`reversal_of_id`·**amount 양수**.
- **`cancelPayment`는 deprecate** 표시 후, 내부에서 신규 경로 호출하거나 호출부 이전(구현 턴에서 단일화).

### 주의

- **공급자 미수 집계**(`cancelPayment` 주석: confirmed만 집계)는 **상쇅 row 모델**에 맞게 조정 필요 — **KPI·ledger 쿼리 회귀** 필수.

---

## 대상 3: `type` 가드 1차 ([D-022] 유지)

### 목표

- **신규 accounting 의미의 `payments` INSERT**에는 **`type` 필수** — 없으면 **거절**.
- **legacy NULL 유지** — backfill 없음.
- **DB `NOT NULL`/`CHECK` 아님** — [D-022] sequencing 유지.

### 구현 명세 (개념)

- **Server Action** 및 **`create_disbursement_with_allocations` 등 주요 RPC** 입력에 validation.
- 거절 시 **`admin_logs`**: `payment_type_missing_rejected` (또는 동일 의미).

---

## P1 구현 순서 (권장)

1. `insert_outbound_reversal`(가칭) 구현 + 단위·스테이징 검증  
2. `cancelPayment` deprecate 준비 + inbound 상쇅 경로  
3. `type` 가드 1차  
4. **KPI** gross/net·매입 `effective_paid` **회귀 검증**  
5. `admin_logs`·운영 리허설

---

## P1 완료 기준 (검증 체크리스트)

- [ ] outbound **INSERT** 상쇅 경로가 **운영 승인 환경**에서 동작  
- [ ] inbound **`cancelPayment` 대체 경로** 동작  
- [ ] **`amount` 양수** 유지(원본·상쇅 모두)  
- [ ] **`reversal_of_id`** 연결·중복 방지  
- [ ] **`admin_logs`** 성공/실패 기록  
- [ ] **KPI** gross/net 및 매입 관련 집계 **정합**  
- [ ] **`type` 가드**로 신규 무type INSERT 차단  
- [ ] storefront **[KPI-REVERSAL-P0-001]** 와 **충돌 없음**(회귀)

---

## transition debt (P1 전후)

| 패턴 | 현재 | P1 후 (목표) |
|------|------|--------------|
| A storefront | INSERT append-only | 동일 |
| B outbound RPC | UPDATE `reversed` | **INSERT 우선 + RPC deprecated** |
| α `cancelPayment` | UPDATE `reversed` | **INSERT 우선 + 경로 deprecated** |

- **즉시 제거 금지** · **운영 semantics 보존** · **`purchases.status` 오염 방지** · **단계적 수렴** ([D-023]·[D-024]).

---

**구현은 별도 지시·별 브랜치·승인된 migration 후 진행한다.**
