# RealMyOS — CONTEXT.md
> 이 문서는 "설명"이 아니라 "구조 정의 문서"다.
> 실제 코드 기반으로 작성. 추측 금지. 불확실한 부분은 TODO 표시.
> 최종 업데이트: 2026-04-23

---

## [ARCH-01] 핵심 전제 (절대 변경 금지)

| # | 전제 | 설명 |
|---|------|------|
| 1 | 단일 Supabase DB | 모든 앱이 동일한 DB 프로젝트를 사용 |
| 2 | tenant_id 기반 전체 격리 | 모든 테이블의 데이터 소유 및 접근 제어 단위 |
| 3 | tenants = 모든 주체 | restaurant / supplier / admin 모두 tenants 테이블의 레코드 |

### ⚠️ 현재 상태

현재 DB는 "논리적 통합 완료 / 물리적 전환 진행 중" 상태다.

- 데이터 모델은 tenant 기반으로 재정의 완료
- 하지만 일부 테이블과 코드에는 기존 restaurant_id / supplier_id 구조가 남아있다
- 따라서 시스템은 완전히 전환된 상태가 아니라, "구조 전환 중" 상태로 간주한다
- 모든 신규 개발은 tenant 구조 기준으로 작성해야 한다
---

## [ARCH-02] 시스템 구성

```
단일 Supabase DB
      │
      ├── [supplier-os]  Next.js App  (공급자 ERP)
      │     경로: C:\Users\babok\Desktop\realmyos
      │     배포: real-my-os.vercel.app
      │     사용자: role = 'supplier'
      │
      └── [restaurant-os]  Next.js App  (식당 구매 OS)
            경로: C:\Users\babok\Desktop\resturant_os
            사용자: role = 'restaurant'
```

두 앱은 UI와 역할이 다를 뿐, **동일한 DB의 동일한 테이블**을 읽고 쓴다.

---

## [ARCH-03] tenant 구조 정의

### tenants 테이블 — 시스템의 최상위 주체

```sql
tenants
  id      uuid PK
  name    text NOT NULL
  slug    text UNIQUE
  role    text NOT NULL  -- 'supplier' | 'restaurant' | 'admin'
  -- TODO: 전체 컬럼 확인 필요 (created_at 등)
```

**핵심 정의:**
- `restaurant`과 `supplier`는 별도 entity가 아니다
- 둘 다 `tenants` 테이블의 레코드이며, `role`로 구분한다
- `tenant_id` = 해당 데이터의 소유자(owner)
- 모든 테이블은 `tenant_id`를 통해 접근 제어된다

### users 테이블 — 테넌트에 속한 사용자

```sql
users
  id          uuid PK  -- = auth.uid()
  tenant_id   uuid FK → tenants  NOT NULL
  role        text     -- 'admin' | 'supplier' | 'restaurant'
  user_type   text     -- 'human'
  email       text
```

---

## [ARCH-04] orders 구조 정의 (확정)

**orders는 단일 테이블이다. restaurant orders / supplier orders 구분 없음.**

```sql
orders
  id                uuid PK
  tenant_id         uuid FK → tenants  -- 데이터 소유자 (seller = 공급자)
  buyer_tenant_id   uuid FK → tenants  -- 구매자 (restaurant)
  seller_tenant_id  uuid FK → tenants  -- 판매자 (supplier)
  order_date        date NOT NULL
  status            text  -- 'draft' | 'confirmed' | 'cancelled'
  total_amount      integer
  discount_amount   integer
  point_used        integer
  final_amount      integer
  memo              text
```

**데이터 접근 규칙:**
- supplier-os: `seller_tenant_id = 내 tenant_id` 조건으로 조회
- restaurant-os: `buyer_tenant_id = 내 tenant_id` 조건으로 조회
- RLS: `tenant_id` 기반 행 격리

**기존 구조 전환:**
- restaurant-os의 `orders` 테이블(restaurant_id 기반) → **구조 전환 중**
- 신규 개발은 반드시 `buyer_tenant_id` / `seller_tenant_id` 사용
- 기존 `restaurant_id` 컬럼 → 점진적 제거 대상

### order_lines — 주문 라인 (스냅샷 구조)

```sql
order_lines
  id                    uuid PK
  order_id              uuid FK → orders
  tenant_id             uuid FK → tenants
  product_id            uuid FK → products
  product_code          text     -- 스냅샷 (주문 시점 고정, 이후 변경 불가)
  product_name          text     -- 스냅샷
  cost_price            integer  -- 스냅샷 (서버에서 DB 조회 후 확정, 클라이언트 값 무시)
  unit_price            integer
  quantity              integer
  fulfillment_type      text     -- 'stock' | 'consignment'
  tax_type              text     -- 'taxable' | 'exempt'
  line_total_override   integer
```

