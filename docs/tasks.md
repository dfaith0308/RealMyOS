# RealMyOS — tasks.md
> 멀티테넌트 구조 전환 실행 단위 작업 목록
> CONTEXT.md + rules.md 기반. 실제 코드 기준으로만 작성.
> 최종 업데이트: 2026-04-23

---

## 실행 원칙
- 각 PHASE는 독립적으로 실행 가능하다
- 각 Task는 한 번의 작업 세션에서 완료 가능한 수준으로 분해됨
- DB 변경은 반드시 `IF NOT EXISTS` / `IF EXISTS` 조건으로 작성 (롤백 안전)
- 기존 컬럼은 즉시 삭제하지 않고 deprecate 후 PHASE 5에서 제거
- Task 완료 시 `progress.md`에 기록

---

## PHASE 1 — DB 구조 전환

> 목표: orders / payments 단일화 컬럼 추가, restaurant_id 전환 준비
> 롤백: 추가된 컬럼만 DROP하면 원복 가능 (기존 컬럼 삭제 없음)

---

### [TASK-1-01]
**orders 테이블에 buyer_tenant_id, seller_tenant_id 컬럼 추가**

- 목적: orders를 단일 테이블로 전환하기 위한 컬럼 추가
- 작업 내용:
  ```sql
  ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS buyer_tenant_id uuid REFERENCES tenants(id),
    ADD COLUMN IF NOT EXISTS seller_tenant_id uuid REFERENCES tenants(id);

  CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_tenant_id);
  CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_tenant_id);
  ```
- 영향 범위: orders 테이블 (컬럼 추가만, 기존 데이터 변경 없음)
- 변경 파일: Supabase SQL Editor 실행 (migration 파일로 저장 권장)
- DB 변경 여부: YES
- 위험도: 낮음 (컬럼 추가만, 기존 쿼리 영향 없음)
- 검증 방법: `SELECT buyer_tenant_id, seller_tenant_id FROM orders LIMIT 1;` — 컬럼 존재 확인

---

### [TASK-1-02]
**supplier-os orders 테이블의 기존 레코드에 seller_tenant_id 값 채우기**

- 목적: 기존 orders의 seller_tenant_id = 현재 tenant_id로 설정
- 작업 내용:
  ```sql
  UPDATE orders
  SET seller_tenant_id = tenant_id
  WHERE seller_tenant_id IS NULL
    AND tenant_id IS NOT NULL;
  ```
- 영향 범위: orders 테이블 전체 레코드
- 변경 파일: Supabase SQL Editor 실행
- DB 변경 여부: YES
- 위험도: 중간 (데이터 업데이트 — 실행 전 SELECT로 대상 건수 확인 필수)
- 검증 방법:
  ```sql
  SELECT COUNT(*) FROM orders WHERE seller_tenant_id IS NULL AND tenant_id IS NOT NULL;
  -- 결과: 0 이어야 함
  ```

---

### [TASK-1-03]
**restaurant-os orders 테이블의 기존 레코드에 buyer_tenant_id 값 채우기**

- 목적: restaurant-os의 기존 orders에 buyer_tenant_id 매핑
- 작업 내용:
  ```sql
  -- restaurant_id → tenant_id 매핑 기준 확인 필요
  -- TODO: restaurants.id ↔ tenants.id 연결 키 확인 후 실행
  UPDATE orders
  SET buyer_tenant_id = restaurant_id  -- 매핑 키 확정 후 수정
  WHERE buyer_tenant_id IS NULL
    AND restaurant_id IS NOT NULL;
  ```
- 영향 범위: restaurant-os orders 테이블 레코드
- 변경 파일: Supabase SQL Editor 실행
- DB 변경 여부: YES
- 위험도: 높음 (TODO 해소 전 실행 금지 — restaurants ↔ tenants 연결 키 미확인)
- 검증 방법:
  ```sql
  SELECT COUNT(*) FROM orders WHERE buyer_tenant_id IS NULL AND restaurant_id IS NOT NULL;
  -- 결과: 0 이어야 함
  ```

---

### [TASK-1-04]
**payments 테이블에 payer_tenant_id, payee_tenant_id, direction 컬럼 추가**

