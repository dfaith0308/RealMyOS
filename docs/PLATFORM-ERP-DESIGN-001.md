# PLATFORM-ERP-DESIGN-001 — `commerce_orders` 최소 ERP 연결 설계

> **목적**: `commerce_orders`(storefront)를 기존 ERP 축(`payments`·`orders`·`getCustomerLedger`·`settlement-control`)에 **최소 위험**으로 편입하기 위한 **설계 확정안**이다.  
> **범위**: 본 문서는 **설계만** 포함한다. **코드·migration·DB 변경은 하지 않는다.**  
> **근거**: 아래에 인용하는 **실제 파일·테이블·함수·migration**만 사용한다. **추정 문장은 쓰지 않는다.**  
> **선행 포렌식**: `docs/PLATFORM-ERP-ARCH-001.md`, `docs/PAYMENT-FORENSIC-001.md`.

---

## 현행 구조 사실 (설계 전제)

| 주제 | 사실 |
|------|------|
| storefront 주문 생성 | `resturant_os/src/actions/buy.ts` — `createCommerceOrder` 가 `commerce_orders`·`commerce_order_items` insert (`L704–752`). **`payments` insert 없음.** |
| 관리자 주문 상태 | `realmyos/src/actions/admin/commerce.ts` — `updateCommerceOrderStatus` 가 `commerce_orders` update + `admin_logs` (`commerce_order_status_changed`) (`L2203–2293`). **`payments` 없음.** |
| 정산·GMV | `realmyos/src/actions/admin/settlement-control.ts` — `getPlatformRevenue`·`getPendingSettlements`·`getUnifiedSettlementView`·`processSettlement` 가 **`orders`** + **`payments`** 만 사용. **`commerce_orders` 문자열 없음.** |
| 공급자 원장 | `realmyos/src/actions/ledger.ts` — `getCustomerLedger` 가 **`orders`** + **`payments`** (`direction='inbound'`, `status='confirmed'`) (`L129–158`). |
| `commerce_orders` 스키마 | `supabase/migrations/20260509010000_create_commerce_tables.sql` — `tenant_id`, `status`, `payment_method`, `payment_status`(`unpaid`|`paid`|`refunded` CHECK), `total_amount` 등. **`customer_id` 컬럼 없음.** |
| `payments.status` (증분 DDL) | `supabase/migrations/20260506160000_payments_status_add_pending.sql` — CHECK **`pending` \| `confirmed` \| `reversed`**. |
| RFQ `payments` insert | `supabase/migrations/20260506150000_create_accept_bid_atomic.sql` — `INSERT INTO public.payments` 컬럼: `payer_tenant_id`, `tenant_id`, `order_id`, `counterparty_name`, `amount`, `due_date`, `payment_method`, `status`, `direction` (`L126–136`). |
| `payments.type` | **저장소 증분 migration grep 기준** `ALTER TABLE public.payments … type` DDL은 **미검색**. 다만 `settlement-control.ts`·`trade-monitor.ts`가 **`.eq('type', 'settlement')`** 로 조회·삽입 (`settlement-control.ts` `L214–215`, `L751–767`). |
| 플랫폼 상수(로그) | `realmyos/src/actions/admin/storefront-bank-transfer.ts` — `PLATFORM_OWNER_TENANT = '00000000-0000-0000-0000-000000000000'` (`L15`) — **`admin_logs.admin_tenant_id` 용도로만** 사용 (`L37–46`). |

---

## SECTION 1 — `payments` 사용 범위 결정 (옵션 A/B 비교 + 권장안)

### 옵션 A — 단일 `public.payments` SSOT에 storefront까지 포함

