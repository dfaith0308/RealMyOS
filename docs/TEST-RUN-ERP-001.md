# TEST-RUN-ERP-001 — storefront → ERP 회계 숫자 정합성 검증 가이드

> **문서 성격**: UI·기능 테스트가 아니라 **회계 숫자·중복·역방향 동기화·RLS**를 검증하는 운영자용 **손 실행** 가이드이다.  
> **범위**: 본 문서는 **실행 지시가 아니다**. 정무님이 나중에 순서대로 수행·기록할 때 사용한다.  
> **금지**: settlement 자동화·supplier 실지급(payout)·미구현 액션 타입을 **구현된 것처럼** 가정하지 않는다.

**목표**: “버튼은 되는데 **숫자가 틀리는 상태**”를 조기에 발견한다.

**코드 기준점 (저장소 확인, 2026-05-14 기준)**:

- storefront `paid` 확정 시 `tryRecordPlatformReceivablePayment` → `payments` inbound 1건(멱등: `commerce_order_id` 중복 시 INSERT 생략). `updateCommerceOrderStatus` → `createCommerceOrderAllocations`.
- `commerce_order_allocations`: 품목당 **UNIQUE(`commerce_order_item_id`)**.
- `payments`: `commerce_order_id IS NOT NULL` 인 행에 대해 **부분 UNIQUE 인덱스** (`20260515100000_add_commerce_order_id_to_payments.sql`).
- 주문 `cancelled` 시 `cancelPendingCommerceOrderAllocationsForOrder` → **`status = 'pending'`인 allocation만** `cancelled` + `cancelled_at`/`cancelled_by`. **`confirmed` allocation은 자동 롤백되지 않음**.
- allocation **확정(confirmed)** 시 `supplier_payables` INSERT(멱등: `commerce_order_allocation_id` UNIQUE).
- 수수료: `platform_fee_amount = round(item_amount * feePercentNumerator / 100)`, `supplier_payable_amount = item_amount - platform_fee_amount` (`commerce-allocation.ts` — `feePercentNumerator`는 `admin_settings.platform_fee_rate` 정수 퍼센트).

---

## STEP 0 — 사전 환경 확인

다음을 **SQL 또는 관리자 UI**로 확인하고, 값을 메모해 두면 이후 STEP에서 비교하기 쉽다.

### 0-1. `platform_fee_rate` (정수 %)

관리자 정책 키 `platform_fee_rate`는 **정수 퍼센트 분자**로 쓰인다 (예: `3` = 3%). allocation 행의 `platform_fee_rate` 컬럼은 **소수 비율**(예: `0.1000` = 10%)로 스냅샷 저장된다.

```sql
SELECT key, value
FROM admin_settings
WHERE key = 'platform_fee_rate';
```

### 0-2. 공급자 테넌트·listing 연결

특정 공급자명(예: 해내음코리아)은 **환경마다 `tenants.id`가 다르다**. UUID를 문서에 박지 말고, 아래처럼 **이름으로 조회해 메모**한다.

```sql
-- 예: 이름으로 테넌트 후보 확인 (실제 컬럼명은 스키마에 맞게 조정)
SELECT id, name
FROM tenants
WHERE name ILIKE '%해내음%'
   OR name ILIKE '%해내음코리아%'
LIMIT 20;
```

```sql
-- listing ↔ supplier_tenant_id (NULL 이면 allocation 시 owner/product 규칙으로 보완)
SELECT
  id,
  supplier_tenant_id,
  owner_type,
  owner_tenant_id,
  status
FROM commerce_product_listings
WHERE deleted_at IS NULL
ORDER BY updated_at DESC
LIMIT 20;
```

### 0-3. migration 적용 여부 (파일명 = 저장소 기준)

운영 DB에서 **아래 파일들이 적용됐는지** 배포 기록·migration 이력과 대조한다.

| 파일 | 내용 |
|------|------|
| `20260515100000_add_commerce_order_id_to_payments.sql` | `payments.commerce_order_id`·부분 UNIQUE·CHECK |
| `20260515200000_create_commerce_order_allocations.sql` | `commerce_order_allocations`·listing `supplier_tenant_id` |
| `20260515210000_commerce_order_allocations_cancel_audit.sql` | `cancelled_at` / `cancelled_by` |
| `20260515220000_create_supplier_payables.sql` | `supplier_payables`·RLS |

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'commerce_order_allocations',
    'supplier_payables'
  );
