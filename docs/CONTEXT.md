# CONTEXT.md — 식식이OS 시스템 구조 정의서
> 목적: 운영 중인 시스템을 유지하면서 PRODUCT.md 기준으로 정렬 가능한 상태를 만드는 것
> 코드 재작성 ❌ / DB 변경 ❌ / 추가(additive) 방식으로만 진행
> 최종 업데이트: 2026-05-14

---

## [ARCH-00] 식식이OS 최상위 선언

```
식식이OS는 발주 시스템이 아니라,
거래를 만들고 운영을 자동화하는 시스템이다.

식당OS   → 사장님 대신 판단하고 실행하는 운영 엔진
공급자OS → 덜 틀리게 영업하고 운영하게 만드는 시스템
관리자OS → 플랫폼이 스스로 판단하고 진화하게 만드는 시스템
```

**모든 기능은 반드시 아래 3가지 중 하나에 속해야 한다.**
```
1. 거래 생성
   - RFQ → 주문
   - Storefront → Direct Order
2. 돈 흐름   (수금 / 지급 / 원장)
3. 행동 생성 (대시보드 / 자동화영업)
```
속하지 않으면 구현하지 않는다.

---

## [ARCH-01] 핵심 전제 (절대 변경 금지)

| # | 전제 | 설명 |
|---|------|------|
| 1 | 단일 Supabase DB | 두 앱이 동일한 DB 프로젝트 사용 (cqiwcyuclpuarynrreat) |
| 2 | tenant_id 기반 전체 격리 | 모든 쿼리에 tenant_id 필수. 예외 없음 |
| 3 | tenants = 모든 주체 | restaurant / supplier / admin 모두 tenants 테이블 레코드 |
| 4 | 과거 데이터 불변 | 주문·수금 append-only. 물리 삭제 금지 |
| 5 | 계산값 DB 저장 금지 | 잔액·결제상태 등 실시간 계산 |
| 6 | Server Action 전용 | 클라이언트에서 직접 Supabase 쿼리 금지 |
| 7 | N+1 쿼리 금지 | 서버에서 1회 집계 |

---

## [ARCH-02] 시스템 구성

```
단일 Supabase DB (cqiwcyuclpuarynrreat)
        │
        ├── [supplier-os]   Next.js 14   공급자 ERP
        │     GitHub: dfaith0308/RealMyOS
        │     경로:   realmyos/src/app/(app)/
        │     배포:   real-my-os.vercel.app
        │     사용자: tenants.role = 'supplier'
        │
        ├── [restaurant-os]  Next.js 14   식당 구매 OS
        │     GitHub: dfaith0308/restaurant-os
        │     경로:   restaurant_os/src/app/(app)/
        │     사용자: tenants.role = 'restaurant'
        │
        └── [admin-os]       Next.js 14   플랫폼 관제 시스템
              GitHub: dfaith0308/RealMyOS (supplier-os와 동일 repo)
              경로:   realmyos/src/app/(admin)/   ← 구현됨 (`src/middleware.ts` + `(admin)/layout.tsx` 보호)
              역할:   세션 `users.role === 'admin'` 기준 접근(미들웨어)·테넌트 주체는 `tenants.role = 'admin'`
              권한:   관제 목적상 테넌트 한정 필터 없이 넓은 조회; 전용 쓰기 테이블 분리
                      모든 행동 → admin_logs 기록 필수 (PRODUCT 기준)
```

**admin-os를 별도 repo로 분리하지 않는 이유:**
```
1. 단일 Supabase DB를 공유 → 같은 repo가 자연스러움
2. PRODUCT.md / CONTEXT.md가 RealMyOS에 있음
3. 관리자OS = 디닷페이스 운영 = RealMyOS 사업자와 일치
4. MVP 단계에서 repo 분리는 오버엔지니어링
5. 스케일업 시 admin-os repo 분리 가능 (additive 전환)
```

세 앱은 UI와 역할이 다를 뿐, **동일한 DB의 동일한 테이블**을 읽고 쓴다.
OS 간 직접 API 호출 금지. 상태 변경 기반 이벤트로만 연결.

---

## [ARCH-03] 현재 시스템 구조 요약 (코드 기준 실제 상태)

### 운영 DB 테이블 전체 (SSOT 스냅샷 2026-05-14)

단일 Supabase 인스턴스 **`public`** 기준 존재 테이블 인벤토리 (코드 참조 여부와 무관). `_etl_*`는 레거시/추출 성격으로 별도 관리 전제.

`account_purposes`, `accounts`, `acquisition_channels`, `action_logs`, `action_queue`, `admin_logs`, `admin_settings`, `ai_decision_logs`, `categories`, `cart_items`, `collection_allocations`, `collection_schedules`, `contact_logs`, `customer_deposits`, `customer_monthly_stats`, `customer_product_prices`, `customer_stats`, `customer_tag_logs`, `customer_tag_options`, `customer_tags`, `customers`, `commerce_order_items`, `commerce_orders`, `commerce_product_listings`, `deposit_logs`, `fixed_costs`, `fund_rules`, `fund_transfers`, `ingredients`, `menu_cost_cache`, `menu_ingredients`, `menus`, `message_logs`, `notices`, `notifications`, `opening_balance_logs`, `order_lines`, `order_logs`, `orders`, `payment_allocations`, `payments`, `price_history`, `product_categories`, `product_code_sequences`, `product_costs`, `product_logs`, `product_prices`, `product_related_manual`, `product_stats`, `products`, `purchases`, `quote_items`, `quote_logs`, `quotes`, `relationships`, `restaurant_order_items`, `rfq_bids`, `rfq_requests`, `sales_schedules`, `sales_scripts`, `savings_stats`, `shipping_groups`, `settings`, `settings_logs`, `supplier_contacts`, `tenant_relationships`, `tenants`, `today_events`, `trust_scores`, `users`, `_etl_order_items`, `_etl_orders`, `_etl_payments_outgoing`, `_etl_restaurants`, `_etl_rfq_bids`, `_etl_rfq_requests`, `_etl_suppliers`

**합계 75개** (위 인벤토리는 `realmyos/supabase/migrations/`에 DDL이 존재하는 `cart_items`·`commerce_*`·`shipping_groups` 반영 후 개수. 코드 미참조·레거시 포함 가능).

### realmyos `supabase/migrations/` (저장소 DDL 추적)

- **2026-05-08 실측**: incremental `.sql` 파일 **35개** (`README.md` 및 타임스탬프 파일명 규칙 동일).

---

### supplier-os (realmyos) — 앱별 주요 사용 테이블 (요약)

| 테이블 | 실제 사용 방식 | 전환 상태 |
|--------|--------------|-----------|
| `tenants` | role='supplier'. 인증/온보딩에서 생성 | ✅ 사용 중 |
| `users` | tenant_id 연결. getAuthCtx로 조회 | ✅ 사용 중 |
| `customers` | 거래처 CRM. tenant_id 필터. deleted_at Soft Delete | ✅ 사용 중 |
| `orders` | seller_tenant_id + legacy tenant_id 병행 `.or()` 쿼리 | ⚠️ 전환 중 |
| `order_lines` | order_id + tenant_id. 스냅샷 구조 (product_code, product_name, cost_price 복사) | ✅ 구현됨 |
| `payments` | direction='inbound', payee_tenant_id + legacy tenant_id 병행 | ⚠️ 전환 중 |
| `products` | tenant_id 기반. product_costs 별도 이력 테이블 | ✅ 사용 중 |
| `settings` | key/value + tenant_id | ✅ 사용 중 |
| `collection_schedules` | 수금 일정 | ✅ 사용 중 |
| `quotes` / `quote_items` | 견적 관리 | ✅ 사용 중 |
| `fund_rules` / `fund_transfers` | 자금 규칙·이체 (`fund_transfers` 등 실테이블 기준) | ✅ 사용 중 |
| `contact_logs` / `action_logs` | CRM 이력 | ✅ 사용 중 |

**`relationships` 테이블**: DDL은 `supabase/migrations/20260507070000_create_relationships.sql`로 추적. **`src/actions/admin/trust-engine.ts`** 등 관리자OS 코드에서 조회 사용. 식당·공급자 간 관계 UI는 **`/admin/participants`**, **`/admin/participants/relationships`** 등에서 노출·확장 중이며, 과거 문서의 「코드 미사용=미구현」 표현은 **철회**.

**`relationships`의 구조적 역할 (PRODUCT.md 기준 의도)**: RFQ 거래 형성, 반복주문 관계 유지, 재주문 추천, 자동발주 제안의 **연결 축**으로 쓰인다. 세부 필드·앱 플로와의 1:1 대응은 **부분 구현·정렬 진행** 상태이며, 본 문장은 **제품 정의상의 역할**만 고정한다.

### restaurant-os — 실제 사용 테이블

| 테이블 | 실제 사용 방식 | 전환 상태 |
|--------|--------------|-----------|
| `tenants` | restaurant.ts에서 직접 조회/수정 | ✅ 사용 중 |
| `ingredients` | tenant_id = restaurants.id (FK 혼재 가능성) | ⚠️ FK 확인 필요 |
| `rfq_requests` | tenant_id 기반 | ✅ 사용 중 |
| `rfq_bids` | rfq_id 기반. supplier_tenant_id 컬럼 존재 | ✅ 사용 중 |
| `orders` | buyer_tenant_id = 식당 tenant_id. supplier_name 텍스트 | ⚠️ 구조 다름 |
| `payments` | payer_tenant_id + direction='outbound'. money.ts에서 사용 | ✅ 사용 중 |
| `suppliers` | restaurant-os 전용 주소록 (별도 테이블) | ⚠️ 목표와 다름 |
| `notifications` | tenant_id 기반 | ✅ 사용 중 |
| `price_history` | rfq/order 생성 시 자동 기록 | ✅ 사용 중 |
| `today_events` | 행동 유도 측정 | ✅ 사용 중 |
| `ai_decision_logs` | AI 판단 학습 | ✅ 사용 중 |
| `savings_stats` | 월별 절약 통계 | ✅ 사용 중 |
| `commerce_orders` | storefront Direct Order 주문 테이블. `commerce_orders.tenant_id` = **구매자(식당) tenant** (`resturant_os/src/actions/buy.ts` insert). **주문·고객·결제의 1차 owner는 플랫폼(디닷페이스)** 로 정렬한다; 공급자는 **fulfillment allocation** 축에서만 연결된다. RFQ `orders` / 공급자 원장 / `payments` 학습 파이프라인과는 **코드상 아직 단일 원장으로 통합되지 않음**(PRODUCT.md §13·`[PLATFORM-ERP-001]`). 구조 확정 전 임의 통합 금지. | ⚠️ 분리 유지 |
| `commerce_order_items` | `commerce_orders` 라인 스냅샷. `listing_id` → `commerce_product_listings` 참조(migration `20260509010000_create_commerce_tables.sql`). | ✅ 사용 중 |
| `commerce_product_listings` | 플랫폼 큐레이션 storefront 상품. `owner_type` CHECK에 `platform`·`approved_supplier` 존재; 관리자 생성 경로에서 `owner_type='platform'` insert(`realmyos/src/actions/admin/commerce.ts`). **공급자 직접 등록 구조 아님.** | ✅ 사용 중 |
| `cart_items` | 장바구니. `tenant_id` + `listing_id`(migration 동일 파일). `resturant_os/src/actions/buy.ts`에서 사용. | ✅ 사용 중 |
| `shipping_groups` | storefront 묶음배송 그룹. migration `20260510170000_create_shipping_groups.sql`. 관리자 RLS `is_admin()` 전용. | ✅ 사용 중 |

**payments_outgoing 테이블**: schema.sql에 정의되어 있으나 실제 코드는 `payments` 테이블 사용 중 → schema.sql이 구버전

---

## [ARCH-04] 목표 구조 요약 (PRODUCT.md 기준)

