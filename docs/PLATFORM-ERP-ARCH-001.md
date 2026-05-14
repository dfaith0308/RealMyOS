# PLATFORM-ERP-ARCH-001 — 관리자OS「디닷페이스 ERP」capability 포렌식

> **목적**: 문서 방향(디닷페이스 = 플랫폼 주문·결제·고객 owner, 공급자 = fulfillment) 대비, **현행 코드·마이그레이션·기존 포렌식 문서**만으로 관리자OS가 ERP 축을 **어디까지 수행하는지**와 **storefront(`commerce_orders`) → ERP 자동 반영** 여부를 판정한다.  
> **금지**: 본 문서는 구현 제안이 아니며, **추정·의도** 서술을 하지 않는다.

---

## 조사 범위 (저장소·경로)

| 구분 | 경로 |
|------|------|
| 관리자 앱 | `realmyos/src/app/(admin)/` |
| 관리자 서버 액션 | `realmyos/src/actions/admin/*.ts`, `realmyos/src/actions/admin.ts` |
| 공급자·식당 공통 원장·주문 | `realmyos/src/actions/ledger.ts`, `realmyos/src/lib/ledger-calc.ts` |
| storefront 주문 생성 | `resturant_os/src/actions/buy.ts` (`createCommerceOrder`) |
| 커머스 DDL(증분) | `realmyos/supabase/migrations/20260509010000_create_commerce_tables.sql`, `20260509020000_add_commerce_orders_columns.sql`, `20260514200000_commerce_orders_idempotency.sql` |
| 결제·주문 관계(기존 포렌식) | `docs/PAYMENT-FORENSIC-001.md` |
| RFQ `orders`·수금 | `docs/ORDER-FORENSIC-001.md` (본 문서는 중복 서술 최소화) |

**참고**: `realmyos/supabase/migrations/` 내 `grep` 기준 **`CREATE TABLE public.payments`** DDL 파일은 **없음**. `payments`·`orders`는 코드·RPC·ALTER migration에서 **참조만** 확인됨.

---

## SECTION 1 — 현재 ERP capability 현황표

판정어: **구현됨** / **부분 구현** / **UI만** / **없음** (관리자OS·관련 액션 기준).