- 목적: payments 단일화를 위한 컬럼 추가
- 작업 내용:
  ```sql
  -- supplier-os payments 테이블
  ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS payer_tenant_id uuid REFERENCES tenants(id),
    ADD COLUMN IF NOT EXISTS payee_tenant_id uuid REFERENCES tenants(id),
    ADD COLUMN IF NOT EXISTS direction text CHECK (direction IN ('inbound', 'outbound'));

  CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments(payer_tenant_id);
  CREATE INDEX IF NOT EXISTS idx_payments_payee ON payments(payee_tenant_id);

  -- restaurant-os payments_outgoing 테이블 (별도 실행)
  ALTER TABLE payments_outgoing
    ADD COLUMN IF NOT EXISTS payer_tenant_id uuid REFERENCES tenants(id),
    ADD COLUMN IF NOT EXISTS payee_tenant_id uuid REFERENCES tenants(id),
    ADD COLUMN IF NOT EXISTS direction text CHECK (direction IN ('inbound', 'outbound'));
  ```
- 영향 범위: payments, payments_outgoing 테이블 (컬럼 추가만)
- 변경 파일: Supabase SQL Editor 실행
- DB 변경 여부: YES
- 위험도: 낮음 (컬럼 추가만)
- 검증 방법:
  ```sql
  SELECT payer_tenant_id, payee_tenant_id, direction FROM payments LIMIT 1;
  SELECT payer_tenant_id, payee_tenant_id, direction FROM payments_outgoing LIMIT 1;
  ```

---

### [TASK-1-05]
**supplier-os payments 기존 레코드에 payee_tenant_id, direction 값 채우기**

- 목적: 공급자 입장의 payments = inbound (수취)
- 작업 내용:
  ```sql
  UPDATE payments
  SET
    payee_tenant_id = tenant_id,
    direction = 'inbound'
  WHERE payee_tenant_id IS NULL
    AND tenant_id IS NOT NULL;
  ```
- 영향 범위: supplier-os payments 테이블
- 변경 파일: Supabase SQL Editor 실행
- DB 변경 여부: YES
- 위험도: 중간
- 검증 방법:
  ```sql
  SELECT COUNT(*) FROM payments WHERE direction IS NULL AND tenant_id IS NOT NULL;
  -- 결과: 0 이어야 함
  ```

---

### [TASK-1-06]
**restaurant-os payments_outgoing 기존 레코드에 payer_tenant_id, direction 값 채우기**

- 목적: 식당 입장의 payments = outbound (지급)
- 작업 내용:
  ```sql
  -- TODO: restaurant_id → tenant_id 매핑 키 확인 후 실행
  UPDATE payments_outgoing
  SET
    payer_tenant_id = restaurant_id,  -- 매핑 키 확정 후 수정
    direction = 'outbound'
  WHERE payer_tenant_id IS NULL
    AND restaurant_id IS NOT NULL;
  ```
- 영향 범위: restaurant-os payments_outgoing 테이블
- 변경 파일: Supabase SQL Editor 실행
- DB 변경 여부: YES
- 위험도: 높음 (TODO 해소 전 실행 금지)
- 검증 방법:
  ```sql
  SELECT COUNT(*) FROM payments_outgoing WHERE direction IS NULL;
  -- 결과: 0 이어야 함
  ```

---

### [TASK-1-07]
**restaurant-os 핵심 테이블에 tenant_id 컬럼 추가 (restaurant_id 유지)**

- 목적: restaurant_id → tenant_id 전환 준비. 기존 컬럼 삭제 없음.
- 작업 내용:
  ```sql
  ALTER TABLE ingredients
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

  ALTER TABLE rfq_requests
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

  ALTER TABLE fixed_costs
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

  ALTER TABLE price_history
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

  ALTER TABLE today_events
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

  ALTER TABLE ai_decision_logs
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

  ALTER TABLE savings_stats
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

  ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
  ```
- 영향 범위: restaurant-os 핵심 테이블 8개 (컬럼 추가만)
- 변경 파일: Supabase SQL Editor 실행
- DB 변경 여부: YES
- 위험도: 낮음
- 검증 방법: 각 테이블에서 `tenant_id` 컬럼 존재 확인