---

## [ARCH-05] payments 구조 정의 (확정)

**payments는 단일 테이블이다. inbound / outbound 방향을 direction으로 구분한다.**

```sql
payments
  id              uuid PK
  tenant_id       uuid FK → tenants  -- 데이터 소유자
  payer_tenant_id uuid FK → tenants  -- 지급자
  payee_tenant_id uuid FK → tenants  -- 수취자
  direction       text NOT NULL  -- 'inbound' | 'outbound'
  amount          integer NOT NULL
  due_date        date
  paid_at         timestamptz
  status          text  -- 'planned' | 'paid'
  memo            text
  order_id        uuid FK → orders  -- 연결된 주문 (선택)
  -- TODO: 전체 컬럼 확인 필요
```

**데이터 접근 규칙:**
- supplier-os (수금): `payee_tenant_id = 내 tenant_id` AND `direction = 'inbound'`
- restaurant-os (지급): `payer_tenant_id = 내 tenant_id` AND `direction = 'outbound'`

**기존 구조 전환:**
- supplier-os의 `payments` (tenant_id 단일) → **구조 전환 중**
- restaurant-os의 `payments_outgoing` (restaurant_id 기반) → **점진적 제거 대상**
- 신규 개발은 반드시 `payer_tenant_id` / `payee_tenant_id` / `direction` 사용

---

## [ARCH-06] supplier_contacts — 공급자 주소록

```sql
supplier_contacts          -- 공급자 주소록 (restaurant-os의 suppliers 대체)
  id                uuid PK
  tenant_id         uuid FK → tenants  -- 소유자 (restaurant)
  supplier_tenant_id uuid FK → tenants -- 실제 supplier tenant (연결된 경우)
  name              text NOT NULL
  contact           text
  region            text
  rating            integer  -- 1~5
  is_active         boolean
  memo              text
```

**정의:**
- `supplier_contacts`는 식당이 관리하는 주소록이다
- `supplier_tenant_id`가 있으면 → 실제 supplier-os tenant와 연결된 상태
- `supplier_tenant_id`가 null이면 → 아직 RealMyOS를 사용하지 않는 오프라인 공급자

**기존 구조 전환:**
- restaurant-os의 `suppliers` 테이블 (restaurant_id 기반) → **점진적 제거 대상**
- supplier-os의 `customers` 테이블 → **점진적 제거 대상** (supplier_contacts로 통합)

---

## [ARCH-07] 전체 데이터 흐름

```
[restaurant (tenant)]                    [supplier (tenant)]

1. 식자재 발주
   rfq_requests 생성          →          (rfq 알림 수신)
   rfq_bids 입찰 수신          ←          rfq_bids 입력

2. 주문 확정
   orders.buyer_tenant_id     ↔          orders.seller_tenant_id
   (동일 레코드를 양쪽에서 조회)

3. 결제
   payments.payer_tenant_id   →          payments.payee_tenant_id
   direction = 'outbound'                direction = 'inbound'
   (동일 레코드를 양쪽에서 조회)

4. 가격 추적
   price_history 누적          →          상품 단가 기준 참조
   (restaurant 소유 데이터)
```

---

## [ARCH-08] restaurant 도메인 테이블