```

### 0-4. `PLATFORM_OWNER_TENANT`·`payments` 방향

플랫폼 owner 테넌트 상수는 코드에 정의되어 있다 (`realmyos/src/actions/admin/commerce.ts`, `commerce-allocation.ts` 등 — 값은 저장소에서 확인). storefront bridge로 들어가는 **수금(inbound)** 행은 `payee_tenant_id`가 플랫폼 owner인 형태로 기록된다.

```sql
SELECT DISTINCT
  direction,
  payer_tenant_id,
  payee_tenant_id
FROM payments
WHERE commerce_order_id IS NOT NULL
LIMIT 20;
```

### 0-5. `commerce_product_listings.deleted_at`

스키마에 **`deleted_at`** 컬럼이 있다 (`20260509010000_create_commerce_tables.sql`). STEP 0-2 쿼리에서 `deleted_at IS NULL`로 운영 listing만 본다.

### 0-6. `supplier_payables` RLS

migration `20260515220000_create_supplier_payables.sql` 기준: 관리자 `is_admin()` 전체, 공급자는 **`supplier_tenant_id = get_my_tenant_id()`** 로 SELECT만.

```sql
-- Supabase 대시보드 또는 migration 파일로 정책 존재 확인 (운영에서 직접 변경 금지)
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.supplier_payables'::regclass;
```

---

## STEP 1 — receivable / allocation / supplier_payables 숫자 정합성

**목적**: 주문이 **`paid`**로 확정된 뒤, **수금(`payments`)·allocation·(확정 시) supplier_payables**의 합계가 같은 “한 덩어리”의 돈인지 검증한다.

### 실행 순서 (손 실행)

1. 식당 계정으로 storefront에서 주문 1건 생성(가능하면 **단일 품목**으로 시작).
2. 관리자OS `/admin/commerce/orders`에서 **입금 확인 등으로 `paid`** 처리 (`TEST-RUN-001` STEP 8과 동일 축).
3. 동일 주문에 대해 allocation이 생성됐는지 관리자 화면 또는 SQL로 확인.
4. 필요 시 `/admin/commerce/allocations`에서 **지급 예정 확정** → `supplier_payables` 생성 여부 확인.

### 검증 SQL

```sql
-- 최근 storefront 연동 payments
SELECT
  p.id,
  p.commerce_order_id,
  p.amount,
  p.direction,
  p.status,
  p.payment_date,
  p.created_at
FROM payments p
WHERE p.commerce_order_id IS NOT NULL
ORDER BY p.created_at DESC
LIMIT 10;
```

```sql
-- allocation (최근)
SELECT
  a.id,
  a.commerce_order_id,
  a.commerce_order_item_id,
  a.supplier_tenant_id,
  a.item_amount,
  a.platform_fee_rate,
  a.platform_fee_amount,
  a.supplier_payable_amount,
  a.status
FROM commerce_order_allocations a
ORDER BY a.created_at DESC
LIMIT 10;
```

```sql
-- supplier_payables (최근)
SELECT
  sp.id,
  sp.commerce_order_allocation_id,
  sp.payable_amount,
  sp.platform_fee_amount,
  sp.item_amount,
  sp.status
FROM supplier_payables sp
ORDER BY sp.created_at DESC
LIMIT 10;
```

```sql
-- 주문 단위 정합성 (단일 payment 가정 + allocation 합계)
-- cancelled allocation을 제외할지 여부는 운영 정의에 맞게 WHERE 조정
SELECT
  o.id AS order_id,
  o.total_amount AS order_total,
  p.amount AS payment_amount,
  COALESCE(SUM(a.item_amount) FILTER (WHERE a.status IN ('pending', 'confirmed')), 0) AS allocation_item_sum,
  COALESCE(SUM(a.platform_fee_amount) FILTER (WHERE a.status IN ('pending', 'confirmed')), 0) AS fee_sum,
  COALESCE(SUM(a.supplier_payable_amount) FILTER (WHERE a.status IN ('pending', 'confirmed')), 0) AS payable_sum