---

## PHASE 2 — Backend 로직 수정

> 목표: actions 파일의 쿼리를 tenant 기준으로 전환
> 전제: PHASE 1 완료 후 실행
> 롤백: git revert로 코드 복구 가능

---

### [TASK-2-01]
**supplier-os `actions/order.ts` — 주문 생성 시 seller_tenant_id 자동 설정**

- 목적: 신규 주문 생성 시 seller_tenant_id = 현재 tenant_id로 저장
- 작업 내용:
  ```typescript
  // actions/order.ts — createOrder 함수 내
  // 기존
  const orderData = {
    tenant_id: tenantId,
    customer_id: input.customer_id,
    // ...
  }

  // 변경
  const orderData = {
    tenant_id: tenantId,
    seller_tenant_id: tenantId,        // 추가
    buyer_tenant_id: input.buyer_tenant_id ?? null,  // 추가 (restaurant 연결 시)
    customer_id: input.customer_id,
    // ...
  }
  ```
- 영향 범위: `src/actions/order.ts` — createOrder 함수
- 변경 파일: `C:\Users\babok\Desktop\realmyos\src\actions\order.ts`
- DB 변경 여부: NO (TASK-1-01 완료 후 실행)
- 위험도: 낮음 (추가 필드만, 기존 로직 변경 없음)
- 검증 방법: 주문 생성 후 `SELECT seller_tenant_id FROM orders ORDER BY created_at DESC LIMIT 1;`

---

### [TASK-2-02]
**supplier-os `actions/order-query.ts` — 조회 쿼리에 seller_tenant_id 조건 추가**

- 목적: orders 조회 시 seller_tenant_id 기준으로도 필터링 (tenant_id와 병행)
- 작업 내용:
  ```typescript
  // 기존
  .eq('tenant_id', tenantId)

  // 변경 (이중 조건 — 전환 기간 동안 병행 사용)
  .or(`tenant_id.eq.${tenantId},seller_tenant_id.eq.${tenantId}`)
  ```
- 영향 범위: `src/actions/order-query.ts` — 전체 orders 조회 함수
- 변경 파일: `C:\Users\babok\Desktop\realmyos\src\actions\order-query.ts`
- DB 변경 여부: NO
- 위험도: 중간 (쿼리 조건 변경 — 기존 데이터 누락 없는지 확인 필요)
- 검증 방법: 변경 전/후 orders 조회 건수 동일한지 확인

---

### [TASK-2-03]
**supplier-os `actions/payment.ts` — 결제 생성 시 payee_tenant_id, direction 자동 설정**

- 목적: 신규 payments 생성 시 payee_tenant_id = 현재 tenant_id, direction = 'inbound'
- 작업 내용:
  ```typescript
  // actions/payment.ts — createPayment 함수 내
  const paymentData = {
    tenant_id: tenantId,
    payee_tenant_id: tenantId,   // 추가
    direction: 'inbound',         // 추가
    // 기존 필드 유지
  }
  ```
- 영향 범위: `src/actions/payment.ts` — createPayment 함수
- 변경 파일: `C:\Users\babok\Desktop\realmyos\src\actions\payment.ts`
- DB 변경 여부: NO (TASK-1-04 완료 후 실행)
- 위험도: 낮음
- 검증 방법: 결제 생성 후 `SELECT payee_tenant_id, direction FROM payments ORDER BY created_at DESC LIMIT 1;`

---

### [TASK-2-04]
**restaurant-os `actions/orders.ts` — 주문 생성 시 buyer_tenant_id 자동 설정**

- 목적: restaurant-os에서 발주 확정 시 buyer_tenant_id = 현재 tenant_id
- 작업 내용:
  ```typescript
  // actions/orders.ts — createOrder 함수 내
  const orderData = {
    restaurant_id: restaurantId,   // 기존 유지 (PHASE 5에서 제거)
    buyer_tenant_id: tenantId,     // 추가
    // 기존 필드 유지
  }
  ```