```
tenants (모든 주체)
  ├── role = 'supplier'    → 공급자OS 사용자
  ├── role = 'restaurant'  → 식당OS 사용자
  └── role = 'admin'       → 관리자OS 사용자 (tenant_id 필터 없이 전체 접근)

단일 테이블 공유:
  orders       (buyer_tenant_id ↔ seller_tenant_id)
  payments     (direction으로 inbound/outbound 분기)
  rfq_requests / rfq_bids (공급자에게 단계적 노출)
  relationships (식당-공급자 신뢰도 및 거래 관계)

각자 전용:
  supplier-os:   products, customers, quotes, funds, settings
  restaurant-os: ingredients, menus, fixed_costs, notifications
  admin-os:      admin_logs, action_queue, trust_scores, admin_settings
                 (조회는 전체, 전용 쓰기 테이블만 분리)
```

---

## [ARCH-05] 차이 분석 (Diff)

### payments

| 항목 | 현재 상태 | 목표 상태 | 차이 |
|------|-----------|-----------|------|
| 테이블명 | `payments` (단일) | `payments` (단일) | ✅ 일치 |
| direction | `inbound`/`outbound` 사용 중 | `inbound`/`outbound` | ✅ 일치 |
| payer/payee | `payer_tenant_id`, `payee_tenant_id` 사용 중 | 동일 | ✅ 일치 |
| status 취소값 | supplier-os: `cancelled` / restaurant-os: `paid` 직접 update | `reversed` | ⚠️ 불일치 |
| status 대기값 | restaurant-os: `planned` / supplier-os: 없음 | `pending` | ⚠️ 불일치 |
| type 컬럼 | 코드에서 미사용 | `order`/`settlement`/`credit`/`adjustment` | ❌ 미구현 |
| counterparty_name | restaurant-os payments에 존재 | PRODUCT.md에 없음 | ⚠️ 추가 컬럼 |

### orders

| 항목 | 현재 상태 | 목표 상태 | 차이 |
|------|-----------|-----------|------|
| buyer_tenant_id | restaurant-os에서 사용 중 | 동일 | ✅ 일치 |
| seller_tenant_id | supplier-os에서 전환 중 (or 쿼리) | 동일 | ⚠️ 전환 진행 중 |
| trade_status | 없음 (단일 status 컬럼) | `trade_status` = draft/confirmed/cancelled | ❌ 미구현 |
| order_status | 없음 | `order_status` (운영 흐름 별도) | ❌ 미구현 |
| restaurant-os 구조 | 단순 (product_name, supplier_name 단일 row) | order_lines 분리 | ⚠️ 구조 다름 |

### order_lines

| 항목 | 현재 상태 | 목표 상태 | 차이 |
|------|-----------|-----------|------|
| 스냅샷 구조 | supplier-os: product_code, product_name, cost_price 복사 | 동일 | ✅ 일치 |
| restaurant-os | order_items 테이블 (product_name, unit_price, prev_price) | order_lines와 동일 구조 | ⚠️ 컬럼명 다름 |

### relationships

| 항목 | 현재 상태 | 목표 상태 | 차이 |
|------|-----------|-----------|------|
| 존재 여부 | 테이블·migration 존재; 관리자 신뢰 엔진 등에서 SELECT 사용 (`trust-engine.ts`) | 제품·정책 수준 완전 정렬 | ⚠️ 부분 구현 |
| UI·연계 | `/admin/participants`, `/admin/participants/relationships` 라우트 존재 | PRODUCT §8-6 등과 필드·플로우 일치 | ⚠️ 확장 중 |
| trust_score | `trust_scores`·`tenant_relationships` 등 별도 테이블·마이그레이션과 병행 | 단일 도메인 모델로 수렴 | ⚠️ 정렬 진행 |

### tenants

| 항목 | 현재 상태 | 목표 상태 | 차이 |
|------|-----------|-----------|------|
| supplier-os | tenants 사용 ✅ | 동일 | ✅ 일치 |
| restaurant-os | tenants 사용 ✅ | 동일 | ✅ 일치 |
| restaurants 테이블 | schema.sql에 존재. 일부 FK 사용 가능성 | 사용 안 함 (tenants로 대체) | ⚠️ 구버전 잔존 |

---

## [ARCH-06] 충돌 위험 분석 (핵심 3개)

### 1. payments — 위험도 MID

```
현재 구조:
  supplier-os: status = 'confirmed' | 'cancelled'
               direction = 'inbound'
               payee_tenant_id + legacy tenant_id 병행

  restaurant-os: status = 'planned' | 'paid'
                 direction = 'outbound'
                 payer_tenant_id

목표 구조:
  status = 'pending' | 'confirmed' | 'reversed'

충돌 여부: O
위험도: MID

이유:
  - 두 앱이 같은 payments 테이블을 다른 status 값으로 사용 중
  - restaurant-os: 'planned'/'paid'
  - supplier-os:   'confirmed'/'cancelled'
  - direction으로 격리되어 있어 지금 당장 데이터 손상은 없음
  - 하지만 통합 조회(관리자OS 등) 시 status 의미가 다름
  - MoneyClient.tsx가 p.supplier_name을 직접 참조 → counterparty_name 컬럼 실제 확인 필요
```

### 2. orders — 위험도 MID

```
현재 구조:
  supplier-os: tenant_id + seller_tenant_id (전환 중)
               status = 'confirmed' | 'cancelled'
               order_lines 별도 테이블 (스냅샷)
               customer_id, order_date, final_amount 등 풍부한 구조

  restaurant-os: buyer_tenant_id 사용
                 supplier_name 단일 텍스트 (FK 없음)
                 product_name 단일 컬럼 (order_lines 없음)
                 order_items 별도 테이블

목표 구조:
  orders: buyer_tenant_id + seller_tenant_id 양쪽 사용
  order_lines: 스냅샷 (양쪽 공유)

충돌 여부: O
위험도: MID

이유:
  - restaurant-os orders에 seller_tenant_id 없음 → 공급자OS에서 조회 불가
  - 양쪽이 같은 orders 테이블인지 확인 필요 (★ Phase 0 선행 필수)
  - 현재는 buyer_tenant_id로 식당이, seller_tenant_id로 공급자가 격리되어 있음
  - 구조 통합 전까지는 양쪽 앱에서 완전한 거래 추적 불가
```

### 3. relationships — 위험도 LOW (신규 추가)

```
현재 구조:
  supplier-os: customers 테이블 중심 거래처 관리 + 관리자OS에서 relationships 테이블 조회(trust-engine)
  restaurant-os: suppliers 테이블 (독립 주소록) 유지
  DB: relationships DDL 적용됨(migration 추적)

목표 구조:
  PRODUCT 기준 관계·신호·신뢰도 단일 모델

충돌 여부: X (테이블 추가 후 점진 적재·UI 연결 단계)
위험도: LOW

이유:
  - 신규 테이블 삭제 없이 확장 가능
  - suppliers 레거시 유지 전제와 병행 가능
```

---

## [ARCH-07] 안전 정렬 전략

### 전략 A: payments status 정렬

```
[문제]
  restaurant-os: 'planned' / 'paid'
  supplier-os:   'confirmed' / 'cancelled'
  목표:           'pending' / 'confirmed' / 'reversed'

[현재 상태]
  direction으로 격리. 지금 당장 데이터 손상 없음

[목표 상태]
  status 값 통일: 'pending' | 'confirmed' | 'reversed'

[변경 방식]

  1. 기존 유지
     - payments 테이블 기존 status 값 유지
     - 기존 쿼리 로직 변경 없음

  2. 점진적 전환 순서
     - 단계 1: DB CHECK constraint 확인 (실제 payments status 제약 확인)
     - 단계 2: restaurant-os money.ts 'planned' → 'pending', 'paid' → 'confirmed' 변경
     - 단계 3: restaurant-os today.ts 동일 변경
     - 단계 4: supplier-os payment.ts 'cancelled' → 'reversed' 변경
     - 단계 5: 기존 DB 데이터 backfill
               UPDATE payments SET status = 'pending'   WHERE status = 'planned';
               UPDATE payments SET status = 'confirmed'  WHERE status = 'paid' AND direction = 'outbound';
               UPDATE payments SET status = 'reversed'   WHERE status = 'cancelled';
     - 단계 6: CHECK constraint 교체
               ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
               ALTER TABLE payments ADD CONSTRAINT payments_status_check
                 CHECK (status IN ('pending','confirmed','reversed'));

  3. 리스크
     - MoneyClient.tsx가 p.supplier_name 직접 참조 → counterparty_name으로 변경 필요
     - backfill 전 조회 시 기존 status 값 병행 처리 필요
     - CHECK constraint 변경 전 기존 값과 신규 값 동시 허용 필요
```

### 전략 B: orders 구조 정렬

```
[문제]
  restaurant-os orders: 단순 구조
  공급자OS에서 식당 주문 조회 불가

[변경 방식]

  1. 기존 유지
     - restaurant-os orders 구조 변경 없음
     - supplier-os or() 쿼리 유지

  2. 추가 방식 (additive)
     - restaurant-os orders에 seller_tenant_id 추가:
       ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_tenant_id uuid REFERENCES tenants(id);
     - rfq.ts acceptBidAndCreateOrder에서 rfq_bids.supplier_tenant_id 있으면 저장

  3. 점진적 전환 순서
     - 단계 1: ★ Phase 0 — orders 실제 컬럼 확인
     - 단계 2: seller_tenant_id 컬럼 추가 (NULL 허용)
     - 단계 3: 신규 주문 생성 시 seller_tenant_id 저장
     - 단계 4: 기존 데이터 backfill (rfq_bids.supplier_tenant_id 기준)
     - 단계 5: supplier-os에서 restaurant-os 주문 조회 활성화

  4. 리스크
     - restaurant-os와 supplier-os가 같은 orders 테이블 사용하는지 확인 필수
     - seller_tenant_id NULL이면 공급자OS에서 조회 불가 (전환 중 상태)
     - backfill 불가 레코드는 supplier_name 텍스트로만 추적 가능
```

### 전략 C: relationships 테이블 신규 추가

```
[변경 방식]

  1. 기존 유지
     - suppliers 테이블 그대로 유지 (삭제 금지)

  2. 신규 생성
     CREATE TABLE IF NOT EXISTS relationships (
       id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       restaurant_tenant_id    uuid NOT NULL REFERENCES tenants(id),
       supplier_tenant_id      uuid REFERENCES tenants(id),
       supplier_name           text,  -- 오프라인 공급자 (supplier_tenant_id 없을 때)
       trust_score             integer DEFAULT 100,
       relationship_status     text NOT NULL DEFAULT 'active'
         CHECK (relationship_status IN ('active','inactive','cooldown')),
       rating                  integer CHECK (rating BETWEEN 1 AND 5),
       memo                    text,
       last_signal_at          timestamptz,
       signal_suppressed_until date,
       cooldown_until          date,
       created_at              timestamptz DEFAULT now(),
       UNIQUE(restaurant_tenant_id, COALESCE(supplier_tenant_id, '00000000-0000-0000-0000-000000000000'::uuid))
     );

  3. 점진적 전환
     - 단계 1: relationships 테이블 생성
     - 단계 2: 신규 거래처 등록 시 relationships에도 동시 저장
     - 단계 3: suppliers 데이터 중 supplier_tenant_id 있는 경우 backfill
     - 단계 4: 가격 신호/납기 신호 로직 relationships 기반으로 추가
     - 단계 5: suppliers 테이블 legacy 유지 (삭제 금지)

  4. 리스크
     - suppliers.supplier_tenant_id 없으면 relationships 자동 연결 불가
     - 오프라인 공급자는 supplier_tenant_id = NULL로 관리 (관계는 있지만 OS 미가입)
```

---

## [ARCH-08] 적용 순서 (Step-by-step)

### Phase 0: 실제 DB 상태 확인 (선행 필수 — 이 없이 Phase 1 진행 금지)

```sql
-- 1. orders 테이블 실제 컬럼 확인
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'orders' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. payments 테이블 실제 컬럼 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'payments' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 3. payments status 현재 CHECK constraint 확인
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
  AND constraint_name LIKE '%payments%';

-- 4. ingredients FK 확인 (restaurants vs tenants 중 어느 쪽)
SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'ingredients' AND tc.constraint_type = 'FOREIGN KEY';

-- 5. payments status 실제 사용 현황 확인
SELECT status, direction, COUNT(*) FROM payments GROUP BY status, direction;
```

### Phase 1: 안전한 컬럼 추가 (위험도 ZERO)

