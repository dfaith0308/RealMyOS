# TEST-RUN-PRICING-001 — pricing engine P0 검증 가이드

> **문서 성격**: 자동 테스트 실행이 아니라, **정무님이 나중에 순서대로** 수행·기록할 때 쓰는 **손 검증** 가이드이다.  
> **범위**: `DISCOUNT-ENGINE-P0-001` 이후 배포된 **pricing policies + 주문 품목 스냅샷** 동작(정책 선택 1건, `commerce_price` 폴백, `admin_logs` 실패 기록).  
> **금지(본 문서 작성 원칙)**: 구현되지 않은 기능(정책 자동 만료 배치·supplier_basis 분리·할인 스택킹·역분개 자동화 등)을 **있다고 가정하지 않는다**.

**코드 기준점 (저장소 확인, 2026-05-14 기준)**:

- 식당OS: `resturant_os/src/actions/buy.ts` — 주문 시 `fetch_active_pricing_policies_for_checkout` RPC로 정책 JSON 로드 → `resturant_os/src/lib/pricing-policy-engine.ts` 로 라인별 **승자 정책 1건** 선택·적용 → `commerce_order_items` 에 `unit_price`·`base_price`·`applied_policy_id`·`applied_policy_snapshot` 저장.
- 실패 로그: `log_pricing_engine_admin_event` RPC → `admin_logs` (`action_type`: `pricing_policy_lookup_failed` | `pricing_policy_apply_failed`).
- 관리자OS UI: `/admin/commerce/pricing` — 정책 **등록**·**활성/비활성** (P0 UI에 **할인값 수정 폼 없음** — 정책 값 변경 검증은 **SQL `UPDATE`** 로 수행).

---

## STEP 0 — 사전 환경 확인

다음을 **SQL Editor** 등으로 확인한다.

### 포함 항목

- `pricing_policies` 테이블 존재
- `pricing_policy_targets` 테이블 존재
- `commerce_order_items` 에 `applied_policy_id` / `base_price` / `applied_policy_snapshot` 컬럼 존재
- **`platform_fee_rate`** 설정 확인 — allocation 수수료와 동일 축: `admin_settings.key = 'platform_fee_rate'` (정수 %, 예: `3` = 3%). 상세·검증 쿼리는 **`docs/TEST-RUN-ERP-001.md` STEP 0-1** 참조.
- pricing engine migration **적용 여부** (운영·스테이징 DB 기준)

### 확인 SQL

```sql
-- 테이블 존재 확인
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'pricing_policies',
    'pricing_policy_targets'
  );

-- commerce_order_items 컬럼 확인
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'commerce_order_items'
  AND column_name IN (
    'applied_policy_id',
    'base_price',
    'applied_policy_snapshot'
  );

-- platform_fee_rate (allocation·payable 검증과 연계)
SELECT key, value
FROM admin_settings
WHERE key = 'platform_fee_rate';

-- pricing engine migration 적용 확인 (Supabase hosted 기준)
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version LIKE '20260515400000%';
```

**참고**: 로컬·호스팅에 따라 migration 메타 테이블 이름이 다를 수 있다. 행이 없으면 **`supabase/migrations/20260515400000_create_pricing_policies.sql`** 가 해당 DB에 **미적용**인 것으로 본다.

### PASS 조건

- `pricing_policies` 행이 `information_schema` 에 존재
- `pricing_policy_targets` 존재
- snapshot 컬럼 3개 모두 존재
- `platform_fee_rate` 키가 조회 가능(값은 환경별)
- `schema_migrations` 에 `20260515400000` 대역 버전이 **1건 이상** (해당 migration 적용됨)

### FAIL 시 확인 위치

- 저장소 파일: `supabase/migrations/20260515400000_create_pricing_policies.sql`
- Supabase Dashboard → Database → Migrations (또는 배포 파이프라인) 적용 이력

---

## STEP 1 — 기본 정책 적용 검증

**목적**: 정책 등록 후 주문 시 **스냅샷·단가**가 기대와 같게 찍히는지 확인한다.

### 실행 순서

1. 관리자OS **`/admin/commerce/pricing`** 접속
2. 정책 등록:
   - 이름: `테스트 10% 할인` (임의)
   - 유형: **퍼센트 할인** (`percent_discount`)
   - 값: `10`
   - **전체 적용** 체크 (`applies_to_all` — UI에서 「전체 적용 (전역)」)
   - 등록 시 상태는 UI 기본 **`active`**
3. **식당 계정**으로 식당OS storefront에서 **주문 1건** 생성 (장바구니 → 체크아웃 → 제출)
4. 아래 **검증 SQL** 실행

