# 식식이OS — rules.md
> 최종 업데이트: 2026-05-05
> 적용 대상: RealMyOS (supplier-os) / restaurant-os

---

## [AI-LOCK] 절대 실행 원칙

```
이 시스템은 "코드 생성 가이드"가 아니다.
"AI 실행 통제 시스템"이다.
AI는 선택할 수 없다. 정의된 것만 수행한다.
```

1. RULE 위반 감지 시 즉시 중단
2. 중단 후 추가 코드 생성 금지
3. 사용자 승인 없이 재개 금지
4. 임의 판단 금지 (추론 기반 구현 금지)
5. 이 문서에 없는 기능 구현 금지

**위반 시 출력 형식 (이 형식 외 출력 금지)**
```
⛔ EXECUTION BLOCKED
RULE_VIOLATION: [RULE-ID]
REASON: [이유]
REQUIRED_ACTION: 정무님 승인 필요
```

---

## [EXECUTION-FLOW] 실행 구조

```
[PRE-CHECK] → [RULE-CHECK] → [EXECUTION] → [POST-CHECK]

하나라도 실패 시 즉시 중단. 다음 단계 진입 금지.
```

---

## [PRE-CHECK] 실행 전 검증 — 코드 작성 전 반드시 수행

아래 4개를 순서대로 확인한다. 하나라도 NO면 실행 금지.

```
1. 이 작업이 rules.md에 정의된 패턴인가?       YES / NO
2. 기존 파일 구조를 확인했는가?                 YES / NO
3. 동일 기능 파일이 이미 존재하는가?            YES(수정) / NO(신규)
4. 수정인지 신규 생성인지 명확한가?             YES / NO
```

**항목 3이 YES(이미 존재)인 경우**: 신규 파일 생성 금지. 기존 파일 수정으로만 처리한다.

---

## [POST-CHECK] 실행 후 검증 — 코드 완성 후 반드시 수행

아래 4개를 순서대로 확인한다. 하나라도 실패 시 전체 코드 폐기.

```
1. 모든 쿼리에 tenant_id 포함되어 있는가?
2. FORBIDDEN 목록의 패턴이 포함되어 있는가?
3. 상태 변경이 전용 함수 외 방법으로 되어 있는가?
4. 2개 이상 write 작업이 RPC 없이 순서 나열되어 있는가?
5. 요청 범위 외 파일을 수정하지 않았는가?          [RULE-22]
6. 요청 없는 리팩토링이 포함되어 있지 않은가?      [RULE-23]
```

---

## [RULE-00] 계산값 유형 분류 — HARD

RULE-02와 SCHEMA 간 충돌 방지. 저장 전 반드시 유형 판단.

**판단 기준**: "나중에 다시 계산해도 같은 값이 나오는가?"

| 유형 | 예시 | 저장 |
|------|------|------|
| 런타임 계산값 | `margin_rate`, `action_score`, `customer_status`, `next_action_date`, `order_cycle_days` | **금지** |
| 거래 확정값 | `supply_price`, `vat_amount`, `line_total`, `cost_price`, `total_amount`, `saving_amount` | **필수** |

이 두 유형 외 판단이 필요한 경우 정무님 확인 후 이 문서에 추가한다.

---

## [RULE-01] tenant_id 필수 필터 — HARD

모든 DB 쿼리에 tenant_id 누락 시 컴파일 에러 수준으로 간주한다.

```typescript
// ✅ 올바름
.eq('tenant_id', ctx.tenant_id)

// ⛔ HARD 위반 → 즉시 중단
await supabase.from('orders').select('id')  // tenant_id 없음
```

- RLS가 있어도 서버 액션에서 이중 검증한다
- 어떤 이유로도 예외 없음

---

## [RULE-02] 런타임 계산값 DB 저장 금지 — HARD

RULE-00 유형 1 값은 DB에 저장하지 않는다.

```typescript
// ✅ 올바름 — 화면 표시 또는 분기에만 사용
const score = calcActionScore(customer, orders, payments)

// ⛔ HARD 위반 → 즉시 중단
await supabase.from('customers').update({ action_score: score })
```

---

## [RULE-03] 과거 데이터 불변 — HARD

거래 확정 후 금액·스냅샷 필드 수정 금지.