```sql
-- 1-1. payments type 컬럼 추가 (기존 로직 무영향)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'order'
  CHECK (type IN ('order','settlement','credit','adjustment'));

-- 1-2. orders seller_tenant_id 추가 (NULL 허용 — 기존 데이터 영향 없음)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS seller_tenant_id uuid REFERENCES tenants(id);

-- 1-3. rfq_requests 노출 단계 컬럼 추가
ALTER TABLE rfq_requests ADD COLUMN IF NOT EXISTS expose_level integer DEFAULT 3;
ALTER TABLE rfq_requests ADD COLUMN IF NOT EXISTS expose_level_2_at timestamptz;
ALTER TABLE rfq_requests ADD COLUMN IF NOT EXISTS expose_level_3_at timestamptz;
```

### Phase 2: relationships 테이블 신규 생성

```sql
CREATE TABLE IF NOT EXISTS relationships (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_tenant_id    uuid NOT NULL REFERENCES tenants(id),
  supplier_tenant_id      uuid REFERENCES tenants(id),
  supplier_name           text,
  trust_score             integer DEFAULT 100,
  relationship_status     text NOT NULL DEFAULT 'active'
    CHECK (relationship_status IN ('active','inactive','cooldown')),
  rating                  integer CHECK (rating BETWEEN 1 AND 5),
  memo                    text,
  last_signal_at          timestamptz,
  signal_suppressed_until date,
  cooldown_until          date,
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON relationships
  FOR ALL USING (auth.role() = 'authenticated');
```

### Phase 3: payments status 정렬 (코드 → DB 순서)

```
순서 (반드시 이 순서로):
  1. DB CHECK constraint 확인 (Phase 0)
  2. 코드 변경: restaurant-os money.ts, today.ts
     'planned' → 'pending' / 'paid' → 'confirmed'
  3. 코드 변경: supplier-os payment.ts
     'cancelled' → 'reversed'
  4. 배포 완료 확인
  5. DB backfill (신규 코드 배포 후)
     UPDATE payments SET status = 'pending'
       WHERE status = 'planned';
     UPDATE payments SET status = 'confirmed'
       WHERE status = 'paid' AND direction = 'outbound';
     UPDATE payments SET status = 'reversed'
       WHERE status = 'cancelled';
  6. CHECK constraint 교체
```

### Phase 4: supplier-os orders or() 쿼리 제거

```
선행 조건:
  - orders.seller_tenant_id backfill 완료 확인
  - SELECT COUNT(*) FROM orders WHERE seller_tenant_id IS NULL AND tenant_id IS NOT NULL;
  - 결과 0이면 제거 가능

변경:
  .or(`seller_tenant_id.eq.${tenant_id},tenant_id.eq.${tenant_id}`)
  →
  .eq('seller_tenant_id', tenant_id)
```

### Phase 5: restaurant-os orders 구조 정렬

```
현재: orders 단일 row (product_name, supplier_name 텍스트)
목표: orders + order_lines (스냅샷)

접근:
  - 신규 주문 생성(acceptBidAndCreateOrder)에서 order_lines도 동시 생성
  - 기존 단순 주문(order_items)은 유지 (삭제 금지)
```

---

## [ARCH-08A] 관리자OS 정의

**한 줄 정의**: 관리자OS는 플랫폼이 스스로 판단하고 진화하게 만드는 중앙 제어 시스템이다.

관리자OS는 "보는 곳"이 아니다. 데이터 → 판단 → 정책 → 자동화로 이어지는 구조를 만드는 시스템이다.

**역할 확장 (STOREFRONT-ARCH-001)**: 관리자OS는 **디닷페이스(식식이OS 플랫폼 운영사)** 의 **플랫폼 운영센터 + ERP** 축이다. Storefront(`commerce_orders` 등)에서 발생하는 **플랫폼 주문·매출·미수·정산·수수료·PG/결제 운영**과, **공급 allocation → 공급자 정산**을 같은 허브에서 다루는 방향으로 문서를 정렬한다(구현 상태는 `tasks.md` **`[PLATFORM-ERP-001]`**).

```
관리자OS 핵심 원칙:
  CRUD 화면 금지 — 데이터→판단→정책→자동화 구조만 허용
  신뢰도는 사람이 판단하지 않는다 — 행동 데이터가 계산
  모든 돈은 플랫폼을 통과한다 — 직거래 절대 금지
  모든 관리자 행동은 admin_logs에 기록된다
  코드 없이 정책을 바꿀 수 있어야 한다
```

---

## [ARCH-08B] 관리자OS 메뉴 구조 및 데이터 흐름

```
관리자OS 메뉴 (각 메뉴는 화면이 아니라 역할):

  중앙 대시보드        → 플랫폼 전체 상태 3초 파악 + Action Queue 즉시 실행
  거래 흐름 관제       → 발주→낙찰→주문→정산 자동 개입 (Level 1~3)
  참여자/관계 네트워크 → 신뢰도 기반 참여자 통제 + 정책 실행
  데이터 학습 센터     → 플랫폼 전체 데이터 수집/학습 → 인텔리전스 생성
  판단/분석 엔진       → 위험/기회 판단 → 정책 트리거 생성
  성장/영업 엔진       → 이탈 위험/휴면 대상 자동 영업 실행
  수익/정산 통제       → 돈 흐름 통제 + 수수료 + 정산 + 직거래 차단
  정책/실험 콘솔       → 코드 없이 정책 생성/수정/실험 (A/B 테스트)
```

**메뉴 간 데이터 흐름 (이 순서가 시스템 전체 작동 원리):**

```
데이터 학습 센터 (수집/학습)
       ↓
판단/분석 엔진 (판단 → 트리거)
       ↓
정책/실험 콘솔 (정책 생성/승인)
       ↓
참여자/관계 네트워크 + 거래 흐름 관제 (자동 실행)
       ↓
수익/정산 통제 (결과 발생)
       ↓
중앙 대시보드 (현황 + 예외 처리)
       ↓
결과 → 데이터 학습 센터 재유입 (재학습)
```

---

## [ARCH-08C] 관리자OS 전용 테이블

### admin_logs 테이블 — 모든 관리자 행동 기록 (append-only)

```sql
admin_logs
  id           uuid        PK DEFAULT gen_random_uuid()
  admin_id     uuid        FK → users    NOT NULL
  tenant_id    uuid        FK → tenants            -- 대상 tenant (NULL = 전체)
  action_type  text        NOT NULL                -- 'policy_change'|'trade_intervene'|'trust_override'|'settlement_manual'
  target_table text                                -- 영향받은 테이블
  target_id    uuid                                -- 영향받은 레코드
  old_value    jsonb
  new_value    jsonb
  reason       text        NOT NULL                -- 사유 입력 필수
  created_at   timestamptz DEFAULT now()

-- 물리 삭제 금지 / 수정 금지 / append-only
-- 모든 관리자 행동은 예외 없이 여기에 기록
```

### action_queue 테이블 — 관리자 실행 큐

```sql
action_queue
  id             uuid        PK DEFAULT gen_random_uuid()
  priority       text        NOT NULL
    CHECK (priority IN ('critical','high','today','normal'))
  category       text        NOT NULL
    CHECK (category IN ('trust','trade','settlement','policy','direct_trade'))
  title          text        NOT NULL
  description    text
  status         text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','expired'))
  action_options jsonb                  -- [{label, action_type, params}]
  target_tenant_id uuid                 -- 대상 tenant
  expires_at     timestamptz            -- 72시간 후 자동 expired
  escalated_at   timestamptz
  resolved_by    uuid        FK → users
  resolved_at    timestamptz
  created_at     timestamptz DEFAULT now()

-- 생성: 시스템(판단/분석 엔진)만 가능. 관리자 수동 생성 금지.
-- 소멸: 즉시 실행 → completed / 조건 해소 → completed / 72시간 미처리 → expired
```

**Action Queue 생명주기:**
```
판단/분석 엔진 자동 생성
  → pending:     생성 직후
  → in_progress: [정책 콘솔 이동] 클릭 시
  → completed:   [즉시 실행] 또는 조건 해소 시
  → expired:     72시간 이상 미처리 → Critical 승격 + 관리자 알림
                 7일 이상 → 상위 관리자 알림 + 강제 개입 권고
```

### trust_scores 테이블 — 신뢰도 점수

```sql
trust_scores
  id                  uuid        PK DEFAULT gen_random_uuid()
  tenant_id           uuid        FK → tenants  NOT NULL  -- 평가 대상
  role                text        NOT NULL  -- 'supplier' | 'restaurant'
  score               integer     NOT NULL DEFAULT 100
  delivery_rate       numeric               -- 납기 준수율 (supplier)
  claim_count         integer     DEFAULT 0 -- 클레임 발생 횟수
  payment_rate        numeric               -- 결제 준수율 (restaurant)
  rfq_complete_rate   numeric               -- 발주요청 완결율 (restaurant)
  repeat_trade_rate   numeric               -- 반복 거래율 (supplier)
  level               integer     NOT NULL DEFAULT 1  -- 1 | 2 | 3
  cooldown_until      date                  -- 쿨다운 만료일
  violation_count     integer     DEFAULT 0 -- 반복 위반 누적
  updated_at          timestamptz DEFAULT now()

-- 수동 수정 금지 — 행동 데이터 기반 자동 계산
-- 모든 score 변경 → admin_logs 기록
```

**신뢰도 → Level 매핑 (admin_settings에서 관리 — 하드코딩 금지):**
```
공급자:
  70 이하 → Level 1 (자동 경고 발송)
  60 이하 → Level 2 (입찰 제한 / 노출 감소)
  50 이하 → Level 3 (입찰 차단 + Action Queue Critical)

식당:
  60 이하 → Level 1 (자동 경고 발송)
  50 이하 → Level 2 (후불 결제 제한 → 선결제 전환)
  40 이하 → Level 3 (RFQ 생성 제한 + Action Queue Critical)
```

**신뢰도 회복 기준:**
```
공급자: 납기 준수 3회 연속 +5점 / 클레임 없는 거래 5회 +3점
식당:   결제 정상 3회 연속 +5점 / 발주 완결 3회 연속 +3점

회복 후 → cooldown 14일 (admin_settings.trust_cooldown_days)
쿨다운 중 재하락 → 즉시 재제한 + violation_count +1
violation_count 3 이상 → 관리자 수동 승인 없이 해제 불가
```

### admin_settings 테이블 — 관리자OS 정책 설정

```sql
admin_settings
  id         uuid PK DEFAULT gen_random_uuid()
  key        text NOT NULL UNIQUE
  value      text NOT NULL
  scope      text  -- 'global' | 'supplier' | 'restaurant'
  updated_at timestamptz DEFAULT now()

admin_settings_logs  -- append-only (settings_logs와 별도)
  id              uuid PK DEFAULT gen_random_uuid()
  key             text NOT NULL
  old_value       text
  new_value       text
  changed_by      uuid FK → users  NOT NULL
  changed_at      timestamptz DEFAULT now()
  reason          text NOT NULL   -- 사유 입력 필수
  scope           text
  experiment_flag boolean DEFAULT false
```

**관리자OS 핵심 정책값 (admin_settings에서 관리):**

| key | 설명 | 기본값 |
|-----|------|--------|
| supplier_trust_warning_threshold | 공급자 경고 기준 | 70 |
| supplier_trust_restrict_threshold | 공급자 제한 기준 | 60 |
| supplier_trust_block_threshold | 공급자 차단 기준 | 50 |
| restaurant_trust_warning_threshold | 식당 경고 기준 | 60 |
| restaurant_trust_restrict_threshold | 식당 제한 기준 | 50 |
| restaurant_trust_block_threshold | 식당 차단 기준 | 40 |
| trust_cooldown_days | 쿨다운 기간 | 14 |
| trust_escalation_threshold | 가중 제재 발동 위반 횟수 | 2 |
| action_queue_expire_hours | Action Queue 만료 시간 | 72 |
| action_queue_escalate_days | 에스컬레이션 기준 일수 | 7 |
| commission_rate | 기본 수수료율 | 0.03 |
| trade_abnormal_price_threshold | 비정상 금액 기준 (±%) | 50 |
| rfq_no_bid_flag_hours | 입찰 없는 RFQ 플래그 기준 | 24 |
| rfq_no_select_flag_hours | 미선택 RFQ 플래그 기준 | 48 |
| settlement_auto_days | 납품 후 자동 정산 대기 일수 | 7 |
| settlement_pending_flag_days | 정산 대기 플래그 기준 일수 | 14 |