| 항목 | 내용 |
|------|------|
| 장점 | `getSettlementHistory`·`getUnifiedSettlementView` 등 **이미 `payments`를 전제로 한 관리자 UI·액션**(`settlement-control.ts`)과 **동일 테이블**으로 수금·정산 이력을 남길 수 있음. `customer_deposits` 등 **`payments.id` FK** 패턴(`supabase/migrations/20260507150000_create_customer_deposits.sql` `L55–57`)과 정합. |
| 단점 | `processSettlement`가 **`orders` 테이블에서만** 주문 존재를 검증함 (`settlement-control.ts` `L723–730`). `commerce_orders.id`를 **기존 `order_id` 컬럼에만** 넣어 재사용하면 **검증 실패 또는 잘못된 조인**이 구조적으로 발생함. |
| 기존 ERP 충돌 | **`order_id` UUID 공간**: `orders.id`와 `commerce_orders.id`는 **별 테이블**이나 동일 UUID 타입 — 코드가 **`orders`만 조회**하므로 **의미 충돌(논리 혼선)** 위험이 큼 (`PLATFORM-ERP-ARCH-001.md` SECTION 7). |
| ownership 적합 | `payments` 행은 `tenant_id`·`payer_tenant_id`·`payee_tenant_id`·`customer_id` 등 **다수 테넌트/거래처 필드**를 이미 사용 (`accept_bid` insert, `processSettlement` payload `L751–767`). 플랫폼 수취 시 **어느 컬럼에 “디닷페이스”를 넣을지**는 **현행 storefront 경로에 아직 매핑 없음** — 별 설계 필요. |
| 구현 난이도 | **스키마(증분)·액션 분기·정산 쿼리** 수정이 **필수**. |
| settlement 확장성 | 동일 `payments`·`type` 필터 패턴을 **유지한 채** storefront row를 **식별 가능하게** 넣으면 **기존 화면 확장**이 가능함. |

### 옵션 B — `commerce_orders` 전용 `platform_payments`(가칭) 분리

| 항목 | 내용 |
|------|------|
| 장점 | RFQ `orders`/`payments` 경로에 **직접 insert·FK 충돌 없음**. |
| 단점 | **신규 테이블** — 본 저장소 증분 migration에 **해당 `CREATE TABLE` 없음**(현재 없음). `getSettlementHistory` 등 **전부 `payments`만 조회**하므로 **관리자 정산 UI에 자동 반영되지 않음** (`settlement-control.ts` `L369–374`). 이중 조회·이중 기록 구조가 됨. |
| 기존 ERP 충돌 | **낮음**(분리) 대신 **운영·리포트 이중화** 위험. |
| ownership 적합 | 플랫폼 전용으로 모델링하기 쉬우나 **기존 `payments` SSOT와 분리**됨. |
| 구현 난이도 | 테이블·RLS·관리자 페이지·집계 **신규 구현 면적 큼**. |
| settlement 확장성 | `payments`와의 **merge 뷰 또는 ETL** 없으면 **기존 settlement KPI와 단절**됨. |

### 권장안 (1개)

**옵션 A — 단일 `public.payments` 유지**를 권장한다.

**이유 (코드 근거만):**

1. **정산·수금 이력·수수료 정산**이 이미 `payments`에 **`type='settlement'`** 등으로 쌓이는 구조다 (`settlement-control.ts` `L214–215`, `L751–767`; `trade-monitor.ts` `L371`).  
2. `payment_allocations`·`collection_allocations`는 **`payments.id`** FK다 (`20260507040000_create_payment_allocations.sql` `L3–5`, `20260507090000_create_collection_allocations.sql` `L3–5`). 별도 `platform_payments`는 이 체인과 **즉시 결합되지 않는다**.  
3. 옵션 A의 **전제 조건**: `order_id`에 `commerce_orders.id`를 **그대로 넣지 말 것**. 반드시 **`orders` 조회를 전제로 한 로직**(`processSettlement` `L723–730`)과 **분리 식별**이 필요하다 — 아래 SECTION 8.

---

## SECTION 2 — receivable ownership 기준 확정

**확정안 (문서 방향 + 금전 권리 관점):** **platform receivable (디닷페이스가 수취 권리 주체)**.

**근거 (현행 코드·스키마와의 정렬):**

- storefront 주문의 **채권은 공급자 `customers` + `orders` 원장에 자동으로 들어가지 않음** — `getCustomerLedger`는 `commerce_orders`를 읽지 않음 (`ledger.ts` `L129–158`; `PLATFORM-ERP-ARCH-001.md` SECTION 1).  
- `commerce_orders.tenant_id`는 **식당 테넌트**로 insert 됨 (`buy.ts` `L707`). 이는 **“구매자 테넌트” 식별자**로 존재하나, **채권의 법적·운영 owner가 식당 자체인지**는 본 저장소 코드만으로는 정의되지 않음 — **제품 방향(디닷페이스 owner)** 과 합치하려면 **수취 주체를 플랫폼 테넌트로 두는 `payments` 행**이 필요함.  
- **공급자 receivable로 분류하지 않음** — 공급자는 fulfillment provider이며, **storefront receivable owner가 아님**(사용자 전제).