```sql
ingredients              -- 식자재 (SKU 식별 지원)
  id                          uuid PK
  tenant_id                   uuid FK → tenants  -- restaurant tenant
  name                        text     -- raw_name (사용자 입력 원본)
  category                    text
  unit                        text
  current_price               integer
  is_active                   boolean
  parsed_name                 text     -- SKU 정식 품목명
  brand                       text
  barcode                     text     -- 1순위 SKU 식별자
  manufacturer                text
  possible_duplicate_group_id uuid
  group_confirmed_same_at     timestamptz
  -- 기존: restaurant_id → 점진적 제거 대상, tenant_id로 전환

fixed_costs
  id          uuid PK
  tenant_id   uuid FK → tenants  -- restaurant tenant
  name        text     -- "월세", "인건비", "전기세"
  amount      integer
  cycle       text     -- 'monthly' | 'weekly'
  -- 기존: restaurant_id → 점진적 제거 대상

rfq_requests             -- 발주요청
  id              uuid PK
  tenant_id       uuid FK → tenants  -- restaurant tenant (소유자)
  ingredient_id   uuid FK → ingredients
  product_name    text
  quantity        integer
  unit            text
  current_price   integer  -- 현재 구매가 (비교 기준)
  target_price    integer
  status          text     -- 'draft'|'open'|'closed'|'ordered'|'cancelled'
  deadline        timestamptz
  -- 기존: restaurant_id → 점진적 제거 대상

rfq_bids                 -- 입찰
  id                  uuid PK
  rfq_id              uuid FK → rfq_requests
  supplier_tenant_id  uuid FK → tenants  -- 입찰한 supplier tenant
  supplier_name       text               -- supplier_tenant_id 없을 때 직접 입력
  price               integer
  delivery_days       integer
  status              text  -- 'submitted'|'accepted'|'rejected'

price_history            -- 가격 히스토리 (append-only, 수정/삭제 금지)
  id              uuid PK
  tenant_id       uuid FK → tenants  -- restaurant tenant
  ingredient_name text
  barcode         text
  price           integer
  source          text  -- 'import'|'rfq_request'|'order'|'manual'
  source_ref_id   uuid
  -- 기존: restaurant_id → 점진적 제거 대상

today_events             -- 행동 유도 측정
  id                      uuid PK
  tenant_id               uuid FK → tenants  -- restaurant tenant
  session_id              text
  event_type              text  -- 'today_enter'|'primary_card_click'|'action_complete'
  decision_type           text  -- 'SWITCH'|'KEEP'|'REVIEW'
  personalization_applied boolean
  personalization_type    text
  -- 기존: restaurant_id → 점진적 제거 대상

ai_decision_logs         -- AI 판단 학습
  id              uuid PK
  tenant_id       uuid FK → tenants
  ai_decision     text  -- 'KEEP'|'SWITCH'
  user_action     text  -- 'KEEP'|'SWITCH'|'CANCEL'
  confidence      real
  -- 기존: restaurant_id → 점진적 제거 대상

savings_stats            -- 누적 절약 통계 (월별)
  id          uuid PK
  tenant_id   uuid FK → tenants
  month       text  -- "2026-04"
  total_saving    integer
  order_count     integer
  UNIQUE(tenant_id, month)
  -- 기존: restaurant_id → 점진적 제거 대상

notifications
  id          uuid PK
  tenant_id   uuid FK → tenants
  type        text
  priority    text  -- 'urgent'|'important'|'normal'
  title       text
  message     text
  is_read     boolean
  -- 기존: restaurant_id → 점진적 제거 대상
```

---

## [ARCH-09] supplier 도메인 테이블

```sql
products
  id                  uuid PK
  tenant_id           uuid FK → tenants  -- supplier tenant
  product_code        text
  name                text
  tax_type            text     -- 'taxable' | 'exempt'
  procurement_type    text
  fulfillment_type    text     -- 'stock' | 'consignment'
  current_cost_price  integer
  -- TODO: 전체 컬럼 확인 필요

collection_schedules     -- 수금 일정 (이력 구조, append-only)
  id            uuid PK
  tenant_id     uuid FK → tenants  -- supplier tenant
  -- 알려진 동작: cancel→insert 순서 강제
  -- 알려진 동작: unique pending index
  -- 알려진 동작: balanceAfter 조건 처리
  -- TODO: 전체 컬럼 확인 필요

action_logs              -- CRM 액션 이력
  id                  uuid PK
  tenant_id           uuid FK → tenants
  -- buyer_tenant_id 또는 customer 참조 → TODO: 확인 필요
  message_key         text
  conversion_status   text  -- 'unknown'|'attempt'|'success'|'fail'
  -- TODO: 전체 컬럼 확인 필요

contact_logs
  id          uuid PK
  tenant_id   uuid FK → tenants
  -- TODO: 전체 컬럼 확인 필요

quotes
  id          uuid PK
  tenant_id   uuid FK → tenants
  -- TODO: 전체 컬럼 확인 필요

funds
  id          uuid PK
  tenant_id   uuid FK → tenants
  -- TODO: 전체 컬럼 확인 필요

message_templates
  id          uuid PK
  tenant_id   uuid FK → tenants
  -- TODO: 전체 컬럼 확인 필요
```

---

## [ARCH-10] restaurant_id / supplier_id 사용 정책