### 검증 SQL

```sql
SELECT
  oi.id,
  oi.listing_title,
  oi.unit_price,
  oi.base_price,
  oi.applied_policy_id,
  oi.applied_policy_snapshot
FROM commerce_order_items oi
ORDER BY oi.created_at DESC
LIMIT 5;
```

### PASS 조건

- `base_price` = 해당 주문 시점의 **원래** `commerce_product_listings.commerce_price` (정수 원화 단위 등 저장소 일관 규칙 따름)
- `unit_price` = `round(base_price * (1 - 10/100))` (구현: `applyPricingPolicy` 의 `percent_discount`)
- `applied_policy_id` **NOT NULL**
- `applied_policy_snapshot` **NOT NULL**
- snapshot JSON 에 다음 키가 포함되는지 확인 (예: `snapshot->>'policy_type'` 등):
  - `policy_type`
  - `discount_value`
  - `priority`
  - `burden_type`

### FAIL 시 확인 위치 (저장소 경로)

- `resturant_os/src/actions/buy.ts` — RPC 호출·INSERT 필드
- `resturant_os/src/lib/pricing-policy-engine.ts` — 우선순위·할인 수식
- DB: **`public.fetch_active_pricing_policies_for_checkout`** — 식당 세션이 정책 테이블을 직접 SELECT 하지 않고 이 RPC로 JSON을 받는다 (**`pricing_policy_engine` 이라는 이름의 RPC는 없음**).
- `public.log_pricing_engine_admin_event` — 조회/적용 실패 시 `admin_logs`

### 로그 확인 SQL

```sql
SELECT
  action_type,
  payload,
  created_at
FROM admin_logs
WHERE action_type IN (
  'pricing_policy_lookup_failed',
  'pricing_policy_apply_failed'
)
ORDER BY created_at DESC
LIMIT 10;
```

**참고**: 정상 경로에서는 위 `action_type` 이 **안 찍히는 것이 정상**이다. RPC 미배포·RLS·예외 시에만 기록된다.

---

## STEP 2 — 정책 우선순위 검증

**목적**: 여러 정책이 있을 때 **승자 1건만** 적용되고, **listing 스코프**가 `applies_to_all` 보다 우선하는지 확인한다.

### 실행 순서

1. **정책 A** 등록:
   - **전체 적용** (`applies_to_all`)
   - 우선순위: `10`
   - 유형·값: `percent_discount`, `5` (5% 할인)
2. **정책 B** 등록:
   - **전체 적용 해제**, 동일 주문에 쓸 **특정 listing** 선택
   - 우선순위: `100`
   - 유형·값: `percent_discount`, `20` (20% 할인)
3. **정책 B의 listing** 만 담긴 장바구니로 주문 생성
4. 검증 SQL 실행

### 검증 SQL

```sql
SELECT
  oi.listing_title,
  oi.base_price,
  oi.unit_price,
  oi.applied_policy_snapshot->>'priority' AS applied_priority,
  oi.applied_policy_snapshot->>'discount_value' AS applied_discount,
  oi.applied_policy_snapshot->>'policy_type' AS applied_type
FROM commerce_order_items oi
ORDER BY oi.created_at DESC
LIMIT 5;
```

### PASS 조건

- **정책 B** 가 적용됨: `applied_discount` = `20` (문자열로 나올 수 있음)
- **정책 A 와 중복 적용되지 않음**: `unit_price` 가 “5% 후 다시 20%” 같은 **이중 할인** 결과가 아니라 **한 번만** 할인된 값
- 동일 티어가 아닌 경우 **스코프 티어**가 우선 (listing 지정이 전체보다 우선) — 구현: `pricing-policy-engine.ts` 의 `matchTargetTier`

### 반드시 확인

- 승자 정책 **1개**만 `applied_policy_snapshot` 에 반영되는지
- **stacking 없음** (한 라인에 정책 1건)

---

## STEP 3 — fallback 검증

**목적**: 활성 정책이 없을 때 **`commerce_price`** 와 동일하게 동작하고 주문이 막히지 않는지 확인한다.

### 실행 순서

1. 관리자OS `/admin/commerce/pricing` 에서 **모든 활성 정책 비활성화** (`inactive`)
2. (선택) 잠시 신규 주문만 보이게 할 수 있도록 **메모**: 이전 주문 행과 구분
3. 식당 storefront에서 **주문 1건** 생성
4. 검증 SQL

### 검증 SQL

```sql
SELECT
  oi.unit_price,
  oi.base_price,
  oi.applied_policy_id,
  oi.applied_policy_snapshot
FROM commerce_order_items oi
ORDER BY oi.created_at DESC
LIMIT 3;
```

