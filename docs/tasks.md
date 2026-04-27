# RealMyOS — tasks.md
> 멀티테넌트 구조 전환 실행 단위 작업 목록
> CONTEXT.md + rules.md 기반. 실제 코드 기준으로만 작성.
> 최종 업데이트: 2026-04-27

---

## 실행 원칙
- 각 PHASE는 독립적으로 실행 가능하다
- 각 Task는 한 번의 작업 세션에서 완료 가능한 수준으로 분해됨
- DB 변경은 반드시 `IF NOT EXISTS` / `IF EXISTS` 조건으로 작성 (롤백 안전)
- 기존 컬럼은 즉시 삭제하지 않고 deprecate 후 PHASE 5에서 제거
- Task 완료 시 `progress.md`에 기록

---

## 전체 진행 현황 (2026-04-27 기준)

| PHASE | 내용 | 완료 | 전체 | 상태 |
|-------|------|------|------|------|
| PHASE 1 | DB 구조 전환 | 5/7 | 7 | 진행 중 |
| PHASE 2 | Backend 로직 수정 | 0/7 | 7 | 대기 중 |
| PHASE 3 | RLS 정책 전환 | 0/4 | 4 | 대기 중 |
| PHASE 4 | 데이터 마이그레이션 | 0/3 | 3 | 대기 중 |
| PHASE 5 | 레거시 제거 | 0/3 | 3 | 대기 중 |

---

## PHASE 1 — DB 구조 전환

> 목표: orders / payments 단일화 컬럼 추가, restaurant_id 전환 준비
> 롤백: 추가된 컬럼만 DROP하면 원복 가능 (기존 컬럼 삭제 없음)

---

### ✅ [TASK-1-01] 완료 (2026-04-27)
**orders 테이블에 buyer_tenant_id, seller_tenant_id 컬럼 추가**

- 목적: orders를 단일 테이블로 전환하기 위한 컬럼 추가
- 완료 내용: buyer_tenant_id, seller_tenant_id 컬럼 및 인덱스 추가 완료
- 작업 내용:
  ```sql
  ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS buyer_tenant_id uuid REFERENCES tenants(id),
    ADD COLUMN IF NOT EXISTS seller_tenant_id uuid REFERENCES tenants(id);

  CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_tenant_id);
  CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_tenant_id);
  ```
- DB 변경 여부: YES ✅
- 검증 방법: `SELECT buyer_tenant_id, seller_tenant_id FROM orders LIMIT 1;` — 컬럼 존재 확인

---

### ✅ [TASK-1-02] 완료 (2026-04-27)
**supplier-os orders 테이블의 기존 레코드에 seller_tenant_id 값 채우기**

- 목적: 기존 orders의 seller_tenant_id = 현재 tenant_id로 설정
- 완료 내용: 기존 레코드 seller_tenant_id 백필 완료
- 작업 내용:
  ```sql
  UPDATE orders
  SET seller_tenant_id = tenant_id
  WHERE seller_tenant_id IS NULL
    AND tenant_id IS NOT NULL;
  ```
- DB 변경 여부: YES ✅

---

### ⏳ [TASK-1-03] 대기 중 — TASK-4-01 선행 필수
**restaurant-os orders 테이블의 기존 레코드에 buyer_tenant_id 값 채우기**

- 목적: restaurant-os의 기존 orders에 buyer_tenant_id 매핑
- ⚠️ 위험도: 높음 — restaurants ↔ tenants 연결 키 미확인 상태. TASK-4-01 완료 전 실행 금지
- 작업 내용:
  ```sql
  -- TODO: restaurants.id ↔ tenants.id 연결 키 확인 후 실행
  UPDATE orders
  SET buyer_tenant_id = restaurant_id  -- 매핑 키 확정 후 수정
  WHERE buyer_tenant_id IS NULL
    AND restaurant_id IS NOT NULL;
  ```
- 검증 방법:
  ```sql
  SELECT COUNT(*) FROM orders WHERE buyer_tenant_id IS NULL AND restaurant_id IS NOT NULL;
  -- 결과: 0 이어야 함
  ```

---