FROM commerce_orders o
LEFT JOIN payments p ON p.commerce_order_id = o.id
LEFT JOIN commerce_order_allocations a ON a.commerce_order_id = o.id
WHERE o.payment_status = 'paid'
GROUP BY o.id, o.total_amount, p.amount
ORDER BY o.created_at DESC
LIMIT 10;
```

### PASS 조건 (이상적인 정상 경로)

- **`order_total = payment_amount`** (해당 주문에 연결된 storefront inbound가 1건이고 금액 일치).
- **품목이 모두 allocation된 경우**: `allocation_item_sum = order_total` (주문 총액과 품목 스냅샷 합 일치).
- **각 allocation 행**: `supplier_payable_amount + platform_fee_amount = item_amount` (DB CHECK와 동일).
- **동일 `commerce_order_id`에 대해** `payments`의 storefront 연동 행이 **중복 없음** (UNIQUE + 앱 멱등).
- **확정한 allocation**에 대해 `supplier_payables`가 **1:1**로 존재하고 `payable_amount + platform_fee_amount = item_amount`, `status = 'unpaid'`.

### FAIL 시 확인

- `admin_logs`에서 `platform_payment_insert_failed`, `commerce_allocation_failed`, `supplier_payable_create_failed` 등.
- allocation이 **부분만** 생성된 경우: `commerce_allocation_created`의 `new_value`에 `skipped`·`allocation_ids` 등이 있는지(관리자 로그).

---

## STEP 2 — 중복 방지 (연타·재시도)

**목적**: 입금 확인 **연타**, `paid` 전이 **중복 호출**에도 **payments / allocation / supplier_payables**가 늘어나지 않는지 검증한다.

### 실행 순서

1. **신규 주문 1건**을 준비한다(이미 `paid`인 주문은 제외).
2. 관리자OS에서 입금 확인(또는 `paid`로 바꾸는 동일 액션)을 **의도적으로 빠르게 2회** 시도한다.
3. allocation 화면에서 동일 주문에 대해 **중복 행이 생겼는지** 본다.

### 검증 SQL

```sql
-- payments: 동일 commerce_order_id 다건 (UNIQUE 위반·데이터 이관 이전 잔재 탐지)
SELECT
  commerce_order_id,
  COUNT(*) AS payment_count
FROM payments
WHERE commerce_order_id IS NOT NULL
GROUP BY commerce_order_id
HAVING COUNT(*) > 1;
```

```sql
-- allocation: 동일 품목행 다건 (DB UNIQUE 위반 시에만 1건 초과)
SELECT
  commerce_order_item_id,
  COUNT(*) AS allocation_count
FROM commerce_order_allocations
GROUP BY commerce_order_item_id
HAVING COUNT(*) > 1;
```

```sql
-- supplier_payables: 동일 allocation 다건
SELECT
  commerce_order_allocation_id,
  COUNT(*) AS payable_count
FROM supplier_payables
GROUP BY commerce_order_allocation_id
HAVING COUNT(*) > 1;
```

### PASS 조건

- 위 세 쿼리 모두 **0행**.

### 추가 확인

- DB: `payments_commerce_order_id_unique`, `commerce_order_allocations_item_unique`, `supplier_payables_allocation_unique` (migration에 정의된 이름 기준).
- 로그: `platform_payment_recorded`가 **중복 주문 없이** 기대 횟수만큼인지(연타 후에도 주문당 1회인지) 운영 판단.

---

## STEP 3 — cancel 시 allocation 역방향 (현행 구현 기준)

**목적**: 주문 취소 시 **pending allocation**만 정리되고, **이미 확정된 회계 스냅샷**이 의도대로 남는지 검증한다.

### 시나리오 A — pending allocation만 있는 상태에서 주문 취소

1. 주문을 `paid`까지 올린다(allocation은 **pending** 유지, **확정 버튼 누르지 않음**).
2. 주문을 **`cancelled`**로 바꾼다.
3. SQL로 해당 `commerce_order_id`의 allocation을 확인한다.

```sql
SELECT
  id,
  status,
  cancelled_at,
  cancelled_by
FROM commerce_order_allocations
WHERE commerce_order_id = '【취소한 주문 UUID】';
```

**PASS (현행 코드 기준)**:

- 모든 대상 행이 `status = 'cancelled'`.
- `cancelled_at`, `cancelled_by`가 채워져 있다(마이그레이션 `20260515210000` 적용 전이면 컬럼 자체가 없을 수 있음 — STEP 0에서 확인).

### 시나리오 B — confirmed allocation 이후 주문 취소 (**주의: 별도 `manual_review` 로그 없음**)

**저장소 현행**: `commerce_allocation_manual_review_required` **`admin_logs` 액션 타입은 존재하지 않는다.** 이 시나리오는 **“실제로 무슨 일이 벌어지는지”** 를 기록하는 것이 목적이다.

1. allocation을 **지급 예정 확정(confirmed)** 한다 → `supplier_payables` **unpaid** 생성 기대.
2. 주문을 **`cancelled`**로 바꾼다.
3. 기대(코드 기준): **confirmed allocation과 supplier_payables는 자동 삭제·rollback되지 않는다.** pending 행만 cancelled 처리된다.

```sql
SELECT id, status, cancelled_at, cancelled_by
FROM commerce_order_allocations
WHERE commerce_order_id = '【주문 UUID】'
ORDER BY created_at;