```typescript
// ✅ 올바름 — status 변경만
await supabase.from('orders').update({ status: 'cancelled' })

// ⛔ HARD 위반 → 즉시 중단
await supabase.from('orders').update({ total_amount: newAmount })
await supabase.from('order_lines').update({ cost_price: newCost })
```

불변 필드: `order_lines.cost_price` / `product_code` / `product_name` / `supply_price` / `vat_amount` / `line_total`, `payments.amount`, `price_history` 전체

---

## [RULE-04] cost_price 서버 확정 — HARD

클라이언트가 보낸 cost_price를 절대 신뢰하지 않는다.
`product_costs` 테이블에서 서버가 직접 조회하여 확정한다.

```typescript
// ✅ 올바름
const costPrice = getCurrentCostPrice(product.product_costs, orderDate)

// ⛔ HARD 위반 → 즉시 중단
const costPrice = input.lines[0].cost_price
```

---

## [RULE-05] N+1 쿼리 금지 — HARD

루프 안에서 DB 쿼리 실행 금지.

```typescript
// ✅ 올바름
.in('id', lines.map(l => l.product_id)).eq('tenant_id', ctx.tenant_id)

// ⛔ HARD 위반 → 즉시 중단
for (const line of lines) {
  await supabase.from('products').select('*').eq('id', line.product_id)
}
```

---

## [RULE-06] OS 간 분리 — HARD

supplier-os ↔ restaurant-os 코드 import 및 DB 직접 접근 금지.
연동 필요 시 API / webhook 으로만 구현한다.

---

## [RULE-07] DB 하위 호환 유지 — HARD

```sql
-- ✅ 올바름
ALTER TABLE orders ADD COLUMN IF NOT EXISTS new_field text;

-- ⛔ HARD 위반 → 즉시 중단
ALTER TABLE orders ALTER COLUMN status TYPE integer;
DROP COLUMN total_amount;
DROP TABLE orders;
```

---

## [RULE-08] Server Action 전용 DB 접근 — HARD

클라이언트 컴포넌트에서 직접 Supabase 쿼리 금지.

```typescript
// ⛔ HARD 위반 → 즉시 중단
'use client'
const supabase = createBrowserClient(...)
await supabase.from('orders').insert(...)
```

예외: `lib/supabase-browser.ts` 인증 상태 확인 목적만 허용.

---

## [RULE-09] TypeScript strict — HARD

- `any` 타입 사용 금지
- 모든 함수 파라미터·반환값 타입 명시
- `ActionResult<T>` 패턴 필수

```typescript
// ⛔ HARD 위반 → 즉시 중단
export async function createOrder(input: any) {}
```

---

## [RULE-10] 레코드 물리 삭제 금지 — HARD

| 테이블 | 비활성화 방식 |
|--------|-------------|
| `customers` | `trade_status = 'inactive'` |
| `products` | `deleted_at = now()` |
| `categories` | `is_active = false` |
| `message_templates` | `is_active = false` |
| `collection_schedules` | `status = 'cancelled'` |

```typescript
// ⛔ HARD 위반 → 즉시 중단
await supabase.from('customers').delete().eq('id', customerId)
```

---

## [RULE-11] 상태 변경 전용 함수 강제 — HARD

상태(status) 변경은 반드시 전용 Server Action 함수로만 수행한다.
직접 `.update({ status })` 금지.

```typescript
// ✅ 올바름
await cancelOrder(orderId)      // src/actions/order.ts
await confirmOrder(orderId)     // src/actions/order.ts

// ⛔ HARD 위반 → 즉시 중단
await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
```

**허용 상태 전이**
```
orders:               draft → confirmed → cancelled
payments:             planned → paid → reversed
collection_schedules: active → cancelled
```

`cancelled` / `reversed` → 어떤 상태로도 되돌리기 금지.
위 전이 외 조합 필요 시 정무님 확인 후 이 문서에 추가.

---

## [RULE-12] collection_schedules cancel→insert 순서 — HARD

```typescript
// ✅ 올바름
await cancelCollectionSchedule(existingId)  // 반드시 먼저
await createCollectionSchedule(newData)     // 반드시 나중

// ⛔ HARD 위반 → 즉시 중단
await Promise.all([cancel(...), create(...)])
```

---

## [RULE-13] 완성된 코드만 납품 — HARD