### ✅ [TASK-1-04] 완료 (2026-04-27)
**payments 테이블에 payer_tenant_id, payee_tenant_id, direction 컬럼 추가**

- 목적: payments 단일화를 위한 컬럼 추가
- 완료 내용: payments에 payer_tenant_id, payee_tenant_id, direction 컬럼 추가 완료
- DB 변경 여부: YES ✅

---

### ✅ [TASK-1-05] 완료 (2026-04-27)
**supplier-os payments 기존 레코드에 payee_tenant_id, direction 값 채우기**

- 목적: 공급자 입장의 payments = inbound (수취)
- 완료 내용: 기존 payments 레코드 payee_tenant_id, direction='inbound' 백필 완료
- DB 변경 여부: YES ✅

---

### ⏳ [TASK-1-06] 대기 중 — TASK-4-01 선행 필수
**restaurant-os payments_outgoing 기존 레코드에 payer_tenant_id, direction 값 채우기**

- 목적: 식당 입장의 payments = outbound (지급)
- ⚠️ 위험도: 높음 — restaurant_id → tenant_id 매핑 키 미확인. TASK-4-01 완료 전 실행 금지
- 작업 내용:
  ```sql
  UPDATE payments_outgoing
  SET
    payer_tenant_id = restaurant_id,  -- 매핑 키 확정 후 수정
    direction = 'outbound'
  WHERE payer_tenant_id IS NULL
    AND restaurant_id IS NOT NULL;
  ```

---

### ✅ [TASK-1-07] 완료 (2026-04-27)
**restaurant-os 핵심 테이블에 tenant_id 컬럼 추가 (restaurant_id 유지)**

- 목적: restaurant_id → tenant_id 전환 준비
- 완료 내용: ingredients, rfq_requests, fixed_costs, price_history, today_events, ai_decision_logs, savings_stats, notifications 8개 테이블 tenant_id 컬럼 추가 완료
- DB 변경 여부: YES ✅

---

## PHASE 2 — Backend 로직 수정

> 목표: actions 파일의 쿼리를 tenant 기준으로 전환
> ⚠️ 전제: PHASE 1 완료 후 실행 (현재 TASK-1-03, 1-06 미완료 — 해당 항목 제외하고 진행 가능)
> 롤백: git revert로 코드 복구 가능

---

### ⏸️ [TASK-2-01] 실행 가능 (PHASE 1 부분 완료)
**supplier-os `actions/order.ts` — 주문 생성 시 seller_tenant_id 자동 설정**

- 목적: 신규 주문 생성 시 seller_tenant_id = 현재 tenant_id로 저장
- ⚠️ 선행 확인: realmyos `createOrder` 정상 동작 검증 필요 (현재 미확인)
- 작업 내용:
  ```typescript
  // actions/order.ts — createOrder 함수 내
  const orderData = {
    tenant_id: tenantId,
    seller_tenant_id: tenantId,                       // 추가
    buyer_tenant_id: input.buyer_tenant_id ?? null,   // 추가
    customer_id: input.customer_id,
    // 기존 필드 유지
  }
  ```
- 변경 파일: `src/actions/order.ts`
- 위험도: 낮음
- 검증 방법: 주문 생성 후 `SELECT seller_tenant_id FROM orders ORDER BY created_at DESC LIMIT 1;`

---

### ⏸️ [TASK-2-02] 실행 가능
**supplier-os `actions/order-query.ts` — 조회 쿼리에 seller_tenant_id 조건 추가**

- 목적: orders 조회 시 seller_tenant_id 기준으로도 필터링 (tenant_id와 병행)
- 작업 내용:
  ```typescript
  // 기존
  .eq('tenant_id', tenantId)

  // 변경 (전환 기간 병행 사용)
  .or(`tenant_id.eq.${tenantId},seller_tenant_id.eq.${tenantId}`)
  ```
- 변경 파일: `src/actions/order-query.ts`
- 위험도: 중간 — 변경 전/후 조회 건수 동일한지 확인 필수

---

### ⏸️ [TASK-2-03] 실행 가능
**supplier-os `actions/payment.ts` — 결제 생성 시 payee_tenant_id, direction 자동 설정**