SELECT id, status, payable_amount, commerce_order_allocation_id
FROM supplier_payables
WHERE commerce_order_id = '【주문 UUID】';
```

**PASS 정의 (운영 정책과 합의 필요)**:

- **시스템이 하는 일**이 PRODUCT·운영 정책과 **일치하는지**를 YES/NO로 판정한다.
- 숫자 정합성 관점에서: “취소된 주문인데도 확정 allocation·payable이 남는다”가 **허용되는지**를 명시적으로 결론 내린다(허용이 아니면 **제품 결함·후속 스펙**으로 이슈화).

---

## STEP 4 — fee / payable 계산 (코드와 동일한 식)

**목적**: `admin_settings.platform_fee_rate`(정수 %)와 allocation에 스냅샷된 **`platform_fee_amount` / `supplier_payable_amount`** 가 일치하는지 검증한다.

코드: `platform_fee_amount = round(item_amount * feeNum / 100)`, `supplier_payable_amount = item_amount - platform_fee_amount`.  
DB의 `platform_fee_rate`는 **소수 비율**이므로, 검증 시 **`/100`을 rate에 한 번 더 곱하지 않는다** (잘못된 SQL로 “실패”하는 것을 방지).

```sql
SELECT
  a.item_amount,
  a.platform_fee_rate,
  a.platform_fee_amount,
  a.supplier_payable_amount,
  ROUND(a.item_amount::numeric * a.platform_fee_rate::numeric) AS expected_fee_from_rate_column,
  a.item_amount - ROUND(a.item_amount::numeric * a.platform_fee_rate::numeric) AS expected_payable_from_rate_column
FROM commerce_order_allocations a
ORDER BY a.created_at DESC
LIMIT 20;
```

### PASS 조건

- `platform_fee_amount = expected_fee_from_rate_column` (반올림 한 건만 허용 — 1원 차이는 `numeric` 표현·반올림 경계로 조사).
- `supplier_payable_amount = expected_payable_from_rate_column`.
- `platform_fee_amount + supplier_payable_amount = item_amount`.

### 교차 검증 (설정값과 스냅샷)

`admin_settings`의 정수 %를 수동으로 읽은 뒤, `expected_fee = round(item_amount * 설정값 / 100)` 이 allocation의 `platform_fee_amount`와 맞는지 샘플 몇 건으로 비교한다.

---

## STEP 5 — `supplier_payables` 생성 (allocation 확정 후)

**목적**: **확정 버튼** 이후 원장이 생기는지, 금액·상태가 맞는지 검증한다.

### 실행 순서

1. `/admin/commerce/allocations`에서 대상 행이 **pending**인지 확인.
2. **지급 예정 확정** 클릭.
3. 동일 화면 또는 `/admin/commerce/payables`에서 반영 확인.

```sql
SELECT
  sp.id,
  sp.commerce_order_allocation_id,
  sp.supplier_tenant_id,
  sp.item_amount,
  sp.platform_fee_amount,
  sp.payable_amount,
  sp.status,
  t.name AS supplier_name
FROM supplier_payables sp
JOIN tenants t ON t.id = sp.supplier_tenant_id
ORDER BY sp.created_at DESC
LIMIT 20;
```

### PASS 조건

- 확정한 allocation마다 **정확히 1행** (`commerce_order_allocation_id` 기준 UNIQUE).
- `payable_amount + platform_fee_amount = item_amount`.
- `status = 'unpaid'` (본 가이드 범위 — **paid 전환·실지급은 별 과제**).

---

## STEP 6 — 멀티 공급자 (한 주문·여러 listing)

**목적**: **서로 다른 `supplier_tenant_id`** 를 가진 품목이 한 장바구니에 있을 때, allocation(및 확정 시 payable)이 **분리**되는지, **합이 주문 총액**과 맞는지 검증한다.

### 실행 순서

1. 상품 A listing → 공급자1, 상품 B listing → 공급자2 (STEP 0에서 UUID 메모).
2. 한 주문에 A+B 함께 구매.
3. `paid` 처리 후 allocation 행이 **2건 이상**인지 확인.
4. 각각 확정 시 `supplier_payables`가 **공급자별로** 생기는지 확인.

```sql
SELECT
  a.commerce_order_id,
  a.supplier_tenant_id,
  t.name AS supplier_name,
  a.item_amount,
  a.supplier_payable_amount,
  a.status