| 상태 | 정책 |
|------|------|
| 신규 테이블 | `restaurant_id`, `supplier_id` 사용 **금지** |
| 신규 컬럼 | `restaurant_id`, `supplier_id` 사용 **금지** |
| 기존 테이블의 `restaurant_id` | **점진적 제거 대상** — `tenant_id`로 전환 |
| 기존 테이블의 `supplier_id` | **점진적 제거 대상** — `supplier_tenant_id`로 전환 |
| 전환 전까지 | 기존 컬럼 유지하되, 신규 쿼리는 `tenant_id` 우선 사용 |

---

## [ARCH-11] RLS 정책 기준

```sql
-- 표준 RLS 패턴 (모든 신규 테이블에 적용)
CREATE POLICY "tenant_isolation" ON {table}
  FOR ALL USING (
    tenant_id IN (
      SELECT id FROM tenants
      WHERE id = (
        SELECT tenant_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- orders 예외 패턴 (buyer / seller 양쪽 접근 허용)
CREATE POLICY "order_access" ON orders
  FOR ALL USING (
    buyer_tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
    OR
    seller_tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );
```

**현재 상태:**
- supplier-os: `tenant_id` 기반 RLS 적용됨
- restaurant-os: `auth.role() = 'authenticated'` 전체 허용 → **구조 전환 중**

---

## [ARCH-12] 앱별 액션 파일 현황

### supplier-os (`C:\Users\babok\Desktop\realmyos\src\actions\`)
| 파일 | 역할 |
|------|------|
| `order.ts`, `order-query.ts` | 주문 생성 · 조회 (seller 관점) |
| `customer.ts`, `customer-query.ts` | 거래처 CRM → 구조 전환 중 |
| `collection.ts` | 수금 일정 · 실행 |
| `payment.ts` | 입금 처리 → payments 단일화 전환 중 |
| `product.ts` | 상품 관리 |
| `sales.ts`, `ledger.ts` | 매출 집계 · 원장 |
| `quote.ts` | 견적서 |
| `dashboard.ts` | 지표 요약 |
| `action-log.ts`, `contact.ts` | CRM 액션 · 연락 이력 |
| `fund.ts` | 자금 현황 |
| `settings.ts` | 테넌트 설정 |

### restaurant-os (`C:\Users\babok\Desktop\resturant_os\src\actions\`)
| 파일 | 역할 |
|------|------|
| `today.ts`, `today-events.ts` | 당일 할 일 · 행동 유도 |
| `rfq.ts` | 발주 · 입찰 비교 |
| `suppliers.ts` | 공급자 주소록 → supplier_contacts 전환 중 |
| `money.ts` | 지급 예정 → payments 단일화 전환 중 |
| `import.ts` | 명세서 OCR 파싱 (현재 mock) |
| `ai-logs.ts` | AI 판단 결과 기록 |
| `settings.ts` | 식당 정보 · 식자재 · 고정비 |

---

## [ARCH-13] 구현 상태

### 완료
- [x] supplier-os 전체 기능 (주문·수금·결제·CRM·매출·상품·견적·자금·대시보드)
- [x] restaurant-os 전체 기능 (Today·RFQ·식자재·AI판단·가격추적·고정비·지급관리)
- [x] 단일 DB 통합 방향 확정
- [x] orders / payments 단일화 구조 확정

### 구조 전환 중
- [ ] orders → buyer_tenant_id / seller_tenant_id 구조 마이그레이션
- [ ] payments → payer/payee/direction 구조 마이그레이션
- [ ] restaurant-os 기존 테이블 restaurant_id → tenant_id 전환
- [ ] suppliers → supplier_contacts 통합
- [ ] customers → supplier_contacts 통합
- [ ] restaurant-os RLS → tenant_id 기반으로 강화

### 미완료
- [ ] supplier-os schema.sql 전체 확인
- [ ] 수금 현황 대시보드
- [ ] 수금 알림 · 분석
- [ ] 실제 OCR 연동 (현재 mock)

---

## [ARCH-14] 미해결 TODO

| # | 항목 | 우선순위 |
|---|------|---------|
| 1 | supplier-os schema.sql 전체 확인 | 높음 |
| 2 | orders 마이그레이션 실행 시점 결정 | 높음 |
| 3 | payments 마이그레이션 실행 시점 결정 | 높음 |
| 4 | collection_schedules 전체 컬럼 | 중간 |
| 5 | action_logs buyer 참조 컬럼 확인 | 중간 |
| 6 | rfq_bids supplier_tenant_id 전환 시점 | 중간 |
| 7 | restaurant-os RLS 강화 | 중간 |
| 8 | contact_logs · quotes · funds 전체 컬럼 | 낮음 |