- 목적: 신규 payments 생성 시 payee_tenant_id = 현재 tenant_id, direction = 'inbound'
- 작업 내용:
  ```typescript
  const paymentData = {
    tenant_id: tenantId,
    payee_tenant_id: tenantId,   // 추가
    direction: 'inbound',         // 추가
    // 기존 필드 유지
  }
  ```
- 변경 파일: `src/actions/payment.ts`
- 위험도: 낮음

---

### ⏸️ [TASK-2-04] 실행 가능 — restaurant-os 검증 후
**restaurant-os `actions/rfq.ts` — tenant_id 기준으로 전환**

- 목적: rfq_requests 생성·조회 시 tenant_id 사용
- ⚠️ 선행 확인: restaurant-os `npm run dev` 정상 동작 검증 필요 (현재 미확인)
- 작업 내용:
  ```typescript
  // 기존
  .eq('restaurant_id', restaurantId)

  // 변경
  .eq('tenant_id', tenantId)
  ```
- 변경 파일: `src/actions/rfq.ts`
- 위험도: 중간

---

### ⏸️ [TASK-2-05] 실행 가능 — restaurant-os 검증 후
**restaurant-os `actions/money.ts` — payments 단일화 구조로 전환**

- 목적: payments_outgoing → payments(direction=outbound) 전환
- 작업 내용:
  ```typescript
  // .from('payments_outgoing') → .from('payments')
  // + direction = 'outbound' 조건 추가
  // + payer_tenant_id = tenantId 조건 추가
  ```
- 변경 파일: `src/actions/money.ts`
- 위험도: 높음 — 기존 payments_outgoing 데이터 접근 영향 있음

---

### ⏸️ [TASK-2-06] 실행 가능 — restaurant-os 검증 후
**restaurant-os `actions/suppliers.ts` — supplier_contacts 구조 병행 준비**

- 목적: suppliers 테이블 쿼리에 tenant_id 조건 추가 (구조 전환 전 준비 단계)
- 작업 내용: restaurant_id → tenant_id 조건으로 전환
- 변경 파일: `src/actions/suppliers.ts`
- 위험도: 중간

---

### ⏸️ [TASK-2-07] 실행 가능 — restaurant-os 검증 후
**restaurant-os 나머지 actions — tenant_id 기준으로 전환**

- 목적: today.ts, today-events.ts, import.ts, ai-logs.ts, settings.ts 전체 전환
- 대상 파일:
  - `src/actions/today.ts`
  - `src/actions/today-events.ts`
  - `src/actions/ai-logs.ts`
  - `src/actions/settings.ts`
- 작업 내용: 각 파일의 restaurant_id → tenant_id 전환
- 위험도: 중간

---

## PHASE 3 — RLS 정책 전환

> ⚠️ 전제: PHASE 2 전체 완료 후 실행 (특히 TASK-2-07 완료 필수)
> 위험도: 높음 — tenant_id가 NULL인 레코드 접근 불가

---

### ⏳ [TASK-3-01] 대기 중
**ingredients 테이블 RLS — tenant_id 기반으로 강화**

```sql
DROP POLICY IF EXISTS "auth_all" ON ingredients;
CREATE POLICY "tenant_isolation" ON ingredients
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );
```
- 위험도: 높음 — TASK-2-07 완료 필수

---

### ⏳ [TASK-3-02] 대기 중
**rfq_requests, fixed_costs, price_history RLS 강화**

- TASK-3-01과 동일한 패턴 적용
- 위험도: 높음

---

### ⏳ [TASK-3-03] 대기 중
**orders 테이블 RLS — buyer/seller 양방향 접근 정책 적용**

```sql
DROP POLICY IF EXISTS "auth_all" ON orders;
CREATE POLICY "order_access" ON orders
  FOR ALL USING (
    (SELECT tenant_id FROM users WHERE id = auth.uid())
    IN (buyer_tenant_id, seller_tenant_id, tenant_id)
  );
```
- 위험도: 높음 — TASK-1-01, 1-02, 2-01 완료 필수

---