---

## [ARCH-08D] 관리자OS 권한 구조

```
관리자 권한:
  tenant_id 필터 없이 전체 데이터 접근 가능
  모든 거래 조회 / 개입 가능
  모든 정책 변경 가능
  모든 행동 → admin_logs 기록 필수 (사유 입력 필수)

RLS 예외 패턴 (admin-os 전용):
  CREATE POLICY "admin_full_access" ON {table}
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM users u
        JOIN tenants t ON t.id = u.tenant_id
        WHERE u.id = auth.uid() AND t.role = 'admin'
      )
    );

직거래 차단 정책:
  식당 ↔ 공급자 직접 결제 절대 금지
  모든 결제는 payments 테이블 경유 (플랫폼 통과)
  위반 감지 → 거래 중단 이벤트 → Action Queue(Critical) 자동 생성
```

---

## [ARCH-08E] 관리자OS 거래 개입 레벨 시스템

```
Level 1 — 자동 알림:
  사용자에게 알림 발송 + 행동 유도
  예) 낙찰 후 주문 미확정 → 식당 알림 발송

Level 2 — 제한/유도:
  행동 제한 또는 자동 유도 실행
  예) 신뢰도 낮은 공급자 → 입찰 제한
      정산 지연 → 자동 독촉 발송

Level 3 — 강제 개입:
  시스템이 거래 흐름 직접 제어
  예) 직거래 시도 → 거래 중단
      장기 미정산 → 자동 정산 보류
```

**이상 유형 → Level 기본 매핑 (admin_settings에서 변경 가능):**
```
직거래 시도    → Level 3 (기본값)
입찰 없는 RFQ  → Level 1 (기본값)
장기 미정산    → Level 2 (기본값)
납기 지연      → Level 2 (기본값)
비정상 금액    → Level 2 (기본값)
신뢰도 급락    → Level 1→2→3 동적 상승
```

**거래 흐름 단계별 정상 체류 시간 (admin_settings에서 변경 가능):**
```
RFQ 생성 → 입찰:    24시간 내 첫 입찰 없으면 플래그
입찰 → 선택:        48시간 내 선택 없으면 플래그
선택 → 주문 확정:   6시간 내 확정 없으면 플래그
주문 → 납품:        납기일 + 24시간 초과 시 플래그
납품 → 정산 대기:   7일 후 자동 대기 등록
정산 대기:          14일 초과 → Action Queue(High)
```

---

## [ARCH-08F] 관리자OS 데이터 학습 센터 (단계별 진화)

```
[MVP 단계] 규칙 기반 자동 판단 — 현재 구현 대상
  AI 모델 없음. 임계값 기반 자동 판단.
  
  수집 데이터:
    orders / payments / rfq_bids / trust_scores
  
  자동 판단:
    납기 준수율 60% 이하  → 공급자 신뢰도 하락 → 입찰 제한
    결제 지연 발생        → 식당 신뢰도 하락   → 후불 제한
    발주요청 완결율 40%↓  → RFQ 생성 제한 검토
  
  MVP → 중기 전환 조건:
    orders 500건 이상 누적
    신뢰도 계산 참여자 50명 이상
    자동 판단 정확도 70% 이상 (오버라이드 비율 30% 이하)

[중기 단계] 통계/패턴 기반 인텔리전스
  품목별 시장 가격 분포 분석
  공급자 입찰 패턴 / 덤핑 감지
  식당 수요 패턴 분석

[후기 단계] 예측 기반 AI
  수요 예측 모델 (다음 발주 시점/품목 예측)
  공급자 품질 예측 (납기 지연 확률)
  가격 최적화 (적정 시장가 자동 산출)
  목표: 관리자 수동 개입 비율 10% 이하
```

**학습 진화 안전장치:**
```
정책 평가 최소 기간: 7일 (단기 변동 제외)
즉시 반영 예외: 사용자 이탈 급증 / 클레임 급증 / 결제 실패율 급증
정책 자동 조정: 약화/확대 → 자동 허용
정책 완전 중단: 관리자 승인 필수 (자동 불가)
```

---

## [ARCH-08G] 관리자OS 파일 구조 (구현 기준, 2026-05-08)

```
realmyos/src/
  app/
    (app)/          ← 공급자OS (현재 운영 중)
      dashboard/
      orders/
      customers/
      ...

    (admin)/        ← 관리자OS route group (존재 ✅)
      layout.tsx    ← getAuthCtx → role === 'admin' 아니면 /dashboard
      dashboard/
      trades/
      participants/
        relationships/
      learning/
      engine/
      growth/
      settlements/
      policy/
      overview/
      tenants/
      page.tsx      ← /admin 루트

  middleware.ts     ← 프로젝트 루트 대신 src/middleware.ts (Next 권장 경로)
```

### 관리자OS 라우트 (주요 경로)

Next.js App Router 기준 **페이지가 존재하는 주요 URL**:

- `/admin/dashboard`
- `/admin/trades`
- `/admin/participants`
- `/admin/participants/relationships`
- `/admin/learning`
- `/admin/engine`
- `/admin/growth`
- `/admin/settlements`
- `/admin/policy`

*(그 외 `/admin`, `/admin/overview`, `/admin/tenants` 등.)*

### 접근 제어

- **`src/middleware.ts`**: 경로가 `/admin` 으로 시작하면 로그인 후 **`users` 테이블에서 `role === 'admin'`** 인 경우만 통과. 아니면 **`/dashboard`** 로 리다이렉트.
- **`src/app/(admin)/layout.tsx`**: 동일 조건으로 **서버 컴포넌트 이중 검증** (`redirect('/dashboard')`).

```typescript
// 요지: /admin/* → 세션 필수 + users.role === 'admin'
// 실패 시 403 대신 /dashboard 리다이렉트 (middleware 구현 기준)
```

**관리자 전용 Server Actions**: `src/actions/admin/` 하위 (`policy-console`, `trade-monitor`, `trust-engine`, `settlement-control` 등). 과거 스켈 이름(`admin-dashboard.ts` 등)과 실제 파일명은 다를 수 있음 — **`admin/` 디렉터리 기준으로 정독**.

---

## [ARCH-08H] 관리자OS 정책/실험 콘솔 구조

```
정책 우선순위 (충돌 시 이 순서로 적용):
  1순위: 리스크 / 안전 정책
  2순위: 수익 / 정산 정책
  3순위: 성장 / 영업 정책
  4순위: UX / 편의 정책

정책 충돌 자동 해결:
  상위 우선순위 정책 자동 적용
  하위 정책 → 일시 보류
  동일 우선순위 충돌 → Action Queue(High) 생성
  [정책 선택] / [병합 정책 생성] / [조건 분기 설정] 중 선택

A/B 테스트:
  기간: 7일 / 14일 선택
  성과 우수 → 전체 적용
  성과 미달 → 자동 폐기
  애매 → 추가 실험

정책 롤백:
  자동: 성과 기준 미달 시
  수동: admin_settings_logs 기반 1클릭 이전 정책 복원
```

---

## [ARCH-08I] 관리자OS 수익/정산 통제

```
정산 4가지 상태 (모든 거래가 반드시 가짐):
  결제 상태:  pending / confirmed
  정산 상태:  대기 / 처리중 / 완료 / 보류
  증빙 상태:  계산서 미발행 / 발행 완료
  선지급 상태: 해당 없음 / 완료 / 상환 대기 / 미납

자동 정산 조건 (모두 충족 시):
  거래 완료 + 클레임 없음 + 납기 정상 + 신뢰도 기준 이상
  → payments(type='settlement') 자동 생성

선지급 (Credit Line) 기준 (admin_settings 관리):
  신뢰도 80 이상 → 최대 500만원 유예 허용
  신뢰도 70 이상 → 최대 200만원 유예 허용
  신뢰도 70 미만 → 선지급 불가 / 즉시 결제만
  기존 미납 있음 → 선지급 불가

수수료 구조 (admin_settings.commission_rate 기반):
  기본 수수료율
  신규 참여자 할인율 (기간 설정 가능)
  우수 공급자 우대율 (신뢰도 기반 자동 적용)
```

---

## [ARCH-09] 절대 하면 안 되는 것

```
❌ DROP TABLE (어떤 테이블도)
❌ ALTER COLUMN ... TYPE 변경
❌ DELETE FROM ... (데이터 삭제)
❌ 기존 컬럼 삭제
❌ backfill 전 CHECK constraint 변경
❌ supplier-os payment.ts의 or() 쿼리 제거 (backfill 완료 전)
❌ supplier-os order.ts의 or() 쿼리 제거 (backfill 완료 전)
❌ restaurant-os suppliers 테이블 삭제
❌ restaurants 테이블 삭제
❌ Phase 0 (DB 확인) 없이 Phase 1 이후 진행
❌ 계산값 DB 저장 (잔액, 마진율, 결제상태)
❌ 추측 기반 마이그레이션 (DB 확인 항상 먼저)
```

---

## [ARCH-10] 핵심 테이블 현재 구조 (코드 기준 확정된 것만)

### payments 테이블

```sql
payments
  id                    uuid        PK
  tenant_id             uuid        -- RLS용 (legacy)
  payee_tenant_id       uuid        -- 수취자 (supplier-os 기준)
  payer_tenant_id       uuid        -- 지급자 (restaurant-os 기준)
  customer_id           uuid        -- supplier-os CRM 연결
  direction             text        -- 'inbound' | 'outbound'
  status                text        -- supplier-os: 'confirmed'|'cancelled'
                                    -- restaurant-os: 'planned'|'paid'
  amount                integer
  deposit_amount        integer     -- 예치금 처리분
  payment_date          text        -- supplier-os 수금일
  due_date              date        -- restaurant-os 지급예정일
  paid_at               timestamptz
  payment_method        text
  order_id              uuid        -- 연결 주문 (nullable)
  counterparty_name     text        -- restaurant-os 상대방 이름
  memo                  text
  created_by            uuid
  created_at            timestamptz
  collection_schedule_id uuid       -- 수금 일정 연결

-- 불확실 (Phase 0에서 확인 필요):
-- type 컬럼 존재 여부
-- reference_id 컬럼 존재 여부
```

### orders 테이블 (supplier-os 기준 확정)

```sql
orders
  id                    uuid        PK
  tenant_id             uuid        -- legacy (전환 중)
  seller_tenant_id      uuid        -- 공급자 (전환 중, or 쿼리 병행)
  buyer_tenant_id       uuid        -- 구매자 (restaurant-os에서도 사용)
  customer_id           uuid        -- supplier-os CRM 거래처
  order_number          text        -- ORD-YYYYMMDD-NNNN
  order_date            date
  status                text        -- 'confirmed' | 'cancelled'
  total_amount          integer
  total_supply_price    integer
  total_vat_amount      integer
  discount_amount       integer
  point_used            integer
  final_amount          integer     -- DB generated
  memo                  text
  delivery_date         date
  deleted_at            timestamptz -- Soft Delete
  created_at            timestamptz

-- restaurant-os orders 추가 컬럼 (★ 실제 DB 확인 필요):
-- rfq_id, bid_id, supplier_name, product_name, quantity, unit,
-- unit_price, saving_amount 등
-- supplier-os orders와 같은 테이블인지 → Phase 0 확인 필수
```

### order_lines 테이블 (supplier-os, 스냅샷 구조)

```sql
order_lines
  id                    uuid    PK
  order_id              uuid    FK → orders
  tenant_id             uuid
  product_id            uuid    -- 참조용
  product_code          text    -- 스냅샷
  product_name          text    -- 스냅샷
  cost_price            integer -- 스냅샷 (서버에서 product_costs 조회 후 확정)
  unit_price            integer -- 스냅샷
  quantity              integer
  supply_price          integer -- 공급가액
  vat_amount            integer -- 부가세
  line_total            integer -- 진실값
  fulfillment_type      text    -- 'stock' | 'consignment'
  tax_type              text    -- 'taxable' | 'exempt'
  line_total_override   integer
```

---

## [ARCH-11] RLS 현재 상태 및 목표