- 영향 범위: `src/actions/orders.ts`
- 변경 파일: `C:\Users\babok\Desktop\resturant_os\src\actions\orders.ts`
- DB 변경 여부: NO (TASK-1-01 완료 후 실행)
- 위험도: 낮음
- 검증 방법: 발주 확정 후 `SELECT buyer_tenant_id FROM orders ORDER BY created_at DESC LIMIT 1;`

---

### [TASK-2-05]
**restaurant-os `actions/money.ts` — 지급 생성 시 payer_tenant_id, direction 자동 설정**

- 목적: restaurant-os에서 지급 예정 생성 시 payer_tenant_id = 현재 tenant_id, direction = 'outbound'
- 작업 내용:
  ```typescript
  // actions/money.ts — createPayment 함수 내
  const paymentData = {
    restaurant_id: restaurantId,   // 기존 유지 (PHASE 5에서 제거)
    payer_tenant_id: tenantId,     // 추가
    direction: 'outbound',          // 추가
    // 기존 필드 유지
  }
  ```
- 영향 범위: `src/actions/money.ts`
- 변경 파일: `C:\Users\babok\Desktop\resturant_os\src\actions\money.ts`
- DB 변경 여부: NO (TASK-1-04 완료 후 실행)
- 위험도: 낮음
- 검증 방법: 지급 생성 후 `SELECT payer_tenant_id, direction FROM payments_outgoing ORDER BY created_at DESC LIMIT 1;`

---

### [TASK-2-06]
**restaurant-os `actions/suppliers.ts` — 신규 공급자 등록 시 tenant_id 병행 저장**

- 목적: supplier_contacts 전환 준비 — 신규 등록 시 tenant_id도 함께 저장
- 작업 내용:
  ```typescript
  // actions/suppliers.ts — createSupplier 함수 내
  const supplierData = {
    restaurant_id: restaurantId,    // 기존 유지
    tenant_id: tenantId,            // 추가 (TASK-1-07 완료 후)
    // 기존 필드 유지
  }
  ```
- 영향 범위: `src/actions/suppliers.ts` — createSupplier 함수
- 변경 파일: `C:\Users\babok\Desktop\resturant_os\src\actions\suppliers.ts`
- DB 변경 여부: NO
- 위험도: 낮음
- 검증 방법: 공급자 등록 후 tenant_id 컬럼 값 확인

---

### [TASK-2-07]
**restaurant-os 핵심 actions — 신규 레코드 생성 시 tenant_id 병행 저장**

- 목적: ingredients, rfq_requests, fixed_costs 생성 시 tenant_id 함께 저장
- 작업 내용:
  ```typescript
  // actions/settings.ts — createIngredient 함수
  { restaurant_id: restaurantId, tenant_id: tenantId, ...input }

  // actions/rfq.ts — createRfqRequest 함수
  { restaurant_id: restaurantId, tenant_id: tenantId, ...input }

  // actions/settings.ts — createFixedCost 함수
  { restaurant_id: restaurantId, tenant_id: tenantId, ...input }
  ```
- 영향 범위:
  - `src/actions/settings.ts` — createIngredient, createFixedCost
  - `src/actions/rfq.ts` — createRfqRequest
- 변경 파일:
  - `C:\Users\babok\Desktop\resturant_os\src\actions\settings.ts`
  - `C:\Users\babok\Desktop\resturant_os\src\actions\rfq.ts`
- DB 변경 여부: NO (TASK-1-07 완료 후 실행)
- 위험도: 낮음
- 검증 방법: 각 레코드 생성 후 tenant_id 컬럼 값 확인

---

## PHASE 3 — RLS 정책 전환

> 목표: restaurant-os RLS를 tenant_id 기반으로 강화
> 전제: PHASE 1 + PHASE 2 완료 후 실행
> 롤백: 기존 policy DROP 후 재생성 가능

---

### [TASK-3-01]
**restaurant-os 핵심 테이블 RLS — 기존 auth_all 정책 교체 (ingredients)**