| 축 | 판정 | 근거 (파일·테이블·함수) |
|----|------|-------------------------|
| **플랫폼 매출 (storefront `commerce_orders` 기반)** | **없음** (관리자 집계) | `getPlatformRevenue` 등은 **`orders`** 만 조회 (`src/actions/admin/settlement-control.ts` L196–220). `commerce_orders` 문자열 **0건**. |
| **플랫폼 매출 (RFQ `orders` 기반, 기간별)** | **부분 구현** | `getPlatformRevenue`: `orders` 중 `status='confirmed'`, `order_date` 월 범위, GMV 합산 + `admin_settings`의 `platform_fee_rate`로 월 수수료액 계산 (`settlement-control.ts` L185–261). |
| **플랫폼 매출 원장(전용 테이블)** | **없음** | 증분 migration에 **`platform_revenue`/`ledger` 전용 테이블** 없음. 매출은 **`orders`·`payments` 집계 로직**에 의존. |
| **플랫폼 receivable — 식당별 집계 (공급자 `customers` + `orders`)** | **부분 구현** | `getCustomerLedger` (`src/actions/ledger.ts` L129–158): `orders` + `payments` inbound confirmed. **관리자 전용 receivable 화면은 본 조사 범위 외**이나, 원장 계산은 **공급자 테넌트 컨텍스트**의 `orders`/`payments`. |
| **플랫폼 receivable — `commerce_orders` 기반** | **없음** | `ledger.ts`에 `commerce_orders` 참조 없음. `commerce_orders` 스키마에 **`customer_id` 컬럼 없음** (`20260509010000_create_commerce_tables.sql` L59–80, 추가 migration 동일). |
| **`commerce_orders.payment_status` ↔ receivable 자동 연결** | **없음** | `updateCommerceOrderStatus` (`src/actions/admin/commerce.ts` L2203–2293): `commerce_orders` 업데이트 + `admin_logs`만. **`payments` insert/update 없음**. |
| **공급자 payable (지급예정) 전용 테이블** | **없음** | `grep payable` / `CREATE TABLE.*payable` on `supabase/migrations` → **0건**. |
| **공급 allocation (storefront → 공급자 DB 기록)** | **없음** | `payment_allocations`·`collection_allocations`는 **`payments`·`purchase_id` / `order_id`** 축 (`20260507040000_create_payment_allocations.sql`, `20260507090000_create_collection_allocations.sql`). **`commerce_orders` FK·트리거 없음**. 공급자 전달은 **CSV export 유틸** 수준: `getCommerceOrderSupplierExportRows` (`commerce.ts` L1975+), `commerce-order-supplier-export.ts`. |
| **PG / TossPayments** | **없음** (연동) | `realmyos/package.json`·`resturant_os/package.json`에 **`@tosspayments/*` 없음**. 상세: `docs/PAYMENT-FORENSIC-001.md` §3. |
| **`commerce_orders` 결제 상태 수명** | **부분 구현** | 컬럼: `status`, `payment_status` (`20260509010000_create_commerce_tables.sql`). 관리자 전이: `updateCommerceOrderStatus` + UI `OrdersClient.tsx`. **PG 콜백·자동 `paid` 없음** (`PAYMENT-FORENSIC-001.md` §2·§5). |
| **무통장 입금 확인 (storefront)** | **부분 구현** | 관리자: `updateCommerceOrderStatus`로 `pending_payment` → `paid` 시 `payment_status='paid'` 패치 (`commerce.ts` L2250–2251). 계좌 문구: `getStorefrontBankTransferSettingsAdmin` / `updateStorefrontBankTransferSettings` (`storefront-bank-transfer.ts`), 페이지 `admin/commerce/storefront-bank/page.tsx`. |
| **`payments` ↔ `commerce_orders` 연결** | **없음** (코드 경로) | `createCommerceOrder` (`resturant_os/src/actions/buy.ts` L704–720): `commerce_orders`·`commerce_order_items` insert만. **`payments` 없음**. `settlement-control.ts`: **`commerce_orders` 문자열 없음**; `processSettlement`는 **`orders`** 만 조회 (L723–727). |
| **플랫폼 고객 원장 (storefront 식당)** | **없음** | 관리자OS에 **식당 테넌트용 플랫폼 원장 페이지 없음** (조사한 `(admin)` 트리 기준). `commerce_orders.tenant_id`는 **식당 테넌트** 의미로 쓰임 (`buy.ts` L707 `tenant_id: ctx.tenant_id`). |
| **공급자 정산 (플랫폼 ↔ 공급자)** | **부분 구현** (RFQ `orders` 축) | `processSettlement`: `orders` 확정 건에 대해 `payments` **`type='settlement'`** insert (`settlement-control.ts` L713–770). **`commerce_orders` 대상 아님**. |
| **settlement cycle** | **부분 구현** | `settlement_cycle_days`를 `admin_settings`에서 로드 (`loadSettlementCycleDays` L67–76; 시드는 `policy-console.ts` 등과 연동). KPI/경고에 사용 (`getPendingSettlements` 등). |
| **플랫폼 수수료율 저장** | **구현됨** | `admin_settings.key = 'platform_fee_rate'` (`settlement-control.ts` L55–64, `policy-console.ts` 내 키 목록). |
| **플랫폼 수수료 계산 (주문별)** | **부분 구현** | `processSettlement` 시 주문 금액 × fee% → `payments.amount` (`settlement-control.ts` L745–747). 대상은 **`orders` id**. |
| **storefront 주문 전용 수수료 원장** | **없음** | `commerce_orders`와 연동된 fee ledger 테이블/액션 **없음**. |

---

## SECTION 2 — storefront → ERP 자동 반영 현황

**판정: 전부 수동 (플랫폼 ERP 원장·`payments`·정산 파이프라인 관점)**

| 트리거 | 자동 생성 여부 | 근거 |
|--------|----------------|------|
| `commerce_orders` 생성 시 receivable (`payments`/원장) | **없음** | `createCommerceOrder` (`resturant_os/src/actions/buy.ts` L613–796): `commerce_orders` + `commerce_order_items` + `cart_items` delete만. |
| payable | **없음** | 동 플로우 및 `realmyos` 관리자 `commerce.ts` 주문 구간에 **해당 insert 없음**. |
| platform revenue 반영 (`orders` 외 별도 원장) | **없음** | 별도 테이블/액션 없음. |
| ERP ledger (`getCustomerLedger` 등) | **없음** | `ledger.ts`는 **`orders`/`payments`** 만 사용. |
| settlement 예정 (`payments.type='settlement'`) | **없음** | `processSettlement`의 선행 조건은 **`orders`** row (`settlement-control.ts` L723–730). |
| `admin_logs` (ERP 외 감사) | **부분 자동** | 주문 생성 자체는 **식당 앱**에서 수행 → 관리자 `admin_logs` **자동 기록 없음**. 관리자가 상태 바꿀 때만 `commerce_order_status_changed` (`commerce.ts` L2276–2289). |