```sql
-- 현재: 양쪽 앱 모두 개발 단계 전체 허용
CREATE POLICY "auth_all" ON {table}
  FOR ALL USING (auth.role() = 'authenticated');

-- 목표 (신규 테이블 또는 강화 시):
CREATE POLICY "tenant_isolation" ON {table}
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- orders 예외 (buyer/seller 양쪽 접근):
CREATE POLICY "order_access" ON orders
  FOR ALL USING (
    buyer_tenant_id  = (SELECT tenant_id FROM users WHERE id = auth.uid())
    OR
    seller_tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- payments 예외 (payer/payee 양쪽 접근):
CREATE POLICY "payment_access" ON payments
  FOR ALL USING (
    payer_tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
    OR
    payee_tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- 관리자OS 전체 접근 (모든 테이블에 추가 policy로 적용):
CREATE POLICY "admin_full_access" ON {table}
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = auth.uid() AND t.role = 'admin'
    )
  );
-- 단, 모든 관리자 행동은 admin_logs 기록 필수 (RLS가 아니라 코드 레벨 강제)
```

**RLS 적용 순서:**
```
Phase 1: 신규 테이블 (relationships, action_queue, trust_scores, admin_settings)
         → 생성 시 바로 올바른 RLS 적용
Phase 2: 기존 테이블 강화
         → restaurant-os: Phase 3 status 정렬 완료 후 진행
         → supplier-os: 이미 tenant_id 기반 적용됨
```

---

## [ARCH-12] 핵심 계산 공식 (DB 저장 금지)

### 잔액 계산 (supplier-os 원장)

```
매출원장 잔액 =
  customers.opening_balance
  + Σ(orders.final_amount WHERE status='confirmed' AND seller_tenant_id=내 tenant)
  - Σ(payments.amount WHERE direction='inbound' AND status='confirmed' AND payee_tenant_id=내 tenant)

연체금 =
  SUM(잔액 WHERE due_date < today)
  약속 없음: due_date + 3일 초과
  약속 있음: promised_date + 1일 초과
```

### 세금 계산

```
과세: supply_price = ROUND(unit_price / 1.1), vat = unit_price - supply_price
면세: supply_price = unit_price, vat = 0
```

### 마진율 (DB 저장 금지)

```
마진율(%) = (판매가 - 매입가) / 판매가 × 100
경고 기준: products.min_margin_rate 우선 → 없으면 settings.margin_warning_threshold
```

### cost_price 스냅샷 기준

```
product_costs
WHERE start_date <= order_date
  AND (end_date IS NULL OR end_date >= order_date)
ORDER BY start_date DESC
LIMIT 1
```

### 판매가 자동 입력 순서

```
1. 견적가 (quote_items.unit_price WHERE is_final_price = true)
2. 해당 거래처 최근 order_lines 단가
3. products.base_price
```

---

## [ARCH-13] 설정값 기준 (settings 테이블)

```
MVP 노출 설정 (Level 1 — UI 노출):

key                         default   적용 위치
vat_rate                    0.1       주문/세금 계산
order_edit_lock_days        7         직원 권한 제한
margin_warning_threshold    15        상품관리 마진 경고
new_customer_days           30        CRM 고객상태 계산
overdue_warning_amount      100000    거래처 상태 판단

시스템 전용 설정 (Level 2 — UI 미노출):

rfq_expose_level2_minutes   30        RFQ 확장 노출
rfq_expose_level3_minutes   120       RFQ 전체 노출
rfq_repeat_limit            3         동일 품목 반복 제한
delivery_signal_window      5         납기 신호 기준 거래 수
signal_suppression_days     7         신호 차단 일수
sales_score_threshold       15        영업 점수 임계값
overdue_due_date_grace_days 3         연체 판단 유예일
```

모든 설정 변경 → settings_logs 기록 필수.

---

## [ARCH-14] 이벤트 기반 연결 구조

OS 간 직접 API 호출 금지. **상태 변경 기반 이벤트**로만 연결.

```
현재 구현된:
  rfq 확정 → payments(outbound) 자동 생성 [restaurant-os rfq.ts ✅]
  payments(→paid) → revalidatePath('/today') [restaurant-os ✅]
  주문 생성 → price_history 자동 기록 [restaurant-os ✅]

미구현 (우선순위 순):
  [P1] payments(confirmed) → 공급자OS 수금 이벤트
  [P1] 주문 생성 → trust_scores 자동 계산 트리거
  [P2] 신뢰도 임계값 도달 → Level 정책 이벤트 → Action Queue 생성
  [P2] 납기 지연 → Level 2 자동 개입 → 관리자OS 알림
  [P3] 직거래 감지 → Level 3 강제 개입 → Action Queue(Critical)
  [P3] 정산 조건 충족 → settlement payments 자동 생성
```

**MVP 구현 방식:** Supabase Realtime (DB 변경 → 클라이언트 실시간 구독)
```
payments 테이블 INSERT/UPDATE
  → restaurant-os: direction='outbound' → today 화면 갱신
  → supplier-os:   direction='inbound'  → 수금 목록 갱신
  → admin-os:      전체                 → 대시보드 갱신

trust_scores 테이블 UPDATE
  → admin-os: level 변화 → Action Queue 자동 생성
```

**이벤트 → 정책 → 실행 흐름:**
```
상태 변경 (DB)
  → 이벤트 발생 (Supabase Realtime)
  → 관리자OS 판단/분석 엔진 수신
  → admin_settings 기준 정책 적용
  → 자동 실행 (Level 1~3)
  → admin_logs 기록
  → 데이터 학습 센터 재유입
```

---

## [ARCH-15] OS 간 연결 구조 전체

```
[식당OS]              [공급자OS]           [관리자OS]
    │                     │                    │
    │── rfq_requests ─────┤                    │
    │                     │── rfq_bids ─────── ┤ (정책 기반 노출 제어)
    │                     │                    │
    │────────── orders ───┤                    │ (전체 조회 + 개입)
    │                     │                    │
    │─────── payments ────┤                    │ (정산 생성)
    │  (direction 분기)   │                    │
    │                     │                    │
    │── relationships ────┤                    │ (신뢰도 관제)
    │                     │                    │
    │  notifications       │  action_queue      │ (관리자 전용)
    │  (식당 전용)         │  trust_scores      │ (관리자 전용)
    │                     │  admin_settings    │ (관리자 전용)
    │                     │  admin_logs        │ (관리자 전용)
```

**데이터 경계:**
```
식당 전용:     ingredients / menus / fixed_costs / notifications / suppliers(legacy)
공급자 전용:   products / customers / quotes / funds / settings
거래 공유:     rfq_requests / rfq_bids (단계적 공개)
완전 공유:     orders / payments (direction/tenant으로 분기)
관리자 전용:   admin_logs / action_queue / trust_scores / admin_settings
```

공유는 "거래를 통해서만" 발생한다. 직접 접근 금지.

---

## [ARCH-16] 불확실 항목 (★ 확인 전 구현 금지)

| # | 항목 | 확인 방법 | 위험도 |
|---|------|-----------|--------|
| 1 | restaurant-os orders가 supplier-os orders와 같은 테이블인지 | Phase 0 쿼리 실행 | HIGH |
| 2 | ingredients.tenant_id FK가 restaurants(id)인지 tenants(id)인지 | Phase 0 FK 확인 | HIGH |
| 3 | payments 실제 CHECK constraint 목록 | Phase 0 쿼리 실행 | HIGH |
| 4 | payments에 type / reference_id 컬럼 존재 여부 | Phase 0 쿼리 실행 | MID |
| 5 | MoneyClient.tsx의 p.supplier_name이 payments.counterparty_name인지 | 코드 추적 | MID |
| 6 | admin-os middleware 구현 위치 (RealMyOS middleware.ts 현황) | 코드 확인 | MID |
| 7 | admin_logs / action_queue / trust_scores 테이블 현재 존재 여부 | DB 확인 | MID |

---

## [ARCH-17] 회계 정의 — 단일 기준 (혼용 금지)

> 미수금 / 연체금 / 예치금은 서로 다른 개념이다.
> 이 섹션의 정의가 시스템 전체의 단일 기준이다.
> 화면마다 다른 계산식 사용 금지.

---

### 미수금 (Accounts Receivable)

```
미수금 = 총 판매금액 - 총 수금금액 - 반품금액

정의: 회사가 고객에게 아직 받지 못한 전체 금액

계산 기준:
  총 판매금액 = Σ(orders.final_amount WHERE trade_status='confirmed')
  총 수금금액 = Σ(payments.amount WHERE status='confirmed' AND direction='inbound')
  반품금액    = Σ(refund orders.final_amount WHERE type='refund')

DB 저장 금지 — 실시간 계산
음수 저장 금지 (음수 = 예치금 발생 → customer_deposits로 처리)
```

**주의:**
```
연체금과 동일 개념 아님
예치금과 상계하지 않음
미수금 = -20,000 형태 저장 금지
```

---

### 연체금 (Overdue Receivable)

```
연체금 = due_date가 지난 미수금

정의: 미수금 중 결제기한을 초과한 금액
위치: 미수금의 부분집합 (연체금 ⊂ 미수금)

계산 기준:
  약속 없음: due_date + settings.overdue_due_date_grace_days(=3) 초과분
  약속 있음: promised_date + 1일 초과분 (약속이 우선)

DB 저장 금지 — 실시간 계산
```

**주의:**
```
연체금 ≠ 전체 미수금 (혼용 금지)
연체금은 미수금보다 항상 작거나 같다
```

---

### 예치금 (Customer Deposit)

```
예치금 = 고객이 초과 입금한 금액

정의: 회사가 고객에게 이후 다시 사용해줘야 하는 돈
회계 기준: 부채(liability) — 자산 아님

저장 위치: customer_deposits 테이블 (별도 관리)
```

**예시:**
```
미수금 50,000원 상태에서 고객이 70,000원 입금 시:

  올바른 처리:
    payment_allocations → 미수금 50,000 차감
    customer_deposits   → 예치금 20,000 생성
    최종: 미수금 = 0 / 예치금 = 20,000

  금지:
    receivable_amount = -20,000 저장 ❌
    current_balance   = -20,000 저장 ❌
    미수금과 예치금 상계 저장      ❌
```

**이유:**
```
음수 미수금 저장 시:
  원장 추적 불가
  회계 흐름 왜곡
  선입금과 미수 없음 상태 구분 불가
```

---

### 수금 우선순위 (Collection Priority Score)

```
정의: 회계값이 아닌 운영 점수

계산 요소:
  미수금 규모     (0~50점)
  연체 여부       (0~30점)
  거래 주기       (마지막 주문일 기준)
  마지막 수금일
  거래 중요도

DB 저장 금지 — 실시간 계산
```

**주의:**
```
수금 우선순위 점수 ≠ 미수금
수금 우선순위 점수 ≠ 연체금
회계값처럼 사용 금지
```

---

### 예치금 데이터 흐름

```
수금 발생 (payments INSERT)
  ↓
payment_allocations → 미수금 차감 (order별 배분)
  ↓
초과 금액 발생 시
  ↓
customer_deposits → 예치금 생성
  ↓
이후 주문 발생 시 → 예치금 사용 (customer_deposits 차감)
```

**관련 테이블:**
```
payments              → 수금 이벤트 (단일 소스)
payment_allocations   → 수금을 주문별로 배분
customer_deposits     → 예치금 잔액 (부채)
deposit_logs          → 예치금 변동 이력 (append-only)
```

---

### 개념 간 관계 요약

```
미수금 (전체)
  └── 연체금 (기한 초과분)

예치금 (초과 입금분) ← 미수금과 별도 / 상계 금지

수금 우선순위 ← 운영 점수 / 회계값 아님
```

| 개념 | 성격 | DB 저장 | 음수 가능 |
|------|------|---------|----------|
| 미수금 | 회계 | 금지 (실시간) | 금지 |
| 연체금 | 회계 (부분집합) | 금지 (실시간) | 금지 |
| 예치금 | 부채 | 허용 (customer_deposits) | 금지 |
| 수금 우선순위 | 운영 점수 | 금지 (실시간) | 해당 없음 |

---

## [ARCH-17A] 플랫폼 회계 이벤트 정책 (ACCOUNTING-EVENT-POLICY-001 / [D-021])