**식당 tenant receivable / supplier receivable** 로는 **현행 storefront 경로를 표현하지 않는다** (위 분리 사실).

---

## SECTION 3 — storefront customer ownership 정리

**확정안:** **플랫폼 customer(거래 관계는 디닷페이스 ↔ 식당)** — 즉 **공급자 `customers` 레코드와 동일 개념이 아님**.

**`customers` 테이블과의 연결 평가 (사실):**

- 증분 migration에서 확인되는 `customers` 컬럼: `payment_terms`, `role`(`buyer`|`supplier`|`both`), `contact_status` 등 (`20260507130000_add_customer_fields.sql` `L3–10`).  
- `commerce_orders`에는 **`customer_id` 없음** (`20260509010000_create_commerce_tables.sql` `L59–80`).  
- 따라서 **현재 스키마만으로는 `customers.id` ↔ `commerce_orders` 직접 FK 없음**. 연결하려면 **후속 migration·데이터 모델**이 필요함(SECTION 7).

---

## SECTION 4 — `payment_status` ↔ `payments` 동기화 설계

### 두 레이어의 상태값 (사실)

| 위치 | 허용값 (DDL/코드) |
|------|-------------------|
| `commerce_orders.payment_status` | `unpaid` \| `paid` \| `refunded` (CHECK, `20260509010000_create_commerce_tables.sql` `L72–73`) |
| `commerce_orders.status` | `pending_payment` … `refunded` (주문 라이프사이클, 동 파일 `L65–68`) |
| `payments.status` | `pending` \| `confirmed` \| `reversed` (`20260506160000_payments_status_add_pending.sql` `L8–9`) |

→ **동일 이름이 아니며 1:1 동일 enum이 아님.** “동기화”는 **매핑 규칙**으로 정의해야 함.

### `payments` 행이 생기는 시점 (설계 확정)

**최소 위험 1단계 권장:** **`commerce_orders.status`가 `pending_payment` → `paid`로 바뀔 때**(즉 **실입금/승인 확정 시점**)에 **`payments` inbound `confirmed` 1건**을 두는 것.

**근거:** 현재 입금 확인은 **관리자** `updateCommerceOrderStatus` 경로에서 `payment_status='paid'`로 패치됨 (`commerce.ts` `L2250–2251`). **주문 생성 시점**(`createCommerceOrder`)에는 `payments`가 없음 (`buy.ts` `L704–720` — `PAYMENT-FORENSIC-001.md` §5와 동일).

**주문 생성 시 `payments` 자동 생성**은 본 설계의 **최소 연결 범위에 포함하지 않음** (SECTION 6) — 기존 RFQ도 `accept_bid` 시 `planned/outbound`가 생기는 패턴(`20260506150000_create_accept_bid_atomic.sql` `L123–146`)과 **성격이 다름**.

### 누가 생성하는가 (설계 확정)

**권장:** **`realmyos` Server Action**(예: `updateCommerceOrderStatus`와 **같은 트랜잭션 경계를 공유할 수 있는 호출부**) 또는 **기존과 동일한 RPC 패턴**(`create_payment_atomic` — `payment.ts` `L67–77`).

- **DB trigger만 단독**으로 두는 경우: 앱의 `admin_logs`·`revalidatePath`와 **동일 행위 추적**이 분리될 수 있음 — 본 저장소는 **액션/RPC 패턴이 이미 존재**함.  
- **Queue worker**: 본 저장소 **storefront 주문 경로에 worker 코드가 없음** — 본 설계 **1단계 범위에 포함하지 않음**.

### PG webhook 시점

현재 **Toss PG 연동 없음** (`docs/PAYMENT-FORENSIC-001.md` §3; `realmyos/package.json`·`resturant_os/package.json`에 `@tosspayments/*` 없음). **webhook 시점 설계는 SECTION 6 “나중”**.

### `payment_status` lifecycle 확장 필요 여부