### PASS 조건

- `applied_policy_id` **IS NULL**
- `applied_policy_snapshot` **IS NULL**
- `unit_price` = `base_price`
- **주문 생성 성공** (체크아웃 오류 없이 완료)

### 중요

- fallback 실패로 **주문 생성이 막히면 FAIL** 이다.

---

## STEP 4 — snapshot immutability 검증

**목적**: 주문 확정 후 **`pricing_policies` 행을 바꿔도** 이미 찍힌 **주문 품목 스냅샷·단가가 변하지 않는지** 확인한다.

### 실행 순서

1. STEP 1 과 유사하게 **정책 적용 주문 1건** 생성 후, 해당 `commerce_order_items` 행의 `id`·`applied_policy_snapshot`·`unit_price`·`base_price` 를 메모
2. 동일 `pricing_policies.id` 에 대해 **`discount_value` 를 10 → 30** 등으로 변경  
   - P0 관리자 UI에는 **정책 수정 폼이 없음** → **SQL 예시** (실행 전 `id` 는 환경값으로 치환):

```sql
UPDATE pricing_policies
SET discount_value = 30,
    updated_at = now()
WHERE id = '<주문에 붙었던 policy_id>';
```

3. **메모해 둔 주문 품목 행** 을 다시 SELECT

### 검증 SQL

```sql
SELECT
  oi.applied_policy_snapshot,
  oi.unit_price,
  oi.base_price
FROM commerce_order_items oi
WHERE oi.applied_policy_id IS NOT NULL
ORDER BY oi.created_at DESC
LIMIT 3;
```

### PASS 조건

- 과거 주문 행의 `applied_policy_snapshot` 내 `discount_value` 등이 **주문 시점 값 유지** (예: 여전히 `10`)
- 해당 행의 `unit_price`·`base_price` **불변**
- **과거 주문에 대해 재계산·UPDATE 가 일어나지 않음**

### 중요

- **immutable snapshot** 원칙 검증. 이후 신규 주문만 변경된 정책을 탄다.

---

## STEP 5 — 기간 정책 검증

**목적**: `starts_at` / `ends_at` 의 **nullable 조건**과 비교식이 의도대로인지 확인한다. (자동 만료 **배치는 P0 범위 밖** — 조회 시점 필터만 존재.)

### nullable 조건 (구현 기준)

활성 정책 후보는 다음을 만족한다:

- `(starts_at IS NULL OR starts_at <= now())`
- `(ends_at IS NULL OR ends_at >= now())`

즉 **둘 다 NULL** 이면 기간 제한 없음.

### 실행 순서 (예시 — 실제 시각은 실행 환경에 맞게 조정)

1. **과거**만 유효한 정책 1건: `ends_at` 을 **과거**로 넣고 등록(또는 SQL로 삽입) → 주문 시 **적용되지 않아야** 함
2. **현재** 유효한 정책 1건: `starts_at` ≤ now ≤ `ends_at` (또는 한쪽 NULL)
3. **미래**만 유효한 정책 1건: `starts_at` 을 **미래**로 → **적용되지 않아야** 함
4. 주문 생성 후 최신 `commerce_order_items` 로 어떤 정책이 붙었는지 확인

### PASS 조건

- **현재 유효**한 정책만 적용
- **과거만 유효**·**미래만 시작** 정책은 적용되지 않음

---

## STEP 6 — `applies_to_all` vs listing 검증

**목적**: **스코프 티어** 우선순위(listing 지정이 전체보다 우선)가 **priority 숫자만**으로 뒤집히지 않는지 확인한다.

### 실행 순서

1. **전체 적용** 정책 등록 (예: 15% 할인, priority 낮게 또는 높게 — **listing 티어가 우선**해야 하므로 priority 만으로 전체가 이기면 안 됨)
2. **동일 listing** 에 대해 **listing 전용** 정책 등록 (예: 25% 할인)
3. 그 listing 만 담아 주문
4. 최신 품목 행에서 `applied_policy_snapshot` 의 `discount_value` 등 확인

### PASS 조건

- **listing 정책**이 적용됨 (`applied_discount` 등이 listing 쪽 값)
- `applies_to_all` 은 **해당 라인에서** 승자로 남지 않음 (동시에 두 정책이 섞이지 않음)

---

## STEP 7 — `admin_logs` 검증

**목적**: pricing engine 이 **`admin_logs`** 에 실패 이벤트를 남기는 경로가 동작하는지 **의도적으로** 한 번 유도해 본다 (운영에서는 빈 결과가 정상일 수 있음).

### 확인 SQL