```
// TODO: 포함 코드 → 배포 금지
mock 데이터를 실제처럼 보이게 하는 코드 → 금지
console.log / console.error → 금지 (개발 환경 포함)
테스트용 코드 잔존 → 금지
```

---

## [RULE-14] restaurant-os RLS 강화 — HARD

신규 테이블 추가 시 `restaurant_id` 기반 정책 필수.
`auth.role() = 'authenticated'` 임시 정책은 신규 테이블에 사용 금지.

---

## [RULE-15] getAuthCtx 필수 (supplier-os) — HARD

모든 supplier-os Server Action은 반드시 getAuthCtx로 시작한다.

```typescript
// ✅ 올바름 — 모든 Server Action 1번째 줄
const supabase = await createSupabaseServer()
const ctx = await getAuthCtx(supabase)
if (!ctx) return { success: false, error: '로그인이 필요합니다.' }
```

---

## [RULE-16] 설정값 DB 기반 관리 — HARD

비즈니스 기준값 코드 하드코딩 금지.
`settings` 테이블에서 조회. 설정 변경 시 `settings_logs` 기록 필수.

```typescript
// ✅ 올바름
const { data } = await supabase
  .from('settings').select('value')
  .eq('key', 'margin_warning_threshold').eq('tenant_id', ctx.tenant_id).single()
// fallback 기본값은 constants/settings.ts에만 정의
const threshold = data ? parseFloat(data.value) : DEFAULT_MARGIN_THRESHOLD

// ⛔ HARD 위반 → 즉시 중단
const MARGIN_THRESHOLD = 5.0
```

---

## [RULE-17] 금액 계산 규칙 — HARD

- DB 저장: `integer`, 원(KRW) 단위 (소수점 저장 금지)
- 화면 표시: `formatKRW()` (`lib/calc.ts`)
- 부가세: `Math.round(abs / 1.1)` 반올림 필수
- 마진율: `calcMarginRate()` (`lib/calc.ts`)

```typescript
// ⛔ HARD 위반 → 즉시 중단
supply_price: amount * 0.909  // 소수점 오염
```

---

## [RULE-18] SELECT 필드 최소화 — SOFT

```typescript
// ✅ 올바름
.select('id, name, status, created_at')
.range(offset, offset + 49)

// SOFT 위반 — 이유 설명 후 계속 가능
.select('*')
// limit 없는 대량 조회
```

100건 이상 예상 조회에 반드시 `.range()` 또는 `.limit()` 적용.

---

## [RULE-19] 복수 write 원자성 — HARD

2개 이상 테이블 write 시 반드시 RPC로 처리.

```typescript
// ✅ 올바름
await supabase.rpc('update_order_lines', { p_order_id, p_tenant_id, p_line_rows })

// ⛔ HARD 위반 → 즉시 중단
await supabase.from('orders').update(...)
await supabase.from('order_lines').delete(...)  // 중간 실패 시 롤백 없음
await supabase.from('order_lines').insert(...)
```

RPC 없이 복수 write 필요 시 정무님 확인 후 RPC 먼저 생성.

---

## [RULE-20] 동시성 방어 — HARD

상태 변경 / 금액 변경 시 반드시 현재 상태 검증 후 실행한다.

```typescript
// ✅ 올바름 — 상태 검증 후 변경
const { data: order } = await supabase
  .from('orders').select('status')
  .eq('id', orderId).eq('tenant_id', ctx.tenant_id).single()

if (order.status !== 'draft')
  return { success: false, error: '이미 처리된 주문입니다.' }

await supabase.from('orders').update({ status: 'confirmed' }).eq('id', orderId)

// ⛔ HARD 위반 → 즉시 중단
// 상태 확인 없이 바로 update
await supabase.from('orders').update({ status: 'confirmed' }).eq('id', orderId)
```

---

## [RULE-21] try-catch 필수 — HARD

DB 호출을 포함한 모든 Server Action은 반드시 에러 처리를 갖춰야 한다.
단, 기존 코드 패턴(`if (error) return`)은 허용. try-catch와 병행 가능.

```typescript
// ✅ 올바름 — 패턴 1 (Supabase error 객체 처리)
const { data, error } = await supabase.from('orders').select('id').eq('tenant_id', ctx.tenant_id)
if (error) return { success: false, error: error.message }

// ✅ 올바름 — 패턴 2 (예외 전체 처리)
try {
  const { data, error } = await supabase.from('orders').select('id').eq('tenant_id', ctx.tenant_id)
  if (error) throw new Error(error.message)
  return { success: true, data }
} catch (e) {
  return { success: false, error: String(e) }
}

// ⛔ HARD 위반 → 즉시 중단
const { data } = await supabase.from('orders').select('id')  // error 무시
```