- 목적: ingredients 테이블 RLS를 tenant_id 기반으로 강화
- 작업 내용:
  ```sql
  -- 기존 정책 제거
  DROP POLICY IF EXISTS "auth_all" ON ingredients;

  -- 신규 정책 적용
  CREATE POLICY "tenant_isolation" ON ingredients
    FOR ALL USING (
      tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
    );
  ```
- 영향 범위: ingredients 테이블 RLS
- 변경 파일: Supabase SQL Editor 실행
- DB 변경 여부: YES (RLS 정책 변경)
- 위험도: 높음 (tenant_id가 NULL인 기존 레코드 접근 불가 — TASK-2-07 완료 필수)
- 검증 방법: restaurant-os 로그인 후 식자재 목록 정상 조회 확인

---

### [TASK-3-02]
**restaurant-os 핵심 테이블 RLS — rfq_requests, fixed_costs, price_history**

- 목적: 나머지 restaurant 도메인 테이블 RLS 강화
- 작업 내용:
  ```sql
  DROP POLICY IF EXISTS "auth_all" ON rfq_requests;
  CREATE POLICY "tenant_isolation" ON rfq_requests
    FOR ALL USING (
      tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
    );

  DROP POLICY IF EXISTS "auth_all" ON fixed_costs;
  CREATE POLICY "tenant_isolation" ON fixed_costs
    FOR ALL USING (
      tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
    );

  DROP POLICY IF EXISTS "auth_all" ON price_history;
  CREATE POLICY "tenant_isolation" ON price_history
    FOR ALL USING (
      tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
    );
  ```
- 영향 범위: rfq_requests, fixed_costs, price_history
- 변경 파일: Supabase SQL Editor 실행
- DB 변경 여부: YES
- 위험도: 높음 (TASK-2-07 완료 필수)
- 검증 방법: 각 화면에서 데이터 정상 조회 확인

---

### [TASK-3-03]
**orders 테이블 RLS — buyer/seller 양방향 접근 정책 적용**

- 목적: orders를 buyer(restaurant)와 seller(supplier) 양쪽에서 접근 가능하도록 설정
- 작업 내용:
  ```sql
  DROP POLICY IF EXISTS "auth_all" ON orders;

  CREATE POLICY "order_access" ON orders
    FOR ALL USING (
      (SELECT tenant_id FROM users WHERE id = auth.uid())
      IN (buyer_tenant_id, seller_tenant_id, tenant_id)
    );
  ```
- 영향 범위: orders 테이블 RLS
- 변경 파일: Supabase SQL Editor 실행
- DB 변경 여부: YES
- 위험도: 높음 (TASK-1-01, TASK-1-02, TASK-2-01 완료 필수)
- 검증 방법:
  - supplier-os에서 주문 목록 정상 조회
  - restaurant-os에서 주문 목록 정상 조회
  - 다른 tenant의 주문 조회 불가 확인

---

### [TASK-3-04]
**payments 테이블 RLS — payer/payee 양방향 접근 정책 적용**

- 목적: payments를 payer(restaurant)와 payee(supplier) 양쪽에서 접근 가능하도록 설정
- 작업 내용:
  ```sql
  DROP POLICY IF EXISTS "auth_all" ON payments;

  CREATE POLICY "payment_access" ON payments
    FOR ALL USING (
      (SELECT tenant_id FROM users WHERE id = auth.uid())
      IN (payer_tenant_id, payee_tenant_id, tenant_id)
    );
  ```
- 영향 범위: payments 테이블 RLS
- 변경 파일: Supabase SQL Editor 실행
- DB 변경 여부: YES
- 위험도: 높음 (TASK-1-04, TASK-1-05 완료 필수)
- 검증 방법:
  - supplier-os 수금 목록 정상 조회
  - restaurant-os 지급 목록 정상 조회

---

## PHASE 4 — 데이터 마이그레이션

> 목표: 기존 restaurant_id 기반 레코드를 tenant_id로 매핑
> 전제: restaurants ↔ tenants 연결 키 확인 필수 (현재 TODO)
> 롤백: tenant_id 컬럼을 NULL로 초기화하면 원복 가능

---

### [TASK-4-01]
**restaurants ↔ tenants 연결 키 확인 및 매핑 테이블 작성**

