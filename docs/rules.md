# RealMyOS — rules.md
> AI가 이 규칙을 어기면 즉시 중단하고 정무님에게 확인을 요청한다.
> 최종 업데이트: 2026-04-23

---

## [RULE-01] tenant_id / restaurant_id 필수 필터

**supplier-os의 모든 DB 쿼리는 반드시 tenant_id를 포함한다.**
**restaurant-os의 모든 DB 쿼리는 반드시 restaurant_id를 포함한다.**

```typescript
// ✅ 올바름
const { data } = await supabase
  .from('orders')
  .select('*')
  .eq('tenant_id', tenantId)

// ❌ 금지 — tenant_id 없음
const { data } = await supabase
  .from('orders')
  .select('*')
```

- RLS가 있어도 서버 액션에서 이중 검증한다
- tenant_id 없는 쿼리는 어떤 이유로도 허용하지 않는다

---

## [RULE-02] 계산값 DB 저장 금지

**`lib/calc.ts`, `lib/customer-logic.ts` 등의 계산 결과는 DB에 저장하지 않는다.**
계산은 항상 런타임에 순수 함수로 수행한다.

```typescript
// ✅ 올바름 — 런타임 계산
const score = calcActionScore(customer, orders, payments)

// ❌ 금지 — 계산값 저장
await supabase.from('customers').update({ action_score: score })
```

**예외 없음.** 저장이 필요하다고 판단되면 정무님에게 먼저 확인한다.

적용 대상:
- `calcActionScore` — DB 저장 금지
- `calcCustomerStatus` — DB 저장 금지
- `calcNextActionDate` — DB 저장 금지
- `LineCalculation`, `OrderTotals` — DB 저장 금지
- 절약 통계(`saving_amount`)는 예외 — orders 생성 시점에 확정값으로 저장

---

## [RULE-03] 과거 데이터 불변

**한 번 생성된 레코드의 핵심 수치는 수정하지 않는다.**

```typescript
// ✅ 올바름 — 취소는 status 변경으로
await supabase.from('orders').update({ status: 'cancelled' })

// ❌ 금지 — 과거 주문 금액 수정
await supabase.from('orders').update({ total_amount: newAmount })
```

적용 대상:
- `order_lines.cost_price` — 주문 시점 스냅샷, 절대 수정 불가
- `order_lines.product_code`, `product_name` — 스냅샷, 수정 불가
- `payments.amount` — 수정 불가, 취소 후 재생성
- `collection_schedules` — 이력 구조, 삭제 후 재삽입 (cancel→insert 순서)
- `price_history` — append-only, 수정/삭제 금지

---

## [RULE-04] cost_price 서버 확정

**클라이언트가 보내는 cost_price 값을 절대 신뢰하지 않는다.**
서버 액션에서 항상 DB에서 직접 조회 후 저장한다.

```typescript
// ✅ 올바름
const { data: product } = await supabase
  .from('products')
  .select('current_cost_price')
  .eq('id', line.product_id)
  .eq('tenant_id', tenantId)
  .single()
const costPrice = product.current_cost_price  // 서버 확정값 사용

// ❌ 금지
const costPrice = line.cost_price  // 클라이언트 값 신뢰 금지
```

---

## [RULE-05] N+1 쿼리 금지

**루프 안에서 DB 쿼리를 실행하지 않는다.**
항상 한 번의 쿼리로 필요한 데이터를 가져온다.

```typescript
// ✅ 올바름 — IN 절로 한 번에
const { data: products } = await supabase
  .from('products')
  .select('id, current_cost_price')
  .in('id', lines.map(l => l.product_id))
  .eq('tenant_id', tenantId)

// ❌ 금지 — 루프 안에서 쿼리
for (const line of lines) {
  const { data } = await supabase.from('products').select('*').eq('id', line.product_id)
}
```

---

## [RULE-06] supplier-os ↔ restaurant-os 분리 원칙

**두 앱의 코드는 서로 import하지 않는다.**
**두 앱의 DB는 직접 쿼리하지 않는다.**