---

## [RULE-EXEC-01] Server Action 실행 순서 — HARD

모든 supplier-os Server Action은 아래 순서를 반드시 따른다. 순서 변경 금지.

```
1. getAuthCtx 호출 및 인증 검증
2. 입력값 유효성 검사
3. 현재 상태 검증 (상태 변경 / 금액 변경 시)
4. RPC 또는 단일 write 실행 (복수 write는 반드시 RPC)
5. tenant_id 포함 여부 최종 확인
6. ActionResult 반환
```

```typescript
// ✅ 올바름 — 순서 준수
export async function confirmOrder(orderId: string): Promise<ActionResult> {
  // 1. 인증
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인이 필요합니다.' }

  // 2. 입력 검증
  if (!orderId) return { success: false, error: 'orderId 누락.' }

  // 3. 상태 검증
  const { data: order } = await supabase
    .from('orders').select('status')
    .eq('id', orderId).eq('tenant_id', ctx.tenant_id).single()
  if (!order) return { success: false, error: '주문을 찾을 수 없습니다.' }
  if (order.status !== 'draft') return { success: false, error: '확정 불가 상태입니다.' }

  // 4. write
  const { error } = await supabase
    .from('orders').update({ status: 'confirmed' })
    .eq('id', orderId).eq('tenant_id', ctx.tenant_id)
  if (error) return { success: false, error: error.message }

  // 6. 반환
  revalidatePath('/orders')
  return { success: true }
}
```

---

## [FILE-STRUCTURE] 파일 구조 규칙 — HARD

**신규 디렉토리 생성 조건 (3개 모두 충족 시만 허용)**
```
1. 동일 기능 파일이 기존 구조에 없음
2. 기존 폴더 구조 내 적절한 위치 없음
3. 정무님 승인 있음
```

### supplier-os (RealMyOS)

```
src/
├── actions/          ← Server Action만. DB 접근은 여기서만.
│   └── {entity}.ts
├── app/
│   ├── (app)/
│   │   └── {domain}/
│   │       ├── page.tsx
│   │       ├── new/page.tsx
│   │       ├── loading.tsx
│   │       └── [id]/
│   │           ├── page.tsx
│   │           └── edit/page.tsx
│   └── (auth)/
├── components/
│   └── {domain}/
│       ├── {Entity}CreateForm.tsx
│       ├── {Entity}EditForm.tsx
│       └── {Entity}Client.tsx
├── lib/
│   ├── supabase-server.ts   ← 수정 금지
│   ├── supabase-browser.ts  ← 수정 금지
│   ├── calc.ts              ← 순수 계산 함수 (DB 접근 없음)
│   ├── customer-logic.ts    ← 거래처 계산 (DB 접근 없음)
│   └── ledger-calc.ts       ← 원장 계산 (DB 접근 없음)
├── types/
│   ├── order.ts
│   └── quote.ts
└── constants/
    └── settings.ts    ← 설정 키 + fallback 기본값 (값 변경은 DB에서)
```

### restaurant-os

```
src/
├── actions/
├── app/(app)/
├── components/
├── lib/
│   ├── supabase-server.ts
│   ├── supabase-browser.ts
│   └── utils.ts
└── types/index.ts
```

---

## [NAMING] 네이밍 규칙 — HARD

정의된 패턴 외 사용 금지. 유사 의미라도 다른 표현 금지.

### 함수명

| 종류 | 패턴 | 허용 | 금지 |
|------|------|------|------|
| 생성 | `create{Entity}` | `createOrder` | `makeOrder` `addOrder` `newOrder` |
| 수정 | `update{Entity}` | `updateOrder` | `editOrder` `modifyOrder` |
| 취소 | `cancel{Entity}` | `cancelOrder` | `deleteOrder` `removeOrder` |
| 조회 | `get{Entity}` | `getOrders` | `fetchOrders` `loadOrders` |
| 계산 | `calc{What}` | `calcOrderTotals` | `computeTotals` `getTotals` |
| 포맷 | `format{What}` | `formatKRW` | `toKRW` `displayKRW` |
| 상태변경 | `{action}{Entity}` | `confirmOrder` | `changeOrderStatus` |