---

## SECTION 3 — 관리자OS vs 공급자OS 원장 분리 현황

| 질문 | 판정 | 근거 |
|------|------|------|
| `commerce_orders` 원장 vs `orders` 원장 분리 | **분리됨 (코드 경로 상 완전 단절)** | 원장: `getCustomerLedger` → **`orders` + `payments`** (`ledger.ts` L129–158). storefront 주문: **`commerce_orders`만** (`admin/commerce.ts`, `buy.ts`). **교차 조회 없음**. |
| 동일 `payments` 물리 테이블 | **동일 테이블** | RFQ·정산·수금 로직이 모두 `payments` 참조 (`settlement-control.ts`, `accept_bid` migration L126–146 등). |
| 논리적 구분 | **`order_id`가 가리키는 엔티티가 문서/코드상 혼재 위험** | `processSettlement`·`getUnifiedSettlementView`는 **`orders.id`** 전제. `commerce_orders.id`는 **동일 UUID 공간**이나 **별 테이블** — 현재 정산 코드는 **`commerce_orders`를 읽지 않음**. |
| 관리자OS에서 「디닷페이스 storefront 매출」만 별도 조회 | **부분 UI만** | `/admin/commerce/orders` (`page.tsx`) + `getCommerceOrders` (`commerce.ts`): **목록·필터·상태 변경·export**. **매출 KPI 전용 위젯은 해당 페이지에 한정**; `/admin/settlements` KPI는 **`orders`** 기반 (`settlements/page.tsx` import `getPlatformRevenue`). |
| storefront 고객 vs 공급자OS 고객 ownership | **스키마상 분리, 연결 없음** | `commerce_orders`: 식당 **`tenant_id`** + 배송 필드만 (`create_commerce_tables.sql`). `customers` / `orders.customer_id`와의 **FK 없음**. 공급자 원장은 **`customer_id` + `orders`** (`ledger.ts`). |

---

## SECTION 4 — 플랫폼 ERP 진화 가능성 평가 (사실 기반만)

| 항목 | 평가 |
|------|------|
| **`commerce_orders`를 플랫폼 원장의 사실 테이블로 쓸 수 있는지** | **스키마 상 행·금액·상태 컬럼 존재** (`commerce_orders`, `commerce_order_items`). **현행 관리자 정산·원장 액션은 미사용**. |
| **`payments`를 storefront 결제까지 확장 가능한지** | **컬럼 수준으로는 기존 RPC·액션이 `order_id`를 `orders`에 묶어 사용** (`processSettlement`, `collection_allocations.order_id`). **`commerce_orders`와의 연결은 코드·FK 모두 미확인(미구현)**. |
| **`admin_logs`를 ERP audit trail로 충분한지** | **부분**: 관리자 액션 다수가 `admin_logs`에 기록 (`settlement-control`, `commerce`, `policy-console` 등). **storefront 주문 생성·PG 이벤트는 관리자 로그에 자동 남지 않음**. |
| **tenant 구조 + 플랫폼 ledger 추가** | **마이그레이션 파일만으로는 결론 불가**(신규 테이블 없음). 기존 패턴은 **`tenant_id`별 RLS + `payments`/`orders`**. |

---

## SECTION 5 — 현재 구조에서 즉시 활용 가능한 것

1. **storefront 주문 운영 콘솔**: `/admin/commerce/orders` — `getCommerceOrders`, 필터, `OrdersClient` → `updateCommerceOrderStatus` (`commerce.ts`, `OrdersClient.tsx`).
2. **RFQ·공급자 축 정산·현금흐름 뷰**: `/admin/settlements` — `getPlatformRevenue`, `getPendingSettlements`, `getUnifiedSettlementView`, `processSettlement`, `SettleOrderButton.tsx` (`settlement-control.ts`; 데이터 소스 **`orders`/`payments`**).
3. **수수료율·정산 주기 설정**: `admin_settings` (`platform_fee_rate`, `settlement_cycle_days`) — `settlement-control.ts`, `policy-console.ts`.
4. **무통장 계좌 설정(식당 체크아웃 노출)**: `storefront-bank-transfer.ts`, `/admin/commerce/storefront-bank`.
5. **공급자 수동 전달용 데이터 추출**: `getCommerceOrderSupplierExportRows` + CSV 유틸 (`commerce-order-supplier-export.ts`) — **DB allocation 아님**.