> **상태**: 정책 확정(2026-05-14, 정무님). 구현·migration 아님.  
> **근거**: `docs/DECISIONS.md` **[D-021]** · `docs/ACCOUNTING-EVENT-MODEL-001.md` · `docs/ACCOUNTING-REVERSAL-DESIGN-001.md` · `tasks.md` **`[PLATFORM-ERP-001]`**

### [reversal 원칙]

- **`pending` allocation** → 주문 취소 시 **자동 `cancelled` 허용**(현행 `realmyos` 코드).
- **`confirmed` allocation 이후** → **관리자 수동 reversal** 원칙(**자동 rollback 금지**).
- **refund** → 실제 돈 반환 이벤트; **cancellation(운영 취소)** 과 혼동 금지.
- **KPI** → **reversal/refund 완료**를 기준으로 반영하는 것을 목표로 한다(현행 코드는 일부 `confirmed` 입금 기준 집계 — **목표와의 차이는 구현으로 해소**).
- **append-only ledger 방향** — 상쇄·역분개는 **새 이벤트 row 추가**를 우선하고, **확정 금액 필드 overwrite 금지**.

### [immutable snapshot]

- **`commerce_order_items`** 주문 시점 스냅샷·**`applied_policy_snapshot`** — **삭제·덮어쓰기 금지**([D-020]·pricing migration COMMENT 정합).
- **allocation·`supplier_payables` 확정 금액** — overwrite 금지; 취소·조정은 **상태·별도 이벤트**로 표현.

### [현재 미구현] (코드 기준, 열거만)

- storefront **refund 자동화**와 **`payments` inbound 자동 reversal**
- **KPI에 reversal/refund 완료 반영**
- **전용 reversal row**(상쇄 INSERT) 파이프라인
- **partial refund** · **settlement rollback 자동화**

### [구현 전 금지]

- 임의 **rollback** 코드·**confirmed allocation 자동 취소**
- **overwrite** 방식의 회계 금액 수정
- **KPI 직접 차감**만으로 취소 반영하는 방식

### [현재 구조 vs 목표 구조]

| 구분 | 현재(저장소 기준 요지) | 목표([D-021]) |
|------|------------------------|----------------|
| 취소·무효 | `status`·`voided`·`reversed` 등 **상태 마킹**이 일부 존재 | **append-only 회계 이벤트** + 운영 상태 분리 강화 |
| KPI | 일부 **`confirmed` 입금** 기준 집계 | **reversal/refund 완료** 기준 |
| confirmed 이후 | 자동 역전 **없음**(사실) | **수동 reversal** 원칙 유지·UI·원장 보강 |

---

## Latent schema drift 기록

### [SCHEMA-DRIFT-001] `planned` 상태 불일치 (payments.status)

| 항목 | 내용 |
|------|------|
| **발견일** | 2026-05-14 |
| **위치** | `accept_bid_atomic` RPC SQL(증분 migration) · `payments` `status` 관련 **CHECK** 정의(증분 migration) · **운영** `payments` 행의 `status` 실제 분포 |
| **저장소·문서 관측** | **코드 경로**: `accept_bid_atomic` 내부 **`'planned'`** INSERT (`supabase/migrations/20260506150000_create_accept_bid_atomic.sql` 등). **migration CHECK**: 동일 시점 증분의 `payments_status_check` 등에 **`'planned'` 미포함** 가능성(문서 `PAYMENTS-TAXONOMY-DESIGN-001` 교차). **운영 DB(2026-05-14 기준 확인)**: `status = 'planned'` 인 row **없음**. |
| **판단** | 단순 dead code 한 가지 설명으로 닫기 어렵고, **baseline migration 적용 순서 차이**·**semantics drift** 가능성을 함께 둔다. **코드 / migration / 운영 데이터가 동일 semantics를 공유하지 않을 수 있는 상태** → **latent schema drift** 사례로 공식 기록. |
| **조치** | **P1 baseline synchronization** 시 재검증 · **taxonomy·type enforcement 전** 재확인 · **임의 수정 금지**(본 기록만). append-only accounting 구조에서 **민감 신호**로 취급. |

---

## payments semantics drift 관리 원칙

- **코드 / migration / 운영 DB** 삼자 **의미 일치**를 목표로 한다.
- **불일치 발견 시 즉시 기록**(`CONTEXT.md` 본 절·`[SCHEMA-DRIFT-*]` 누적) — **추정만으로 문서를 단정하지 않는다**.
- **임의 수정 금지** — 특히 drift 확인 직후의 임의 CHECK·데이터 patch.
- **enforcement 전 semantics alignment 필수**([`DECISIONS.md` **[D-022]**](../DECISIONS.md) 순서).
- **append-only accounting**을 넓히기 **이전에** semantics consistency를 우선한다.

---

## taxonomy enforcement 상태 (`payments.type`)

| 구분 | 내용 |
|------|------|
| **현재** | **Policy 확정 단계**(`PAYMENTS-TAXONOMY-POLICY-001` · **[D-022]**). **DB-level enforcement 미적용**. **legacy `type` NULL 허용**. |
| **목표** | 신규 accounting row **`type` mandatory** → legacy **backfill·정렬 완료** → **P1 이후** **`NOT NULL`·CHECK 등 enforcement** 검토. |
| **비고** | 상세 type 목록·KPI 규칙은 **`docs/PAYMENTS-TAXONOMY-DESIGN-001.md`**; **정책·순서는 [D-022]** 가 우선. |

---

## lifecycle finality 정의 ([D-023] · ACCOUNTING-LIFECYCLE-POLICY-001)

> **현행**: 저장소는 **transition state** — §아래 “**현행 구조 한계**” 참조. **목표·정책**: **`DECISIONS.md` [D-023]** 및 `docs/ACCOUNTING-LIFECYCLE-DESIGN-001.md`.

### [finality 단계 정의] (정책 목표 기준)

| 단계 | finality (목표) | rollback / 역처리 (목표 방향) | 방식 (목표) |
|------|-------------------|-------------------------------|-------------|
| allocation `pending` | 낮음 | 자동 `cancelled` 허용(현행과 정합) | 운영·append-only cancel 이벤트 |
| allocation `confirmed` | 중간 | **수동만**([D-021]) | 수동 reversal / 조정 절차 |
| payable `unpaid` | 중간 | 취소 가능(현행: status update → `cancelled`) | 금액 불변·감사 메타 |
| payable `paid` | **높음** | **금지 방향** | **adjustment only** ([D-023] Q1) |
| settlement `payments` row (`type=settlement`) | **매우 높음** | **금지** | **새 이벤트로 상쇄** (adjustment / reversal event) |
| **payout 완료** (자금 사실) | **최고** | **금지** | **external reconciliation** |

### [UPDATE `reversed` transition debt]

- **`reverse_disbursement`**: `payments` **`UPDATE` → `status = 'reversed'`** (`supabase/migrations/20260507060000_create_reverse_disbursement.sql`).
- **storefront inbound reversal**: **`payments` INSERT** + `reversal_of_id` (**append-only**).
- **두 패턴 공존** = **transition debt** — outbound accounting semantics **미정렬**.
- **즉시 제거 대상이 아님** — **[D-023]** 전환 순서에 따라 **정책 확정 후 P1에서 점진 이행** · **append-only outbound 통합 예정**.

### [settlement ≠ paid 원칙]

- **settlement** = **회계 인식 이벤트** (RFQ 수수료 `payments` row; **[D-022]** 에서 명칭 유지).
- **`paid`** = **실제 지급 finality** (`supplier_payables.paid` — **[D-023]** Q1 옵션 B).
- **settlement 완료 ≠ payable `paid`** — 혼동 금지.
- **payable `paid`** 는 **external reconciliation** 성격.

### [settlement / payout 현재 구조 한계] (현행 사실)

- storefront **`supplier_payables` → `paid` 전이**: 애플리케이션 경로 **미구현**(저장소 기준, `ACCOUNTING-LIFECYCLE-DESIGN-001` 교차).
- **settlement ↔ payable**: 코드상 **직접 연결 없음**(RFQ settlement vs storefront payable **별개 흐름**).
- **append-only outbound accounting**: **미완성** — `UPDATE reversed` 축 잔존.

---

## [ECL] Execution Control Layer — 실행 통제 레이어

> 이 레이어는 기존 구조를 수정하지 않는다.
> 목적: 사고 방지 / 실행 통제 / 책임 추적 / 롤백 보장
> 모든 Phase 실행 전 외부 문서 승인 필수.
> 모든 실행 후 DB execution_logs 기록 필수.
> 로그 없는 작업은 "미실행"으로 간주한다.

---

### [ECL-01] 위험 등급 시스템 (Risk Level)

```
LOW      → DB 조회만. 데이터 변경 없음.
MID      → 컬럼 추가 / 신규 테이블 생성. 기존 데이터 무영향.
HIGH     → 기존 데이터 UPDATE / 코드 로직 변경. 부분 영향.
CRITICAL → 기존 운영 흐름 직접 변경. 잘못되면 서비스 중단.
```

---

### [ECL-02] 실행 로그 시스템 (Dual Layer)

#### Layer 1 — DB (System of Record)

```sql
execution_logs
  id               uuid        PK DEFAULT gen_random_uuid()
  phase            text        NOT NULL   -- 'phase_0' | 'phase_1' | ... | 'phase_5'
  step             text        NOT NULL   -- 세부 작업명 (예: 'add_seller_tenant_id')
  executed_by      text        NOT NULL   -- user_id 또는 'system' 또는 'developer_manual'
  executed_at      timestamptz DEFAULT now()
  result           text        NOT NULL   CHECK (result IN ('success','fail','partial'))
  risk_level       text        NOT NULL   CHECK (risk_level IN ('LOW','MID','HIGH','CRITICAL'))
  notes            text                   -- 실행 중 특이사항
  rollback_required boolean    DEFAULT false
  rollback_done    boolean    DEFAULT false
  created_at       timestamptz DEFAULT now()

-- append-only. 수정 / 삭제 금지.
```

**insert 방식 (Phase별 분리):**

```
Phase 0~3 (SQL 직접 실행):
  → 작업 SQL 실행 직후 execution_logs INSERT를 수동으로 함께 실행
  → 예:
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS type text;
    INSERT INTO execution_logs (phase, step, executed_by, result, risk_level, notes)
    VALUES ('phase_1', 'add_payments_type_column', 'developer_manual', 'success', 'MID', '');

Phase 4~5 (앱 코드 배포):
  → Server Action 레벨에서 자동 insert
  → 코드 실행 성공/실패 결과를 즉시 기록
```

#### Layer 2 — 외부 문서 (Control Layer)

```
플랫폼: Notion 또는 Google Sheet
목적:   실행 승인 / 사전 체크 / 의사결정 근거 기록

항목:
  Phase          작업 식별
  작업 내용      무엇을 실행했는가
  실행자         누가 실행했는가
  승인자         누가 승인했는가
  실행 전 체크   백업 / 검증 완료 여부
  실행 여부      실행 / 보류 / 취소
  결과 요약      성공 / 실패 / 부분 성공
  이슈 / 비고    특이사항 기록
```

**역할 분리 (핵심):**

```
DB execution_logs  = "무조건 기록되는 사실" (What happened)
외부 문서          = "왜 실행했는지 판단"   (Why it happened)

둘 중 하나라도 없으면 불완전하다.
```

---

### [ECL-03] 실행 주체 및 승인 기준

| Phase | Executor | Approval | Risk |
|-------|----------|----------|------|
| Phase 0 | Developer | 관리자 확인 필수 (결과 공유) | LOW |
| Phase 1 | Developer | 관리자 승인 후 실행 | MID |
| Phase 2 | Developer | 관리자 승인 후 실행 | MID |
| Phase 3 | Developer | 관리자 승인 필수 + 백업 확인 | HIGH |
| Phase 4 | Developer | 관리자 승인 후 배포 | HIGH |
| Phase 5 | Developer | 관리자 승인 필수 + 단계별 검증 | CRITICAL |

```
Approval 기준:
  관리자 확인 필수  → 결과만 공유. 실행 전 승인 불필요.
  관리자 승인 후 실행 → 실행 전 외부 문서 승인 완료 필수.
  관리자 승인 필수  → 외부 문서 서명/확인 + DB 백업 완료 후에만 실행.
```

---