### 파일명

| 종류 | 패턴 | 허용 | 금지 |
|------|------|------|------|
| Server Action | `kebab-case.ts` | `order.ts` `customer-bulk.ts` | `Order.ts` `orderAction.ts` |
| 클라이언트 컴포넌트 | `PascalCase.tsx` | `OrderCreateForm.tsx` | `order-create-form.tsx` |
| 유틸 | `kebab-case.ts` | `calc.ts` `customer-logic.ts` | `Calc.ts` `customerLogic.ts` |

### 고정 변수명

```typescript
const supabase = await createSupabaseServer()  // 항상 supabase
const ctx      = await getAuthCtx(supabase)    // 항상 ctx
// ctx.tenant_id — snake_case 유지 (DB 필드명 일치)
```

---

## [RULE-22] 변경 범위 제한 — HARD

**요청된 기능과 무관한 파일 수정 금지.**

```
✅ 허용
- 요청 기능과 직접 관련된 파일 수정
- import 연결 수정 (타입, 함수 참조)
- 타입 오류 해결을 위한 최소 수정

⛔ 금지
- 요청과 무관한 리팩토링
- "겸사겸사" 디자인·스타일 변경
- naming 통일 작업
- 관련 없는 파일 구조 변경
```

**3개 이상 파일 수정이 필요한 경우:**
코드 작성 전 아래 형식으로 먼저 보고한다.

```
📋 변경 범위 보고
수정 파일 목록:
1. [파일 경로] — [수정 이유]
2. [파일 경로] — [수정 이유]
3. [파일 경로] — [수정 이유]
승인 후 진행합니다.
```

사용자 승인 없이 진행 금지.

---

## [RULE-23] 자동 리팩토링 금지 — HARD

**사용자가 명시적으로 요청하지 않은 리팩토링은 금지.**
"더 좋은 구조"라는 판단으로 임의 변경하지 않는다.

```
⛔ 금지 (요청 없을 시)
- 함수 분리 / 통합
- 파일 구조 변경
- 파일 이동
- 공통화 / abstraction 추가
- naming 변경
- "중복 제거했습니다"
- "구조 개선했습니다"
- "더 좋은 방식으로 변경했습니다"

✅ 허용 (요청 없어도 가능)
- 명시적 요청이 있는 경우
- 컴파일 오류 해결에 필요한 최소 변경
- RULE 위반 수정 (위반 내용 먼저 보고)
```

---

## [RULE-24] 미수금 / 연체금 / 예치금 혼용 금지 — HARD

**아래 4개 개념은 서로 독립적으로 관리한다. 혼용 금지.**

| 개념 | 정의 | 공식 |
|------|------|------|
| 미수금 (Accounts Receivable) | 아직 받지 못한 금액 | 총 판매금액 - 총 수금금액 - 반품금액 |
| 연체금 (Overdue Receivable) | 미수금 중 due_date 초과분 | due_date 초과 미수금 (미수금의 부분집합) |
| 예치금 (Customer Deposit) | 고객 초과 입금분 — 회사 부채(liability) | 수금액 - 미수금 차감분 |
| 수금 우선순위 | 운영 점수 (회계값 아님) | 미수금·연체 여부·거래 주기·마지막 수금일 기반 계산 |

```
⛔ 금지
- 연체금 = 미수금 으로 처리
- 수금 우선순위를 회계값처럼 DB 저장
- 예치금을 음수 미수금으로 저장 (receivable = -20,000 형태)
- 미수금 계산식을 파일마다 직접 작성 (단일 함수 사용 강제)
```

**미수금 계산은 반드시 단일 함수를 통해서만 수행한다.**
직접 계산식 작성 금지. 사용할 함수는 `lib/ledger-calc.ts`에 정의한다.

---

## [RULE-25] 예치금 별도 부채 관리 — HARD

**예치금은 `customer_deposits` 테이블로 별도 관리한다.**
미수금 필드를 음수로 만드는 방식 금지. (→ RULE-03 과거 데이터 불변과 연결)

```
⛔ 금지
- current_balance 음수 저장
- receivable_amount 음수 저장
- 미수금과 예치금을 상계하여 단일 필드에 저장
```