- 목적: restaurant_id → tenant_id 변환 기준 확정
- 작업 내용:
  ```sql
  -- 현재 restaurants와 tenants 관계 확인
  SELECT r.id AS restaurant_id, r.name, t.id AS tenant_id
  FROM restaurants r
  LEFT JOIN tenants t ON t.name = r.name  -- TODO: 실제 연결 키로 수정
  LIMIT 20;
  ```
  - 결과를 보고 매핑 기준 확정
  - 매핑 기준 확정 후 TASK-1-03, TASK-1-06 실행 가능
- 영향 범위: 조회만 (데이터 변경 없음)
- 변경 파일: Supabase SQL Editor 실행
- DB 변경 여부: NO
- 위험도: 없음 (조회 전용)
- 검증 방법: 매핑 결과에서 누락된 restaurant 없는지 확인

---

### [TASK-4-02]
**restaurant-os 기존 레코드 tenant_id 일괄 채우기 (ingredients)**

- 목적: 기존 ingredients 레코드의 tenant_id를 restaurant_id 매핑 기준으로 채우기
- 전제: TASK-4-01 완료 필수
- 작업 내용:
  ```sql
  -- TODO: {매핑 서브쿼리}는 TASK-4-01 결과로 확정
  UPDATE ingredients i
  SET tenant_id = (
    SELECT t.id FROM tenants t
    JOIN restaurants r ON {매핑 조건}
    WHERE r.id = i.restaurant_id
  )
  WHERE i.tenant_id IS NULL;
  ```
- 영향 범위: ingredients 테이블 전체
- 변경 파일: Supabase SQL Editor 실행
- DB 변경 여부: YES
- 위험도: 중간 (실행 전 SELECT로 대상 건수 확인)
- 검증 방법:
  ```sql
  SELECT COUNT(*) FROM ingredients WHERE tenant_id IS NULL;
  -- 결과: 0 이어야 함
  ```

---

### [TASK-4-03]
**restaurant-os 기존 레코드 tenant_id 일괄 채우기 (rfq_requests, fixed_costs, 나머지)**

- 목적: TASK-4-02와 동일한 방식으로 나머지 테이블 처리
- 전제: TASK-4-01 완료 필수
- 대상 테이블:
  - `rfq_requests`
  - `fixed_costs`
  - `price_history`
  - `today_events`
  - `ai_decision_logs`
  - `savings_stats`
  - `notifications`
- 작업 내용: 각 테이블에 TASK-4-02와 동일한 UPDATE 패턴 적용
- 영향 범위: 위 테이블 전체
- 변경 파일: Supabase SQL Editor 실행
- DB 변경 여부: YES
- 위험도: 중간
- 검증 방법: 각 테이블 `WHERE tenant_id IS NULL` 건수 = 0 확인

---

## PHASE 5 — 레거시 제거

> 목표: restaurant_id, suppliers, customers 레거시 정리
> 전제: PHASE 1~4 완료 + 전체 기능 정상 동작 확인 후 실행
> 롤백: 불가 (컬럼 삭제는 되돌릴 수 없음) — 반드시 백업 후 실행

---

### [TASK-5-01]
**restaurant-os 테이블에서 restaurant_id 컬럼 제거**

- 목적: 레거시 restaurant_id 컬럼 완전 제거
- 전제: 모든 쿼리가 tenant_id 기준으로 전환 완료 확인 필수
- 작업 내용:
  ```sql
  ALTER TABLE ingredients      DROP COLUMN IF EXISTS restaurant_id;
  ALTER TABLE rfq_requests     DROP COLUMN IF EXISTS restaurant_id;
  ALTER TABLE fixed_costs      DROP COLUMN IF EXISTS restaurant_id;
  ALTER TABLE price_history    DROP COLUMN IF EXISTS restaurant_id;
  ALTER TABLE today_events     DROP COLUMN IF EXISTS restaurant_id;
  ALTER TABLE ai_decision_logs DROP COLUMN IF EXISTS restaurant_id;
  ALTER TABLE savings_stats    DROP COLUMN IF EXISTS restaurant_id;
  ALTER TABLE notifications    DROP COLUMN IF EXISTS restaurant_id;
  ALTER TABLE payments_outgoing DROP COLUMN IF EXISTS restaurant_id;
  ```