### [ECL-04] Phase별 Gate Conditions (진입 조건)

#### Phase 0 — DB 상태 확인

```
[Phase 0 Gate Conditions]
- 실행 환경: Supabase SQL Editor (운영 DB 직접 접근)
- Supabase 프로젝트 접근 권한 확인
- 읽기 전용 작업임을 확인 (SELECT / information_schema 조회만)

→ 하나라도 충족 안 되면 실행 금지
```

**Risk: LOW**

#### Phase 1 — 안전한 컬럼 추가

```
[Phase 1 Gate Conditions]
- Phase 0 완료 확인 (execution_logs에 phase_0 success 기록 존재)
- Phase 0에서 확인된 orders / payments 실제 컬럼 목록 보유
- 추가할 컬럼이 이미 존재하지 않는지 확인
  (IF NOT EXISTS 사용으로 중복 방지)
- DB 백업 완료 (Supabase 대시보드 → Backups 확인)
- 외부 문서 승인 완료

→ 하나라도 충족 안 되면 실행 금지
```

**Risk: MID**

#### Phase 2 — relationships 테이블 신규 생성

```
[Phase 2 Gate Conditions]
- Phase 0 완료 확인
- relationships 테이블이 현재 DB에 존재하지 않는지 확인
  SELECT * FROM information_schema.tables WHERE table_name = 'relationships';
- tenants 테이블 존재 및 구조 확인 완료
- DB 백업 완료
- 외부 문서 승인 완료

→ 하나라도 충족 안 되면 실행 금지
```

**Risk: MID**

#### Phase 3 — payments status 정렬

```
[Phase 3 Gate Conditions]
- Phase 0 완료 확인 (payments CHECK constraint 파악 완료)
- Phase 1 완료 확인
- 현재 payments status 분포 확인 및 기록
  SELECT status, direction, COUNT(*) FROM payments GROUP BY status, direction;
- 백업 완료 (Supabase Point-in-time Recovery 확인)
- restaurant-os / supplier-os 코드 변경 배포 완료
  (DB backfill 전 코드가 먼저 배포되어야 함)
- 영향받는 row 수 확인 및 기록
  SELECT COUNT(*) FROM payments WHERE status IN ('planned','paid','cancelled');
- 외부 문서 승인 완료 (관리자 서명)

→ 하나라도 충족 안 되면 실행 금지
```

**Risk: HIGH**

#### Phase 4 — supplier-os orders or() 쿼리 제거

```
[Phase 4 Gate Conditions]
- Phase 1 완료 확인 (seller_tenant_id 컬럼 존재)
- seller_tenant_id NULL 레코드 0개 확인
  SELECT COUNT(*) FROM orders WHERE seller_tenant_id IS NULL AND tenant_id IS NOT NULL;
  → 결과가 0이 아니면 실행 금지
- 스테이징 환경 테스트 완료 (없으면 로컬 테스트)
- 외부 문서 승인 완료

→ 하나라도 충족 안 되면 실행 금지
```

**Risk: HIGH**

#### Phase 5 — restaurant-os orders 구조 정렬

```
[Phase 5 Gate Conditions]
- Phase 0 완료 확인 (orders 테이블 구조 파악 완료)
- Phase 1 완료 확인 (seller_tenant_id 컬럼 존재)
- Phase 2 완료 확인 (relationships 테이블 존재)
- 기존 order_items 데이터 보존 계획 수립
  SELECT COUNT(*) FROM order_items;
- 신규 order_lines 생성 로직 코드 리뷰 완료
- 기존 주문 조회 로직이 깨지지 않는지 테스트
- DB 백업 완료
- 외부 문서 승인 완료 (관리자 서명)

→ 하나라도 충족 안 되면 실행 금지
```

**Risk: CRITICAL**

---

### [ECL-05] Pre-flight Checklist (실행 전 공통 체크)

```
모든 Phase 공통:
  □ DB 백업 완료 (Supabase 대시보드 확인)
  □ 영향받는 테이블 row count 기록
  □ 영향받는 컬럼 NULL 여부 확인
  □ 외부 문서 승인 완료
  □ execution_logs 테이블 존재 확인
  □ 롤백 SQL 준비 완료 (실행 전 작성)

HIGH / CRITICAL 추가 체크:
  □ 운영 트래픽 낮은 시간대 선택 (새벽 2~5시 권장)
  □ 실행 중 모니터링 담당자 지정
  □ 실행 후 즉시 검증 쿼리 준비
  □ 에러 발생 시 연락 체계 확인
```

---

### [ECL-06] 롤백 전략 (Rollback Strategy)

#### Phase 1 롤백

```
[Rollback Strategy — Phase 1]

Trigger:
  - ALTER TABLE 실행 후 앱에서 500 에러 발생
  - 신규 컬럼으로 인한 기존 쿼리 오류

Action:
  - 신규 컬럼은 NULL 허용 → 기존 로직에 영향 없음
  - 코드 롤백 없이 컬럼 무시로 대응 가능
  - 필요 시: ALTER TABLE orders DROP COLUMN IF EXISTS seller_tenant_id;
    (데이터 없는 상태에서만 가능)

Limit:
  - 컬럼에 데이터가 쌓인 후에는 DROP 금지
  - 이 경우 컬럼 유지 + 코드에서 무시 처리

Risk: MID → 롤백 쉬움
```

#### Phase 2 롤백

```
[Rollback Strategy — Phase 2]

Trigger:
  - relationships 테이블 생성 후 RLS 오류
  - 기존 쿼리와 충돌

Action:
  - 신규 테이블이므로 DROP TABLE relationships; 가능
    (데이터 없는 상태에서만)
  - 기존 suppliers 테이블이 대체 역할 유지

Limit:
  - 데이터 입력 후에는 DROP 금지 → 비활성화(is_active=false) 처리

Risk: MID → 신규 테이블이라 롤백 쉬움
```

#### Phase 3 롤백

```
[Rollback Strategy — Phase 3]

Trigger:
  - backfill 후 payments 조회 오류
  - status 값 불일치로 앱 에러 발생
  - 영향받은 row 수가 예상과 다름

Action:
  - 즉시 중단: 코드를 기존 status 값('planned','paid','cancelled')으로 롤백
  - DB 복구:
    UPDATE payments SET status = 'planned'   WHERE status = 'pending'   AND direction = 'outbound';
    UPDATE payments SET status = 'paid'      WHERE status = 'confirmed' AND direction = 'outbound'
      AND updated_at > '[backfill 실행 시각]';
    UPDATE payments SET status = 'cancelled' WHERE status = 'reversed'
      AND updated_at > '[backfill 실행 시각]';

Limit:
  - backfill 실행 시각 기록 필수 (updated_at 기준 복구를 위해)
  - 코드와 DB를 동시에 롤백해야 함 (순서: 코드 먼저 → DB 복구)
  - Supabase Point-in-time Recovery 최후 수단

Risk: HIGH → 롤백 가능하지만 복잡
```

#### Phase 4 롤백

```
[Rollback Strategy — Phase 4]

Trigger:
  - or() 제거 후 supplier-os에서 기존 주문 조회 불가
  - seller_tenant_id NULL 레코드가 있었는데 backfill 미완료

Action:
  - 코드 롤백: or() 쿼리 복원 (git revert)
  - DB는 변경 없음 → 코드 롤백만으로 복구

Limit:
  - 코드 롤백으로 완전 복구 가능

Risk: HIGH → 코드 롤백으로 즉시 복구
```

#### Phase 5 롤백

```
[Rollback Strategy — Phase 5]

Trigger:
  - order_lines 생성 중 오류
  - 기존 주문 조회 로직 깨짐
  - 데이터 불일치 발생

Action:
  - 신규 order_lines 생성 코드 비활성화
  - 기존 order_items 기반 조회 복원
  - DB: 신규 생성된 order_lines만 삭제
    DELETE FROM order_lines WHERE created_at > '[Phase 5 실행 시각]';

Limit:
  - order_items 데이터는 절대 삭제하지 않음
  - 기존 주문 조회는 항상 order_items 기반 fallback 유지

Risk: CRITICAL → 코드 + DB 동시 롤백 필요 / 사전 테스트 필수
```

---

### [ECL-07] Hard Stop Rules (실행 금지 규칙)

```
아래 중 하나라도 감지되면 즉시 작업 중단:

❌ DROP TABLE 실행 시도
❌ 기존 컬럼 DELETE / 삭제 시도
❌ 기존 컬럼 TYPE 변경 시도
❌ 기존 데이터 OVERWRITE (UPDATE without WHERE)
❌ Gate Conditions 미충족 상태에서 실행
❌ 외부 문서 승인 없는 HIGH / CRITICAL 작업
❌ DB 백업 미완료 상태에서 HIGH / CRITICAL 작업
❌ execution_logs 기록 없는 작업 완료 처리
❌ rollback_required = true 상태에서 다음 Phase 진행
❌ Phase 0 미완료 상태에서 Phase 1 이후 진행
```

---

### [ECL-08] 실행 순서 최종 정리

```
Phase 0  [LOW]      DB 상태 확인
  ↓ Gate 통과 확인
Phase 1  [MID]      안전한 컬럼 추가
  ↓ Gate 통과 확인
Phase 2  [MID]      relationships 테이블 생성
  ↓ Gate 통과 확인
Phase 3  [HIGH]     payments status 정렬 (코드 배포 → DB backfill)
  ↓ Gate 통과 확인
Phase 4  [HIGH]     supplier-os or() 쿼리 제거
  ↓ Gate 통과 확인
Phase 5  [CRITICAL] restaurant-os orders 구조 정렬

각 Phase 사이:
  □ execution_logs 기록 확인
  □ 외부 문서 결과 기록
  □ 롤백 필요 여부 판단
  □ 다음 Phase Gate Conditions 확인
```

---

### [ECL-09] 외부 문서 운영 기록 템플릿

```
[식식이OS 실행 통제 로그 — Phase X]

실행일:
Phase:
작업 내용:
실행자:
승인자:

Pre-flight 체크:
  □ DB 백업 완료
  □ 영향 row count 확인: [숫자]
  □ NULL 데이터 확인: [결과]
  □ 롤백 SQL 준비 완료
  □ 외부 문서 승인

실행 결과:
  결과: success / fail / partial
  execution_logs ID: [uuid]
  특이사항:

이슈 발생 여부:
  □ 없음
  □ 있음 → 내용:

롤백 실행 여부:
  □ 불필요
  □ 실행함 → 내용:

승인자 확인:
  서명: __________ 일시: __________
```

---

## [PEV] Post-Execution Validation Layer — 실행 후 검증 레이어

> 목적: 모든 Phase 실행 후 데이터 이상 여부를 즉시 검증하여
> 문제를 발생이 아니라 감지 단계에서 차단한다.
>
> 검증 없는 실행은 실패로 간주한다.
> 검증 실패 시 다음 Phase 진행 금지.

---

### [PEV-00] 핵심 원칙

```
1. 실행 성공 ≠ 정상 동작
2. 모든 변경은 반드시 검증된다
3. 검증 없는 실행은 실패로 간주한다
4. 검증 실패 시 다음 Phase 진행 금지
5. 검증 결과는 execution_logs에 반드시 기록된다
```

---

### [PEV-01] 검증 실행 위치

```
Phase 1 종료 직후 → 컬럼 추가 검증
Phase 2 종료 직후 → 테이블 생성 검증
Phase 3 종료 직후 → payments 정렬 검증
Phase 4 종료 직후 → orders 조회 검증
Phase 5 종료 직후 → 주문 구조 검증

→ 검증 통과 후에만 다음 Phase 진입 가능
```

---

### [PEV-02] 검증 유형 (4가지)

```
1. 구조 검증 (Schema Validation)
   목적: 컬럼 / 테이블이 정확히 생성됐는지 확인

2. 데이터 정합성 검증 (Data Integrity)
   목적: 기존 데이터가 깨지지 않았는지 확인
   기준: 실행 전/후 row 수 동일해야 정상

3. 분포 검증 (Distribution Check)
   목적: 특정 값이 비정상적으로 몰리지 않았는지 확인

4. NULL / 누락 검증 (Completeness Check)
   목적: 필수 데이터 누락 여부 확인
```

---

### [PEV-03] Phase별 검증 쿼리

#### Phase 1 검증