FROM commerce_order_allocations a
JOIN tenants t ON t.id = a.supplier_tenant_id
WHERE a.commerce_order_id = '【주문 UUID】'
ORDER BY a.created_at;
```

### PASS 조건

- 공급자별로 allocation이 **분리**되어 있다(동일 supplier로 합쳐지지 않음).
- `SUM(item_amount)`(해당 주문·확인 대상 status만)가 주문 `total_amount`와 **합의된 정의** 하에서 일치.

### 주의

- 공급자 식별은 **listing `supplier_tenant_id` → owner 규칙 → product tenant** 순으로 코드가 해석한다. “항상 한 공급자만 나온다”면 **listing 메타**를 의심한다.

---

## STEP 7 — RLS (다른 공급자 데이터)

**목적**: 공급자 A 세션으로는 **공급자 B**의 allocation / supplier_payables가 보이지 않는지 확인한다.

### 실행 순서

1. 공급자 A 계정으로 로그인(또는 Supabase에서 **JWT에 tenant가 A로 고정된 클라이언트**로 조회).
2. `supplier_payables`·`commerce_order_allocations`에 대해 **SELECT** (앱·SQL 에디터·API 중 조직이 허용하는 방식).

```sql
-- 공급자 세션에서 실행 시: 자기 tenant만 보여야 함(행 수·supplier_tenant_id 분포)
SELECT supplier_tenant_id, COUNT(*) AS cnt
FROM supplier_payables
GROUP BY supplier_tenant_id;
```

### PASS 조건

- **한 세션에서** `supplier_tenant_id`가 **자기 tenant 하나**로만 집계된다(다른 공급자 혼입 없음).
- 관리자 세션과 비교해 **행 수·합계**가 정책과 맞다.

---

## STEP 8 — audit trail (`admin_logs`)

**목적**: ERP에 영향을 주는 이벤트가 **로그에 남는지** 확인한다.

**저장소에서 확인된 액션 타입 예시** (이 목록 외는 제품 변경 시 `grep`으로 갱신):

- `platform_payment_recorded` / `platform_payment_insert_failed`
- `commerce_allocation_created` / `commerce_allocation_failed`
- `commerce_allocation_confirmed`
- `commerce_allocation_cancel_failed`
- `supplier_payable_created` / `supplier_payable_create_failed`

```sql
SELECT
  action_type,
  target_table,
  target_id,
  created_at
FROM admin_logs
WHERE action_type IN (
  'platform_payment_recorded',
  'platform_payment_insert_failed',
  'commerce_allocation_created',
  'commerce_allocation_failed',
  'commerce_allocation_confirmed',
  'commerce_allocation_cancel_failed',
  'supplier_payable_created',
  'supplier_payable_create_failed'
)
ORDER BY created_at DESC
LIMIT 50;
```

### PASS 조건

- 위 흐름을 한 번이라도 수행했다면, **대응하는 성공 또는 실패** 로그가 남아 추적 가능하다(로그 INSERT 실패는 코드상 콘솔만인 경로도 있으므로 **완전 무결을 가정하지 않음**).

---

## 테스트 결과 기록 템플릿

각 STEP 완료 후 복사해 사용한다.

```text
STEP N — [제목]

실행일:
실행자:
결과: PASS / FAIL / PARTIAL

발견 문제:

SQL 결과 요약:

비고:
```

---

## 문서 참조

| 문서 | 용도 |
|------|------|
| `docs/TEST.md` | 전체 운영 체크리스트(ERP 항목 추가됨) |
| `docs/TEST-RUN-001.md` | storefront 운영 순서·STEP 8 bridge |
| 본 문서 | **회계 숫자·중복·취소·RLS** |

---

## 금지·비범위 (재확인)

- settlement **자동화** 검증을 본 문서에 **추가하지 않는다**.
- supplier **실지급(payout)·은행 이체** 실행을 본 문서에 포함하지 않는다.
- 코드에 없는 `admin_logs` 액션 타입으로 **PASS 게이트를 만들지 않는다**.