- supplier-os 코드에서 restaurant-os DB 접근 금지
- restaurant-os 코드에서 supplier-os DB 접근 금지
- 연동이 필요하면 API 또는 webhook으로만 구현 (TODO)
- 공통 타입이 필요하면 각 앱에 별도로 정의한다

---

## [RULE-07] API/DB 변경 시 하위 호환 유지

**기존 기능을 깨는 변경은 허용하지 않는다.**

```sql
-- ✅ 올바름 — 컬럼 추가 (기존 데이터 유지)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS new_field text;

-- ❌ 금지 — 컬럼 타입 변경, 컬럼 삭제
ALTER TABLE orders ALTER COLUMN status TYPE integer;
DROP COLUMN total_amount;
```

- 컬럼 삭제 전 반드시 정무님 확인
- 타입 변경 전 반드시 마이그레이션 계획 수립
- 기존 페이지가 동작하는지 확인 후 배포

---

## [RULE-08] Server Action 전용 DB 접근

**클라이언트 컴포넌트에서 직접 Supabase 쿼리를 작성하지 않는다.**
DB 접근은 `actions/` 폴더의 Server Action을 통해서만 한다.

```typescript
// ✅ 올바름 — Server Action 호출
'use client'
const result = await createOrder(input)

// ❌ 금지 — 클라이언트에서 직접 쿼리
'use client'
const supabase = createBrowserClient(...)
const { data } = await supabase.from('orders').insert(...)
```

예외: `lib/supabase-browser.ts`는 인증 상태 확인 목적으로만 허용

---

## [RULE-09] TypeScript strict 모드 유지

- `any` 타입 사용 금지
- 모든 함수 파라미터와 반환값에 타입 명시
- `ActionResult<T>` 패턴으로 에러 처리 통일

```typescript
// ✅ 올바름
export async function createOrder(input: CreateOrderInput): Promise<ActionResult<CreatedOrder>> {
  try {
    // ...
    return { success: true, data: result }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ❌ 금지
export async function createOrder(input: any) {
  // 에러 처리 없음
}
```

---

## [RULE-10] 고객(식당) 삭제 금지

**supplier-os의 customers 레코드는 삭제하지 않는다.**
거래 종료는 `trade_status` 또는 `is_active` 필드로 관리한다.

```typescript
// ✅ 올바름
await supabase.from('customers').update({ trade_status: 'inactive' })

// ❌ 금지
await supabase.from('customers').delete().eq('id', customerId)
```

---

## [RULE-11] 주문 상태 순서 강제

**supplier-os 주문 상태는 정해진 순서로만 변경된다.**

```
draft → confirmed → cancelled
         ↓
      (납품완료 = 별도 필드 또는 status 확장)
```

- `cancelled` → 다른 상태로 되돌리기 금지
- `confirmed` 주문의 금액 수정 금지 (취소 후 재생성)

---

## [RULE-12] collection_schedules cancel→insert 순서

**수금 일정 수정 시 반드시 cancel 먼저, insert 나중에 실행한다.**

```typescript
// ✅ 올바름
await cancelCollectionSchedule(existingId)  // 먼저
await createCollectionSchedule(newData)     // 나중
```

역순 금지. 동시 실행 금지.

---

## [RULE-13] 배포 즉시 동작하는 기능만 납품

**미완성 기능, TODO 로직, 임시 코드는 배포하지 않는다.**

- `// TODO:` 주석이 있는 로직은 배포 전 완성 또는 제거
- mock 데이터를 실제처럼 보이게 하는 코드 금지
- `console.log` 디버그 코드 배포 금지

---

## [RULE-14] restaurant-os RLS 강화 원칙

**현재 restaurant-os RLS는 개발 단계 설정 (`auth.role() = 'authenticated'`)이다.**
신규 테이블 추가 시 반드시 `restaurant_id` 기반 정책으로 작성한다.

```sql
-- ✅ 올바름 — restaurant_id 기반
CREATE POLICY "owner_only" ON new_table
  FOR ALL USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

-- ❌ 임시 정책 (기존 테이블만 허용, 신규 테이블에 사용 금지)
CREATE POLICY "auth_all" ON new_table FOR ALL USING (auth.role() = 'authenticated');
```