**수금 처리 흐름 (이 순서만 허용)**

```
수금 발생
  → payment_allocations 로 미수금 차감
  → 초과 금액은 customer_deposits 생성

예시: 미수금 50,000 / 입금 70,000
  → payment_allocations: 50,000 차감
  → customer_deposits:   20,000 생성
  → 결과: receivable = 0 / deposit = 20,000

❌ 금지: receivable = -20,000 형태 저장
```

관련 테이블: payments → payment_allocations → customer_deposits

---

## [RULE-26] 모든 DB 변경은 migration SQL 파일 필수 — HARD

**아래 작업은 반드시 migration SQL 파일 생성 후 수행한다.**

```
대상 작업:
- CREATE TABLE
- ALTER TABLE
- DROP COLUMN
- CREATE INDEX
- CREATE FUNCTION
- CREATE RPC
- RLS 정책 변경
- Trigger 변경

⛔ 금지
- Supabase Dashboard에서만 직접 수정
- DB 수정 후 migration 미기록
- migration 없이 schema 변경
```

**Migration 경로**
```
supabase/migrations/
```

**Migration 파일명 규칙**
```
YYYYMMDDHHMMSS_description.sql

✅ 허용
20260505120000_add_buyer_tenant_id_to_orders.sql
20260505130000_create_customer_deposits_table.sql

⛔ 금지
migration.sql / fix.sql / new.sql / temp.sql
```

**Seed 데이터 규칙**

```
초기 데이터: supabase/seed.sql

구분:
- supabase/migrations/ = schema 변경 (RULE-26 적용)
- supabase/seed.sql    = 초기 데이터 (migration 아님)

⛔ 금지
- migration 파일에 대량 seed 데이터 삽입
- schema 변경과 seed 데이터 혼용
```

**AI 실행 순서 강제**

```
1. migration SQL 파일 먼저 생성
2. Git 기록 (파일 경로 + 내용 출력)
3. 이후 DB 적용

migration 없는 DB 변경 작업은 실행 금지.
```


---

## [FORBIDDEN] 절대 금지 목록

감지 즉시 코드 생성 중단.

```
⛔ tenant_id 없는 쿼리                              [RULE-01]
⛔ 런타임 계산값 DB 저장                            [RULE-02]
⛔ 거래 확정 후 금액·스냅샷 필드 수정               [RULE-03]
⛔ 클라이언트 cost_price 신뢰                       [RULE-04]
⛔ 루프 안 DB 쿼리 (N+1)                           [RULE-05]
⛔ OS 간 직접 코드/DB 접근                         [RULE-06]
⛔ 컬럼 타입 변경 / 컬럼·테이블 삭제               [RULE-07]
⛔ 클라이언트에서 직접 Supabase 쿼리               [RULE-08]
⛔ any 타입                                        [RULE-09]
⛔ 핵심 엔티티 물리 삭제                           [RULE-10]
⛔ status 직접 update (전용 함수 우회)             [RULE-11]
⛔ collection_schedules insert 먼저 cancel 나중    [RULE-12]
⛔ TODO 주석 / console.log / 테스트 코드 잔존      [RULE-13]
⛔ 신규 테이블에 임시 RLS 정책                     [RULE-14]
⛔ getAuthCtx 없이 supplier-os 쿼리               [RULE-15]
⛔ 비즈니스 기준값 코드 하드코딩                   [RULE-16]
⛔ 소수점 금액 DB 저장                             [RULE-17]
⛔ 복수 write를 RPC 없이 순서 나열                 [RULE-19]
⛔ 상태 검증 없이 상태·금액 변경                   [RULE-20]
⛔ error 무시한 DB 호출                            [RULE-21]
⛔ 요청 범위 외 파일 수정                          [RULE-22]
⛔ 사용자 요청 없는 리팩토링                       [RULE-23]
⛔ 정의된 폴더 외 신규 디렉토리 생성               [FILE-STRUCTURE]
⛔ 정의된 네이밍 외 유사 표현 사용                 [NAMING]
⛔ SELECT *                                        [RULE-18]
⛔ pagination 없는 대량 조회                       [RULE-18]
⛔ 예치금을 음수 미수금으로 저장                     [RULE-24]
⛔ 연체금을 미수금과 동일하게 처리                   [RULE-24]
⛔ 미수금 계산식 파일마다 직접 작성                  [RULE-24]
⛔ current_balance / receivable_amount 음수 저장    [RULE-25]
⛔ 미수금과 예치금 상계 저장                         [RULE-25]
⛔ migration 없이 DB schema 변경                      [RULE-26]
⛔ Dashboard에서만 직접 DB 수정                       [RULE-26]
⛔ 파일명 규칙 위반 migration (fix.sql 등)            [RULE-26]
⛔ migration 파일에 seed 데이터 혼용                  [RULE-26]
```