---

## SECTION 6 — 반드시 새로 만들어야 하는 것 (우선순위 — 갭 식별, 구현 지시 아님)

| 우선순위 | 갭 | 이유(현재 상태) |
|----------|-----|------------------|
| **P0** | **`commerce_orders` ↔ `payments`(또는 동등 원장) 단일 연결 규칙** | 주문 생성 시 `payments` 없음; 정산은 `orders`만. |
| **P0** | **`/admin/settlements` 등 KPI가 플랫폼 주문을 포함하도록 데이터 소스 정의** | 현재 `orders`만 집계. |
| **P1** | **플랫폼 미수(receivable) 정의에 `commerce_orders.payment_status`·입금 확인 반영** | 입금 확인은 주문 row만 갱신; 원장 함수와 무연결. |
| **P1** | **공급 allocation 영속 테이블·조회 (문서상 allocation vs export 분리)** | export만 존재. |
| **P2** | **PG(Toss) 승인·webhook·`payments` 연동** | `PAYMENT-FORENSIC-001` §3 판정 LEVEL 0. |

---

## SECTION 7 — 구조 충돌 위험 TOP 5 (코드·스키마 기준)

1. **`payments.order_id` 의미 혼동**: 동일 UUID가 **`orders.id`와 `commerce_orders.id`에 각각 존재 가능** — 현재 정산은 **`orders`만 검증**하여 잘못된 insert 위험은 코드가 `orders`에서 먼저 조회하므로 **교차 삽입은 차단**되나, **운영·보고에서 “주문” 동일어 사용 시 혼선** 위험.
2. **매출 이중 계산**: storefront 매출을 수동으로 `orders`에 옮기면 **중복**; 옮기지 않으면 **정산 KPI 누락**.
3. **receivable 소유 주체**: `ledger`는 **공급자 테넌트·`customers`** 전제; **플랫폼 owner 관점 미수**는 **별 계산 축 없음**.
4. **settlement 수수료 로직과 storefront 주문 분리**: `processSettlement`는 **공급자 `seller_tenant_id`** 로 `payments.tenant_id` 설정 (`settlement-control.ts` L742–752) — **플랫폼 commerce 매출과 동일 모델인지 문서만으로는 코드 미반영**.
5. **`admin_logs` 공백**: storefront 주문 **생성·재시도**는 관리자 감사로그에 **자동 남지 않음**.

---

## SECTION 8 —「디닷페이스 ERP」구현 난이도 (현 구조 기준)

**HIGH**

- **이유 (관찰만)**: (1) **이중 주문 헤더**(`orders` vs `commerce_orders`)가 이미 존재하고, (2) **정산·성장·원장 핵심 쿼리가 `orders`/`payments`에 고정**되어 있으며, (3) **storefront 주문은 동일 파이프라인에 연결되지 않음** (SECTION 1–2). (4) PG·입금 자동화 **부재** (`PAYMENT-FORENSIC-001`).

---

## 부록 — 주요 액션·페이지 인덱스 (검색용)

| 역할 | 파일 |
|------|------|
| 정산·플랫폼 GMV(KPI) | `src/actions/admin/settlement-control.ts` — `getPlatformRevenue`, `getPendingSettlements`, `getUnifiedSettlementView`, `processSettlement`, `getSettlementHistory`, `getAutoSettlementSuggestions`, `getCreditLines` |
| 커머스 주문 | `src/actions/admin/commerce.ts` — `getCommerceOrders`, `updateCommerceOrderStatus`, `getCommerceOrderSupplierExportRows` |
| storefront 무통장 설정 | `src/actions/admin/storefront-bank-transfer.ts` |
| 공급자 원장 | `src/actions/ledger.ts` — `getCustomerLedger` |
| 대시보드(테넌트·로그) | `src/actions/admin.ts` — `getAdminDashboard` |
| 성장 지표(주문 데이터) | `src/actions/admin/growth-engine.ts` — `.from('orders')` 다수 |
| 주문 생성 | `resturant_os/src/actions/buy.ts` — `createCommerceOrder` |

---

## 관련 tasks ID

- **`[PLATFORM-ERP-001]`** — 설계 Epic (본 포렌식은 **현행 갭 확정** 자료).
- **`docs/PAYMENT-FORENSIC-001.md`**, **`docs/ORDER-FORENSIC-001.md`** — 교차 참조.

**migration (본 포렌식 턴)**: 파일 추가·실행 **없음**.