- `commerce_orders.payment_status` CHECK는 **현재 세 값만** (`20260509010000_create_commerce_tables.sql`).  
- `payments.status`는 **`pending`/`confirmed`/`reversed`** (`20260506160000_payments_status_add_pending.sql`).  
- **PG 도입 시** `pending`·`failed` 등이 필요하면 **CHECK migration + 앱 전이**가 필요 — **본 최소 설계 단계에서는 필수 아님** (PG 없음 사실).

---

## SECTION 5 — ERP SSOT 결정

**확정안:** **금액·수금·정산의 SSOT는 `public.payments`** (기존 코드 전제).

**이유:**

- `getUnifiedSettlementView`·`getSettlementHistory`·`processSettlement`가 **`payments`를 직접 읽고 쓴다** (`settlement-control.ts`).  
- `getCustomerLedger`의 잔액 구성은 **`orders` 확정 매출 + `payments` inbound confirmed`** (`ledger.ts` `L129–158`; `ledger-calc.ts` 미수 정의 `L57–66`).  
- **원장 이벤트 전용 테이블**은 증분 migration grep 범위에서 **미도입**.  
- `commerce_orders`는 **주문 헤더·배송·결제방법·상태** SSOT로 유지 — **현금 흐름 SSOT로 승격하지 않음**(아직 `payments` 미연결).

---

## SECTION 6 — 최소 연결 구현 범위 (지금 / 나중)

| 구분 | 범위 | 우선순위 |
|------|------|----------|
| **지금 연결 (설계상 1단계)** | (1) **`paid` 전환 시점**에 `payments` inbound **`confirmed`** 1건 생성 규칙 (SECTION 4). (2) **`commerce_orders`와의 불모호한 링크** — SECTION 8의 XOR/`commerce_order_id` 전략. (3) **플랫폼 수취 주체**를 `payments`의 `tenant_id`/`payee_tenant_id` 등 **기존 컬럼 조합**으로 표현(값은 운영 합의 — 코드 상 `PLATFORM_OWNER_TENANT`는 **admin_logs용**임, `storefront-bank-transfer.ts` `L15`). | **P0** |
| **나중** | supplier **payable** 자동, **allocation** 테이블, **settlement 자동화**, **PG reconciliation**, `getPlatformRevenue`에 **`commerce_orders` 매출 합산**, `processSettlement`의 **`orders` 전제** 일반화 | **P1–P3** |

---

## SECTION 7 — migration 필요 목록 (실행 금지 — 설계만)

> **실행하지 않음.** 파일명은 **예시**이며 저장소에 **아직 없음**.

1. **`payments`에 `commerce_order_id uuid` (nullable) + `REFERENCES public.commerce_orders(id)`** 및 **`order_id`와의 상호 배타 CHECK** (둘 중 하나만 non-null 등) — **옵션 A의 방어 핵심** (SECTION 8).  
2. (선택) **`payments` 행 구분용 `origin` 또는 `order_kind` text + CHECK** — 증분에 유사 컬럼 **없음**; RPC·앱 쿼리 분기용.  
3. **`commerce_orders` ↔ `customers` 또는 플랫폼 가상 거래처** — SECTION 3 갭 해소용 **별 migration**.  
4. (PG 도입 시) **`commerce_orders.payment_status` / `payments.status` CHECK 확장** — 현 CHECK는 위 SECTION 4 인용과 동일.

---

## SECTION 8 — 기존 ERP 충돌 위험 및 방어 설계

### `payments.order_id` 충돌·혼선

- `processSettlement`는 **`orders.id = order_id`** 를 전제로 조회 (`settlement-control.ts` `L723–730`).  
- **`commerce_orders.id`를 `order_id`에만 넣는 방식**은 **거부**(검증 실패 또는 오조인).  

### 설계 방어 (권장)

1. **`commerce_order_id` 별도 컬럼** (SECTION 7) + **`order_id`는 RFQ `orders`만**.  
2. **`getUnifiedSettlementView` 등**은 현재 **`orders` 목록을 먼저** 가져온 뒤 `payments`를 붙임 (`settlement-control.ts` `L402–440`) — **storefront 매출을 포함하려면** 이 쿼리 패턴 **확장이 필수**(구현 단계 과제).  

### polymorphic / `order_type`

- **기존 `payments` insert**(`accept_bid` migration `L126–136`)에는 **`order_type` 컬럼 없음**.  
- polymorphic 식별이 필요하면 **신규 컬럼**(SECTION 7)으로만 도입 가능 — **현재 스키마에 없음**.

---

## SECTION 9 — 관리자OS ERP 역할 변화 (설계 반영 후)

| 영역 | 현재 (`PLATFORM-ERP-ARCH-001`) | 설계 반영 후 (구현 시 기대) |
|------|-------------------------------|------------------------|
| 주문 콘솔 | `/admin/commerce/orders` — `getCommerceOrders`, `OrdersClient` → `updateCommerceOrderStatus` | 동일 화면에서 **`paid`와 동시에 `payments` 생성**이 가능해지면 **“플랫폼 미수 해소” 추적**의 시작점이 됨 |
| 정산·GMV | `/admin/settlements` — `orders`/`payments` only | **`commerce_order_id`가 붙은 `payments`**가 쌓이면 **동일 페이지에 합치기 위한 쿼리 확장**이 다음 과제 |
| 원장 | `getCustomerLedger` — supplier `orders` | **플랫폼 관점 원장**은 **별 쿼리 또는 `customer_id` 매핑 후** 같은 함수 확장이 필요 — **본 최소 단계에서는 필수 아님** |

**`admin_logs`:** `commerce_order_status_changed`는 이미 존재 (`commerce.ts` `L2276–2289`). `payments` 생성 시 **`target_table='payments'`** 로그 패턴은 `processSettlement`와 동일 (`L776–785`).

---

## SECTION 10 — 설계 확정 후 구현 순서 제안 (구현 착수 전 단계)

1. **SECTION 7 migration 초안** 리뷰·합의 (`payments.commerce_order_id` + CHECK).  
2. **`updateCommerceOrderStatus`** (`commerce.ts`) 또는 **전용 RPC**에서 **`pending_payment`→`paid`** 시 **`payments` insert** 호출 경로 설계(금액=`commerce_orders.total_amount`, 방향=`inbound`, `status='confirmed'` — `payments.status` CHECK는 위 SECTION 4).  
3. **`getPlatformRevenue` / `getUnifiedSettlementView`** (`settlement-control.ts`)에 **`commerce_orders`·`commerce_order_id` 조인**을 **포함할지** 여부 — **P1**.  
4. **`customers` 매핑** 및 **플랫폼 원장** — **P2**.  
5. **PG** — `PAYMENT-FORENSIC-001` 후속.

---

## 참조 인덱스 (함수·경로)

| 구분 | 경로 |
|------|------|
| storefront 주문 생성 | `resturant_os/src/actions/buy.ts` — `createCommerceOrder` |
| 관리자 주문 상태 | `realmyos/src/actions/admin/commerce.ts` — `updateCommerceOrderStatus`; UI `realmyos/src/components/commerce/OrdersClient.tsx`; 페이지 `realmyos/src/app/(admin)/admin/commerce/orders/page.tsx` |
| 정산·GMV | `realmyos/src/actions/admin/settlement-control.ts` — `getPlatformRevenue`, `getUnifiedSettlementView`, `processSettlement`, …; 페이지 `realmyos/src/app/(admin)/admin/settlements/page.tsx` |
| 수금 RPC 호출 | `realmyos/src/actions/payment.ts` — `createPayment` → `create_payment_atomic` |
| 원장 | `realmyos/src/actions/ledger.ts` — `getCustomerLedger` |
| 커머스 DDL | `supabase/migrations/20260509010000_create_commerce_tables.sql`, `20260509020000_add_commerce_orders_columns.sql`, `20260514200000_commerce_orders_idempotency.sql` |
| `payments` 상태 DDL | `supabase/migrations/20260506160000_payments_status_add_pending.sql` |

---

## 관련 tasks

- **`[PLATFORM-ERP-001]`** — 본 문서는 **최소 연결 설계 확정** 산출물.  
- **`docs/PLATFORM-ERP-ARCH-001.md`** — 현행 갭.  
- **`docs/PAYMENT-FORENSIC-001.md`** — 결제·PG 사실.

**본 턴 migration 실행:** 없음.