```sql
SELECT
  action_type,
  payload,
  created_at
FROM admin_logs
WHERE action_type LIKE 'pricing_policy%'
ORDER BY created_at DESC
LIMIT 10;
```

### PASS 조건 (의도적 실패 유도 시)

- `pricing_policy_lookup_failed` 또는 `pricing_policy_apply_failed` 가 **최소 1건** 기록될 수 있는 시나리오를 설계했다면:
  - `payload` 에 **`listing_id` / `restaurant_tenant_id` / `error`** 관련 키가 존재하는지 확인 (`buy.ts` 구현 기준 JSON 필드명)

### 반드시 명시

- **정상 적용만 반복한 환경**에서는 위 로그가 **비어 있을 수 있음** — 그것만으로 FAIL 아님.
- 본 로그는 **실패 forensic** 목적이며, 성공 트랜잭션마다 남기지 않는다.

### 실패 유도 아이디어 (환경 격리된 스테이징에서만)

- migration 은 적용했으나 RPC 권한이 빠진 빌드 등 — **운영에서 임의로 막지 말 것**. 스테이징에서만 검토.

---

## STEP 8 — ERP snapshot 연결 검증

**목적**: 주문 품목의 **가격 스냅샷**이 이후 **`commerce_order_allocations`** / **`supplier_payables`** 와 **같은 주문 흐름 안에서** 추적·대조 가능한지 확인한다.

### 검증 SQL

```sql
SELECT
  oi.id,
  oi.base_price,
  oi.unit_price,
  oi.applied_policy_snapshot,
  a.item_amount,
  sp.payable_amount
FROM commerce_order_items oi
LEFT JOIN commerce_order_allocations a
  ON a.commerce_order_item_id = oi.id
LEFT JOIN supplier_payables sp
  ON sp.commerce_order_allocation_id = a.id
ORDER BY oi.created_at DESC
LIMIT 10;
```

### PASS 조건 (현행 P0 기준)

- `paid` 이후 allocation 이 생성된 주문에 대해, **`a.item_amount`** 가 **주문 시점 `unit_price`·수량 규칙**과 정합하는지 **수동으로** 확인 가능해야 한다 (코드: allocation 생성 시 품목 금액은 storefront **청구 단가** 축).
- `supplier_payables` 와 조인해 **지급 예정 원장**까지 연결 가능한지 확인 (allocation **확정** 후 payable 존재 여부는 **`TEST-RUN-ERP-001`** 절차와 병행).

### 반드시 명시 (한계)

- **`supplier_basis` 는 P0에서 주문 품목과 분리되지 않음** ([D-020] 설계 축 — 미구현).
- allocation / payable 은 현재 **`customer_charge` 기반 `item_amount`** 축으로 운영된다는 전제에서 본다. **P1 이후** 금액 모델이 바뀔 수 있음.
- 본 STEP 은 **숫자 자동 검증 스크립트가 아님** — “연결 가능·추적 가능” 여부 확인.

---

## STEP 9 — rollback / 취소 영향 확인

**목적**: 주문 **취소** 후에도 **품목 스냅샷 행이 남는지**(삭제되지 않는지) 확인한다. (**자동 역분개·원장 롤백 완성 여부는 본 문서 범위 밖**.)

### 실행 순서

1. 정책이 붙은 주문 1건 생성 → 품목 `id` 메모
2. 관리자OS 등에서 해당 `commerce_orders` 를 **취소** 처리 (현행 UI·액션 경로는 배포 버전 기준)
3. 동일 `commerce_order_items.id` SELECT

### PASS 조건

- **품목 행이 물리 삭제되지 않음** (soft delete 가 아니라면 row 존재)
- `applied_policy_snapshot` 이 **그대로** 남아 **forensic** 가능

### 반드시 명시

- **자동 역분개·allocation/payables 전체 롤백 자동화는 P0에 없음** — `TEST-RUN-ERP-001` 의 취소·allocation 상태 설명과 함께 읽는다.
- 본 STEP 은 **“스냅샷이 증발하지 않는지”** 에 초점.

---

## 테스트 결과 기록 템플릿

```text
STEP N — [제목]

실행일:
실행자:
결과: PASS / FAIL / PARTIAL

등록한 정책:
적용된 정책:

SQL 결과 요약:

발견 문제:

비고:
```

---

## 관련 문서

- **ERP 숫자 정합(수금·allocation·payable·fee)**: `docs/TEST-RUN-ERP-001.md` — **본 가이드로 품목 단가·스냅샷을 확인한 뒤** 진행하는 것을 권장한다.
- 운영 체크리스트 상위 목록: `docs/TEST.md` §9 (pricing engine 항목).