### ⏳ [TASK-3-04] 대기 중
**payments 테이블 RLS — payer/payee 양방향 접근 정책 적용**

```sql
DROP POLICY IF EXISTS "auth_all" ON payments;
CREATE POLICY "payment_access" ON payments
  FOR ALL USING (
    (SELECT tenant_id FROM users WHERE id = auth.uid())
    IN (payer_tenant_id, payee_tenant_id, tenant_id)
  );
```
- 위험도: 높음 — TASK-1-04, 1-05 완료 필수

---

## PHASE 4 — 데이터 마이그레이션

> ⚠️ 전제: TASK-4-01 선행 필수 — restaurants ↔ tenants 연결 키 미확인 상태

---

### ⏳ [TASK-4-01] 즉시 실행 가능 (조회 전용)
**restaurants ↔ tenants 연결 키 확인 및 매핑 테이블 작성**

- 목적: restaurant_id → tenant_id 변환 기준 확정
- ⚠️ 이 Task가 완료되어야 TASK-1-03, 1-06, 4-02, 4-03 실행 가능
- 작업 내용:
  ```sql
  SELECT r.id AS restaurant_id, r.name, t.id AS tenant_id
  FROM restaurants r
  LEFT JOIN tenants t ON t.name = r.name
  LIMIT 20;
  ```
- 위험도: 없음 (조회 전용)

---

### ⏳ [TASK-4-02] 대기 중 — TASK-4-01 완료 후
**ingredients 기존 레코드 tenant_id 일괄 채우기**

---

### ⏳ [TASK-4-03] 대기 중 — TASK-4-01 완료 후
**나머지 테이블 tenant_id 일괄 채우기**
- 대상: rfq_requests, fixed_costs, price_history, today_events, ai_decision_logs, savings_stats, notifications

---

## PHASE 5 — 레거시 제거

> ⚠️ PHASE 1~4 전체 완료 + 전체 기능 정상 동작 확인 후 실행
> ⚠️ 비가역적 작업 — 반드시 백업 후 실행

---

### ⏳ [TASK-5-01] 대기 중
**restaurant-os 테이블에서 restaurant_id 컬럼 제거**

---

### ⏳ [TASK-5-02] 대기 중
**restaurant-os `actions/suppliers.ts` → supplier_contacts 구조 전환**

---

### ⏳ [TASK-5-03] 대기 중
**supplier-os `actions/customer.ts` → supplier_contacts 통합 방향 전환**
- ⚠️ CRM 핵심 데이터 — 전환 시점 및 방식 별도 결정 필요

---

## 즉시 실행 가능한 다음 작업 (우선순위 순)

1. **[검증] restaurant-os `npm run dev`** — 코드 전환 후 실제 동작 확인 (사람이 직접)
2. **[검증] realmyos `createOrder`** — getAuthCtx fallback 적용 후 동작 확인 (사람이 직접)
3. **[TASK-4-01]** — restaurants ↔ tenants 연결 키 조회 (조회 전용, 안전)
4. **[TASK-2-01]** — supplier-os order.ts seller_tenant_id 추가 (2번 완료 후)
5. **[TASK-2-02]** — supplier-os order-query.ts 조건 추가
6. **[TASK-2-03]** — supplier-os payment.ts payee_tenant_id 추가

---

## 미해결 TODO (실행 전 해소 필요)

| # | 내용 | 관련 Task | 우선순위 |
|---|------|----------|---------|
| 1 | restaurants ↔ tenants 실제 연결 키 확인 | TASK-4-01 | 높음 |
| 2 | restaurant-os npm run dev 동작 검증 | PHASE 2 restaurant | 높음 |
| 3 | realmyos createOrder 동작 검증 | TASK-2-01 | 높음 |
| 4 | supplier-os schema.sql 전체 컬럼 확인 | TASK-1-03, 1-06 | 중간 |
| 5 | restaurant-os user role 실제 값 확인 | PHASE 3 전체 | 중간 |
| 6 | suppliers 참조 컴포넌트 목록 확인 | TASK-5-02 | 낮음 |
| 7 | customers → supplier_contacts 전환 방식 결정 | TASK-5-03 | 낮음 |