- 영향 범위: restaurant-os 전체 도메인 테이블
- 변경 파일: Supabase SQL Editor 실행 + 각 actions 파일에서 restaurant_id 참조 제거
- DB 변경 여부: YES (비가역적)
- 위험도: 매우 높음 (실행 전 전체 백업 필수, 모든 기능 정상 동작 재확인)
- 검증 방법: restaurant-os 전체 페이지 동작 확인

---

### [TASK-5-02]
**restaurant-os `actions/suppliers.ts` → supplier_contacts 구조로 전환**

- 목적: suppliers 테이블 참조를 supplier_contacts로 전환
- 전제: supplier_contacts 테이블 생성 완료
- 작업 내용:
  ```typescript
  // actions/suppliers.ts 전체 리팩토링
  // .from('suppliers') → .from('supplier_contacts')
  // restaurant_id → tenant_id
  // supplier_id → supplier_tenant_id
  ```
- 영향 범위:
  - `src/actions/suppliers.ts` 전체
  - `src/components/` 중 suppliers 참조하는 컴포넌트
- 변경 파일:
  - `C:\Users\babok\Desktop\resturant_os\src\actions\suppliers.ts`
  - TODO: suppliers 참조 컴포넌트 목록 확인 필요
- DB 변경 여부: NO (테이블명 변경은 없음, 참조만 변경)
- 위험도: 높음
- 검증 방법: suppliers 목록 · 등록 · 수정 화면 정상 동작 확인

---

### [TASK-5-03]
**supplier-os `actions/customer.ts` → supplier_contacts 통합 방향 전환**

- 목적: supplier-os의 customers 테이블 참조를 supplier_contacts 방향으로 전환
- 전제: TASK-5-02 완료 + 비즈니스 로직 재검토 필요
- 작업 내용: TODO — 전환 시점 및 방식 별도 결정 필요
  - customers 테이블은 supplier-os CRM의 핵심 — 섣불리 제거 금지
  - supplier_contacts와의 통합 방식 확정 후 진행
- 영향 범위: supplier-os CRM 전체
- 변경 파일: TODO
- DB 변경 여부: TODO
- 위험도: 매우 높음 (CRM 핵심 데이터)
- 검증 방법: TODO

---

## 실행 순서 요약

```
PHASE 1 (DB 구조) → 반드시 먼저
  TASK-1-01 → TASK-1-02 → TASK-1-04 → TASK-1-05  (안전한 것 먼저)
  TASK-1-03, TASK-1-06 → TASK-4-01 완료 후 실행
  TASK-1-07 (restaurant tenant_id 컬럼 추가)

PHASE 2 (Backend) → PHASE 1 완료 후
  TASK-2-01 → TASK-2-02 → TASK-2-03 (supplier-os)
  TASK-2-04 → TASK-2-05 → TASK-2-06 → TASK-2-07 (restaurant-os)

PHASE 3 (RLS) → PHASE 2 완료 후
  TASK-3-01 → TASK-3-02 (restaurant 도메인)
  TASK-3-03 → TASK-3-04 (orders / payments 양방향)

PHASE 4 (마이그레이션) → TASK-4-01 선행 필수
  TASK-4-01 → TASK-4-02 → TASK-4-03

PHASE 5 (레거시 제거) → 전체 완료 + 검증 후 마지막
  TASK-5-01 → TASK-5-02 → TASK-5-03
```

---

## TODO (실행 전 해소 필요)

| # | 내용 | 관련 Task |
|---|------|----------|
| 1 | restaurants ↔ tenants 실제 연결 키 확인 | TASK-4-01 선행 필수 |
| 2 | supplier-os schema.sql 전체 컬럼 확인 | TASK-1-03, 1-06 |
| 3 | restaurant-os user role 실제 값 확인 | PHASE 3 전체 |
| 4 | suppliers 참조 컴포넌트 목록 확인 | TASK-5-02 |
| 5 | customers → supplier_contacts 전환 방식 결정 | TASK-5-03 |