```sql
-- seller_tenant_id 컬럼 추가 확인
SELECT COUNT(*)
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name = 'seller_tenant_id';
-- 기대값: 1

-- payments type 컬럼 추가 확인
SELECT COUNT(*)
FROM information_schema.columns
WHERE table_name = 'payments'
  AND column_name = 'type';
-- 기대값: 1

-- 기존 데이터 row 수 유지 확인 (실행 전 수치와 비교)
SELECT COUNT(*) FROM orders;
SELECT COUNT(*) FROM payments;
-- 기대값: 실행 전과 동일
```

#### Phase 2 검증

```sql
-- relationships 테이블 존재 확인
SELECT COUNT(*)
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'relationships';
-- 기대값: 1

-- RLS 활성화 확인
SELECT relrowsecurity
FROM pg_class
WHERE relname = 'relationships';
-- 기대값: true
```

#### Phase 3 검증

```sql
-- 비정상 status 값 존재 여부 (0이어야 정상)
SELECT COUNT(*)
FROM payments
WHERE status NOT IN ('pending','confirmed','reversed');
-- 기대값: 0

-- status 분포 확인 (planned / paid / cancelled가 0이어야 정상)
SELECT status, direction, COUNT(*)
FROM payments
GROUP BY status, direction
ORDER BY status;

-- 전체 row 수 유지 확인
SELECT COUNT(*) FROM payments;
-- 기대값: 실행 전과 동일
```

#### Phase 4 검증

```sql
-- seller_tenant_id NULL 레코드 없어야 정상
SELECT COUNT(*)
FROM orders
WHERE seller_tenant_id IS NULL
  AND tenant_id IS NOT NULL;
-- 기대값: 0

-- supplier-os 조회 정상 여부
SELECT COUNT(*)
FROM orders
WHERE seller_tenant_id IS NOT NULL;
-- 기대값: 0 이상 (기존 데이터 기준)
```

#### Phase 5 검증

```sql
-- order_lines 연결 누락 확인
SELECT COUNT(*)
FROM order_lines
WHERE order_id IS NULL;
-- 기대값: 0

-- 기존 order_items 데이터 유지 확인
SELECT COUNT(*) FROM order_items;
-- 기대값: 실행 전과 동일 (삭제 없어야 함)

-- 신규 order_lines 생성 확인
SELECT COUNT(*) FROM order_lines;
-- 기대값: 0 이상 (신규 생성분)
```

---

### [PEV-04] 자동 실패 조건 (Hard Validation Fail)

아래 중 하나라도 해당되면 즉시 실패 처리:

```
❌ 실행 전 대비 row 수 감소
❌ status 값 비정상 존재 (정의된 값 외)
❌ 필수 컬럼 NULL 비율 증가
❌ FK 연결 끊김 (order_id IS NULL 등)
❌ 예상하지 못한 값 생성
```

---

### [PEV-05] 검증 실패 시 처리 순서

```
1. 즉시 다음 Phase 진행 중단
2. execution_logs.result = 'fail'
   execution_logs.validation_result = 'fail'
   execution_logs.rollback_required = true
3. ECL-06 롤백 전략 실행
4. 원인 분석 완료 후 재시도
5. 재시도 전 Gate Conditions 재확인 필수
```

---

### [PEV-06] execution_logs 확장 (컬럼 추가)

```sql
-- Phase 1 실행 시 아래 컬럼 함께 추가
ALTER TABLE execution_logs
  ADD COLUMN IF NOT EXISTS validation_result text
    CHECK (validation_result IN ('pass','fail','skipped')),
  ADD COLUMN IF NOT EXISTS validation_notes text;
```

---

### [PEV-07] 실행 흐름 (최종 완성)

```
Phase 실행
  ↓
ECL: execution_logs 기록 (result = success/fail)
  ↓
PEV: 검증 쿼리 실행
  ↓
validation_result = pass
  → execution_logs.validation_result = 'pass' 기록
  → 외부 문서 검증 결과 기록
  → 다음 Phase Gate Conditions 확인
  → 다음 Phase 진행

validation_result = fail
  → execution_logs.validation_result = 'fail' 기록
  → rollback_required = true
  → ECL-06 롤백 전략 즉시 실행
  → 다음 Phase 진행 금지
```

---

### [PEV-08] 최종 선언

```
실행 → 통제 → 검증 → 롤백(필요 시) → 다음 Phase

검증 없는 성공은 실패다.
데이터가 맞지 않으면 시스템은 틀린 것이다.
```

---

## [ARCH-09] 커머스 도메인 경계 정의

### buy란 무엇인가

buy = 이미 확보된 상품을 가장 빠르게 다시 구매하는 공간

buy는 재주문 중심이지만
카테고리/검색/상품 탐색 기능도 제공한다.
식당 사장님에게 익숙한 쇼핑몰 UX를 제공하되
그 위에 운영 데이터 엔진이 결합된 구조다.

buy의 목적:
- 재주문 (핵심)
- 빠른 구매
- 운영 기반 추천
- 자동발주 진입
- RFQ 자연 연결
- 상품 탐색 (카테고리/검색)

buy가 아닌 것:
- 오픈마켓
- 최저가 경쟁 플랫폼
- 쿠폰/타임세일/이벤트 중심 쇼핑몰
- 광고 배너 중심 홈 화면

buy는 식당OS 운영 흐름(/today)을 보조하는
구매 인터페이스다.
buy가 식당OS의 최상위 허브가 되어선 안 된다.

---

### 상품 등록 주체

상품 등록 가능한 주체:
- 운영자 (관리자OS)
- 승인된 공급자

불특정 사용자 상품 등록 금지.
셀러 마켓플레이스 구조 금지.

이유:
식식이OS는 검증된 공급 SKU 저장소다.
오픈마켓으로 변질되면 운영 통제력을 잃는다.

---

### buy ↔ RFQ ↔ commerce_orders 경계

| 도메인 | 역할 | 테이블 |
|--------|------|--------|
| buy | 확보된 상품 즉시 구매 | commerce_orders / cart_items |
| rfq | 없는 상품 요청 / 공급 탐색 | rfq_requests / rfq_bids |
| orders | 기존 공급자 납품 주문 | orders / order_lines |

경계 원칙:
- buy ≠ rfq (역할 다름 / 테이블 분리)
- commerce_orders ≠ orders (흐름 다름 / 테이블 분리)
- RFQ → commerce_order 전환 가능
  (rfq_request_id 보존 필수 / traceability 유지)

Storefront는 RFQ를 대체하지 않는다.

- RFQ = 신규 거래처 탐색
- Storefront = 반복주문 / 재주문

두 시스템은 역할이 다르며,
식당 lifecycle 안에서 함께 동작한다.

### 플랫폼 주문·allocation·정산 (STOREFRONT-ARCH-001)

```
Platform Order   (commerce_orders — owner: 디닷페이스 / 플랫폼)
       ↓
Supplier Fulfillment   (allocation된 공급자 — 예: 해내음코리아)
       ↓
Supplier Settlement    (공급자 ↔ 디닷페이스)
```

- **식당 ↔ 디닷페이스**: Storefront 결제·주문·환불·클레임·플랫폼 미수.
- **공급자 ↔ 디닷페이스**: fulfillment 대가·수수료·정산(식당↔공급자 직접 결제 없음 — PRODUCT 직거래 금지와 동일).

### ERP 가격 금액 축 (DISCOUNT-ENGINE-POLICY-001, 정책 확정 / 구현 전)

아래는 **정무님 확정 원칙(2026-05-14)** 에 따른 **금액 축 정의**이다. **`DECISIONS.md` [D-020]** 과 `PRODUCT.md` §13-1-2를 SSOT로 한다.

| 축 (개념명) | 저장소·코드에서의 기준 (현재 / 향후) |
|-------------|----------------------------------------|
| **customer_charge** | 식당 실결제 금액. **현행** storefront bridge에서 `payments.amount`는 `commerce_orders.total_amount`(주문 합계)와 대사 (`PLATFORM-ERP-P0-001`). **향후** 품목 스냅샷의 `customer_charge`와 1:1 대사하도록 정렬 예정. |
| **supplier_basis** | 공급자 납품 기준가. **`commerce_order_allocations` 등에 `supplier_basis` 컬럼은 현재 없음** (grep·migration 기준). 향후 스냅샷 컬럼으로 추가 예정 — **구현 전 임의 컬럼 추가 금지** (migration 별도 승인). |
| **platform_fee** | **정책(초기)**: `customer_charge × fee_rate`. **현행** `commerce_order_allocations.platform_fee_amount`는 `item_amount`(주문 라인 `total_price` 기반) × fee% 로 계산됨 (`commerce-allocation.ts`) — 단일 축 모델. **[D-020]** 적용 후에는 `customer_charge` 스냅샷 기준으로 맞출 **구현 과제**가 남음. |
| **supplier_payable** | **현행** `supplier_payables.payable_amount` = allocation의 `supplier_payable_amount`. **향후** [D-020]·PRODUCT §13-1-2 식과 스냅샷 정합. |
| **platform_margin** | `customer_charge − supplier_payable` (리포트·economics). **테이블 컬럼으로 저장할지**는 구현 단계에서 결정; 현재는 **계산값**으로 취급 가능. |

**명시 (미구현)**:

- **`pricing_policies` / `pricing_policy_targets` 테이블**: 저장소 incremental에 **아직 없음** (`DISCOUNT-ENGINE-DESIGN-001` 설계안만 존재).
- **정책 단계**: 본 절은 **정책 확정 문서화**이며, 코드·DB 변경은 **`[DISCOUNT-ENGINE-001]`** Epic 승인 후 진행.

---

### commerce_orders 구조

RFQ orders와 분리된 별도 테이블.

이유:
RFQ: 견적/입찰/협상/공급 탐색 포함
Commerce: 즉시 구매/장바구니/결제/재주문

**플랫폼 주문 (Platform Order)**: 본 테이블의 주문은 **공급자OS에 수동으로 재키잉하는 ERP 입력 대상이 아니다.** 발생 이벤트는 **디닷페이스 ERP(관리자OS)** 로 **자동 동기화**되는 것을 목표로 한다. 실물·물류 실행은 **fulfillment 공급자**(예: 해내음코리아 등)에게 **allocation** 될 수 있다.

필수 필드:
- tenant_id (RULE-01)
- source: 'direct' | 'rfq'
- rfq_request_id: uuid | null (RFQ 기원 추적)
- status: 'pending' | 'confirmed' | 'cancelled'
- payment_method: 'card' | 'bank_transfer' | 'kakao'
- payment_status: 'unpaid' | 'paid' | 'refunded'

RFQ traceability:
RFQ에서 시작된 commerce_order는
반드시 rfq_request_id를 보존한다.

이유:
- 어떤 RFQ에서 시작됐는지 추적 가능
- 어떤 sourcing이었는지 추적 가능
- 추천/공급 분석/반복 구매 데이터 연결

---

### /buy 라우트 구조

경로: resturant_os/src/app/(app)/buy/

/buy                   → 상품 홈 (추천/재주문/카테고리)
/buy/search            → 검색
/buy/category/[id]     → 카테고리
/buy/product/[id]      → 상품 상세
/buy/cart              → 장바구니
/buy/checkout          → 결제
/buy/orders            → 커머스 구매내역

하단 탭: 추가하지 않음 (초기)
진입점:
- /today 카드에서 자연 진입
- /rfq/new에서 "상품 먼저 보기" 연결

---

### 커머스 MVP 테이블 목록

초기 구현 대상:
- commerce_products (상품)
- commerce_product_categories (카테고리)
- cart_items (장바구니)
- commerce_orders (커머스 주문)
- commerce_order_items (주문 상품)

초기 구현 제외:
- recommendation_logs (나중)
- review_logs (나중)
- promotion_logs (나중)

---

### 커머스 구현 금지 사항

(RULE-27~30 참조)

- 오픈마켓 구조
- 쿠폰/타임세일/광고배너/이벤트 남발
- AI 추천 엔진 (초기)
- 자동 주문 생성
- /buy 하단 탭 즉시 추가
- commerce_orders ↔ orders 혼용
- RFQ 기원 commerce_order에서 rfq_request_id 누락
- 불특정 사용자 상품 등록
- buy가 today를 덮는 구조