---

## [PATTERNS] 표준 코드 패턴

### Server Action 기본 틀 (supplier-os)

```typescript
'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types/order'

export async function createEntity(
  input: CreateEntityInput
): Promise<ActionResult<CreatedEntity>> {
  // 1. 인증
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인이 필요합니다.' }

  // 2. 입력 검증
  if (!input.required_field) return { success: false, error: '필수값 누락.' }

  // 3. 상태 검증 (필요 시)
  const { data: existing } = await supabase
    .from('entities').select('id, status')
    .eq('id', input.id).eq('tenant_id', ctx.tenant_id).single()
  if (!existing) return { success: false, error: '대상을 찾을 수 없습니다.' }

  // 4. write (단일) 또는 RPC (복수 테이블)
  const { data, error } = await supabase
    .from('entities')
    .insert({ tenant_id: ctx.tenant_id, ...input })
    .select('id, name').single()
  if (error) return { success: false, error: error.message }

  // 6. 반환
  revalidatePath('/entities')
  return { success: true, data }
}
```

### Server Action 기본 틀 (restaurant-os)

```typescript
'use server'

import { createServerClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types'

export async function createEntity(
  restaurantId: string,
  input: CreateEntityInput
): Promise<ActionResult> {
  const supabase = await createServerClient()

  const { error } = await supabase
    .from('entities')
    .insert({ tenant_id: restaurantId, ...input })

  if (error) return { success: false, error: error.message }

  revalidatePath('/entities')
  return { success: true }
}
```

### 페이지 컴포넌트 기본 틀

```typescript
// src/app/(app)/{domain}/page.tsx
import { getEntities } from '@/actions/{domain}'
import EntityClient from '@/components/{domain}/EntityClient'

export const metadata = { title: '페이지명 — RealMyOS' }

export default async function EntityPage() {
  const result = await getEntities()
  if (!result.success) return <div>데이터를 불러올 수 없습니다.</div>
  return <EntityClient initialData={result.data ?? []} />
}
```

### 클라이언트 컴포넌트 기본 틀

```typescript
// src/components/{domain}/EntityClient.tsx
'use client'

import { useTransition } from 'react'
import { doSomething } from '@/actions/{domain}'
import type { Entity } from '@/types/order'

interface Props { initialData: Entity[] }

export default function EntityClient({ initialData }: Props) {
  const [isPending, startTransition] = useTransition()

  const handleAction = () => {
    startTransition(async () => {
      const result = await doSomething(input)
      if (!result.success) { alert(result.error); return }
    })
  }

  return <div>...</div>
}
```

---

## [DB-RULES] DB 쿼리 추가 규칙

### orders 테이블 조회 (전환 기간)

```typescript
// seller_tenant_id + 레거시 tenant_id 병행
.or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
```

### soft delete 처리

```typescript
.is('deleted_at', null)                             // 조회 시 항상 포함
.update({ deleted_at: new Date().toISOString() })   // 삭제 처리
```

### 금액 저장 타입

```typescript
supply_price: Math.round(amount / 1.1)  // ✅ integer 반올림
supply_price: amount / 1.1              // ⛔ 소수점 오염
```

---

## [SCHEMA] order_lines 스냅샷 필수 저장 필드

```typescript
{
  // 스냅샷 — 이후 상품 변경과 무관하게 고정
  product_id:       string,
  product_code:     string,
  product_name:     string,
  tax_type:         'taxable' | 'exempt',
  fulfillment_type: 'stock' | 'consignment',

  // 서버 확정값 (RULE-04)
  cost_price:   number,

  // 참고값 (표시용, 진실값 아님)
  unit_price:   number,
  quantity:     number,

  // 거래 확정값 — RULE-00 유형 2 (저장 필수, 이후 재계산 금지)
  supply_price: number,
  vat_amount:   number,
  line_total:   number,
}
```
