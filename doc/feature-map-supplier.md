# feature-map-supplier.md — 공급자OS 기능 전체 목록 (3단계)

- 조사일: 2026-09-09
- 대상 레포: `RealMyOS` (github.com/dfaith0308/RealMyOS), **`dev` 브랜치 기준**
- 범위: `src/app/(app)/**` + `src/app/automation/**` (= 공급자OS). 관리자OS(`src/app/(admin)/**`)는 `feature-map-admin.md`
- 운영 URL: `real-my-os.vercel.app` — **배포된 것은 `main`.** dev에만 있는 것은 🚧
- 추출 방법: 라우트 전수 + 페이지가 import 하는 `@/actions` 추적 → 각 모듈의 `.from('테이블')` 집계

---

## 0. 전체 규모

| | 수 |
|---|---|
| 공급자OS 페이지 라우트 | **45** (`(app)` 42 + `automation` 3) |
| 사이드바 최상위 항목 | **14** |
| 사이드바 하위 항목 | 22 |
| 서버 액션 모듈 | 40 (관리자OS와 공용 일부 포함) |
| 참조 테이블 | **약 45** |

## 1. 사이드바 구조 (`src/components/layout/Sidebar.tsx`)

```
대시보드            /dashboard
거래처관리          /customers
   ├ 거래처 목록    /customers
   └ 거래처 등록    /customers/new
주문관리            /orders
   ├ 주문 목록      /orders
   └ 주문 등록      /orders/new
견적관리            /quotes
   ├ 견적목록       /quotes
   └ 견적등록       /quotes/new
발주요청            /rfq
상품관리            /products
   ├ 상품 목록      /products
   ├ 상품 등록      /products/new
   └ 대량 등록      /products/bulk
수금관리            /payments/new
   ├ 수금 등록      /payments/new
   └ 수금 목록      /payments
지급관리            /disbursements
   ├ 지급 목록      /disbursements
   ├ 지급 등록      /disbursements/new
   └ 지급 상세      (soon — 미구현 표시)
매입관리            /purchases
   ├ 매입 목록      /purchases
   └ 매입 등록      /purchases/new
자금관리            /funds
   ├ 자금 현황      /funds
   └ 자금 설정      /funds/settings
설정                /settings
   ├ 운영분류 관리  /settings/tags
   └ 메시지 템플릿  /settings/messages
원장관리            /ledger
자동화영업          /sales/schedule
   ├ 영업스케쥴     /sales/schedule
   ├ 실행센터       /sales/exec
   ├ 영업이력       /sales/history
   └ 스크립트관리   /sales/scripts
매출분석            /analytics
```

---

## 2. 대시보드 — `/dashboard`

| 항목 | 내용 |
|---|---|
| **하는 일** | 오늘의 매출·미수금·주문 건수 요약, 처리 대기 항목 |
| **쓰는 데이터** | `customers`, `orders`, `payments`, `rfq_requests` |
| **모듈** | `actions/dashboard.ts` |
| **연결** | → 거의 모든 하위 화면의 진입점. 사이드바 로고 클릭 시에도 여기로 |

---

## 3. 거래처관리 — `/customers` (6화면)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 | 연결점 |
|---|---|---|---|---|
| 거래처 목록 | `/customers` | 거래처 리스트, 미수금·최근거래 | `ledger.ts` → `customers`,`orders`,`payments`,`customer_stats`,`customer_deposits`,`order_lines`,`purchases`,`action_logs`,`contact_logs` | → 상세 |
| 전체 거래처 | `/customers/all` | 삭제분 포함 전체 | `customer-query.ts` → `customers`,`orders`,`payments` | |
| 거래처 상세 | `/customers/[id]` | 거래 이력, 태그, 영업 트리거 | `sales.ts`, `customer-query.ts` → + `contact_logs`,`message_logs`,`sales_schedules`,`sales_scripts`,`customer_tags` | → 원장 · → 수정 · → 주문 등록 |
| 거래처 수정 | `/customers/[id]/edit` | 정보 수정 | `customer-query.ts`, `acquisition-channel.ts` → + `acquisition_channels` | |
| **거래처 원장** | `/customers/[id]/ledger` | 거래처별 매출·수금·잔액 원장 | `ledger.ts`(9테이블) | → 수금 등록 |
| 거래처 등록 | `/customers/new` | 신규 등록 | `acquisition-channel.ts`, `customer-tag-options.ts` → `acquisition_channels`,`customer_tag_options` | |

**부가 모듈**: `customer-bulk.ts`(대량 등록 + `opening_balance_logs`), `customer-tags.ts`(`customer_tag_logs`), `customer-deposits.ts`(`customer_deposits`,`deposit_logs`), `customer-product-prices.ts`(거래처별 단가)

> 운영 실측: `customers` **142행 · 2026-09-08** — **공급자OS에서 가장 활발한 영역.**

---

## 4. 주문관리 — `/orders` (4화면)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 | 연결점 |
|---|---|---|---|---|
| 주문 목록 | `/orders` | 주문 리스트·상태 필터 | `order-query.ts` → `orders` | → 상세 |
| 주문 상세 | `/orders/[id]` | 라인 항목, 배송, 수금 상태 | `order.ts` → `orders`,`order_lines`,`order_logs`,`customers`,`products`,`customer_product_prices`,`contact_logs`,`settings` | → 수정 · → 수금 |
| 주문 수정 | `/orders/[id]/edit` | 라인 편집 | `settings.ts`, `product.ts` | |
| 주문 등록 | `/orders/new` | 거래처·상품 선택해 주문 생성 | `order-query.ts`, `quote.ts` → + `quotes`,`quote_items` | ← 견적에서 전환 |

**부가**: `order-export.ts`(거래명세서 출력 — `orders`,`settings`,`tenants`)

> 운영 실측: `orders` **284행 / `order_lines` 522행 · 2026-09-08.**

---

## 5. 견적관리 — 경로가 **두 벌**이다

| 화면 | 경로 A | 경로 B | 하는 일 | 쓰는 데이터 |
|---|---|---|---|---|
| 견적 목록 | `/quotes` | `/orders/quotes` | 견적 리스트 | `quote.ts` → `quotes`,`quote_items`,`quote_logs`,`customers`,`products` |
| 견적 상세 | `/quotes/[id]` | `/orders/quotes/[id]` | 견적 1건 | 동일 |
| 견적 등록 | `/quotes/new` | `/orders/quotes/new` | 견적 작성 | `order.ts` |

> ⚠️ **같은 기능이 두 URL에 있다.** 사이드바는 `/quotes`를 가리킨다. `/orders/quotes/*` 3개는 액션 import가 없는 껍데기다. 5단계에서 다룬다.
> 운영 실측: `quotes` **1행 · 2026-07-31** / `quote_items` **0행** / `quote_logs` **0행** — 사실상 미사용.
> 부가: `quote-export.ts` → `quotes`,`quote_logs`,`settings`

---

## 6. 발주요청 — `/rfq` (2화면)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| 발주요청 목록 | `/rfq` | 식당이 낸 RFQ 중 내가 입찰할 것 | `rfq.ts` → `rfq_bids`,`tenants` / `notifications.ts` |
| 발주요청 상세 | `/rfq/[id]` | 입찰가 제출 | `rfq.ts` |

> **식당OS `/rfq`의 반대편이다.** 식당이 요청 → 공급자가 입찰.
> 운영 실측: `rfq_requests` 0행 / `rfq_bids` 0행 — **양쪽 다 미사용.**

---

## 7. 상품관리 — `/products` (5화면)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 | 연결점 |
|---|---|---|---|---|
| 상품 목록 | `/products` | 상품 리스트, 원가·판매가, **"원가 미확정" 배지** 🚧 | `product.ts`, `category.ts`, `settings.ts` → `products`,`product_costs`,`product_prices`,`product_categories`,`product_stats`,`product_logs`,`order_lines`,`orders`,`customer_product_prices` | → 상세 |
| 상품 상세 | `/products/[id]` | 원가 이력, 거래처별 판매 분석 | `product.ts`, `product-analytics.ts` | |
| 상품 수정 | `/products/[id]/edit` | 정보·가격 수정 | `category.ts`, `settings.ts` | |
| 상품 등록 | `/products/new` | 신규 등록 | `category.ts`, `product.ts` | |
| 대량 등록 | `/products/bulk` | 엑셀 업로드 | (클라이언트 컴포넌트) | |

> 운영 실측: `products` 199행 / `product_costs` 194행 · 2026-09-07. **`product_stats.used_by_count > 0`인 행은 0/180 — 사용처 카운터가 한 번도 안 채워졌다**(1차 조사).
> 🚧 "원가 미확정" 표시·계산 제외는 dev에만 있다 (1단계 「C 묶음」, 6커밋).

---

## 8. 돈 흐름 4영역 — 수금 / 지급 / 매입 / 자금

### 8-1. 수금관리 — `/payments` (3화면)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| 수금 등록 | `/payments/new` | 입금 기록, 주문에 자동 배분(FIFO) | (클라이언트) → `create_payment_atomic` RPC |
| 수금 목록 | `/payments` | 수금 리스트 | `payment.ts` → `payments`,`collection_allocations`,`payment_allocations`,`customers`,`customer_deposits`,`orders`,`purchases` |
| 수금 상세 | `/payments/[id]` | 배분 내역, 취소 | 동일 |

> DB 함수 `allocate_payment_fifo`, `create_payment_atomic`(둘 다 `SECURITY DEFINER`)가 실제 배분을 수행.
> 운영 실측: `payments` **260행 / `collection_allocations` 204행 · 2026-09-08.**

### 8-2. 지급관리 — `/disbursements` (2화면 + "곧 제공" 1)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| 지급 목록 | `/disbursements` | 나가는 돈 목록 | `payment.ts` |
| 지급 등록 | `/disbursements/new` | 지급 기록 + 배분 | `purchase.ts` → `purchases` / `create_disbursement_with_allocations` RPC |
| 지급 상세 | — | **사이드바에 `soon: true`로 표시. 미구현** | — |

### 8-3. 매입관리 — `/purchases` (2화면)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| 매입 목록 | `/purchases` | 매입 내역 | `purchase.ts` → `purchases` |
| 매입 등록 | `/purchases/new` | 매입 기록 | (클라이언트) |

> 운영 실측: `purchases` **1행.** 거의 미사용.

### 8-4. 자금관리 — `/funds` (2화면)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| 자금 현황 | `/funds` | 계좌·목적별 자금 배분 현황 | `fund.ts` → `accounts`,`account_purposes`,`fund_rules`,`fund_transfers`,`orders` |
| 자금 설정 | `/funds/settings` | 배분 규칙 설정 | `fund.ts` |

> 운영 실측: `accounts` 1행 / `account_purposes` 7행 / **`fund_rules` 0행 / `fund_transfers` 0행** — 규칙이 하나도 없어 실제 배분은 일어나지 않는다.
> DB 함수 `generate_fund_transfers`(`SECURITY DEFINER`)가 배분 생성 담당.

---

## 9. 원장관리 — `/ledger`

| 항목 | 내용 |
|---|---|
| **하는 일** | 전체 거래처의 매출·수금·잔액을 한 화면에서 집계 |
| **쓰는 데이터** | `ledger.ts` → `customers`, `orders`, `order_lines`, `payments`, `customer_stats`, `customer_deposits`, `purchases`, `action_logs`, `contact_logs` (**9테이블**) |
| **연결** | → 거래처별 원장(`/customers/[id]/ledger`) |
| **부가** | `ledger-export.ts` → 엑셀 출력 (`customers`,`settings`,`tenants`) |

> 운영 실측: `customer_stats` **11행 / 활성 `customers` 138행 = 커버리지 8%.** 통계 테이블이 대부분 비어 있다(1차 3-3).

---

## 10. 자동화영업 — `/sales` (4화면) + `/automation` 중복 3개

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| 영업스케쥴 | `/sales/schedule` | 재구매 시점 예측·연락 일정 | `sales.ts` → `sales_schedules`,`customers`,`contact_logs`,`orders`,`payments`,`message_logs`,`sales_scripts` |
| 실행센터 | `/sales/exec` | 오늘 연락할 대상 실행 | `sales.ts`, `customer-query.ts` |
| 영업이력 | `/sales/history` | 연락 기록 | `sales.ts` |
| 스크립트관리 | `/sales/scripts` | 문자·통화 스크립트 관리 | `sales.ts` → `sales_scripts` |
| (그룹 페이지) | `/sales` | 액션 import 없음 — 리다이렉트/셸로 보임 | — |

**중복 라우트 3개**
```
/automation/history   → src/app/(app)/sales/history/page  를 그대로 re-export
/automation/schedule  → src/app/(app)/sales/schedule/page
/automation/scripts   → src/app/(app)/sales/scripts/page
```
> ⚠️ `src/app/automation/`에는 **`layout.tsx`가 없다.** `(app)` 그룹 밖이므로 **사이드바 없이 렌더링된다.** 5단계에서 다룬다.

**부가 모듈**: `sales-trigger.ts`(`contact_logs`,`customer_tags`,`customers`,`sales_schedules`), `contact.ts`(`contact_logs`,`customers`,`message_logs`,`orders`), `message.ts`(`message_logs`,`settings`,`settings_logs`), `action-log.ts`(`action_logs`)

> 🔴 운영 실측: `action_logs` **1행 · 최종 2026-04-07** / `sales_schedules` **1행 · 2026-04-12** / `contact_logs` 6행 / `message_logs` 3행.
> **영업 자동화는 5개월째 사실상 정지 상태다.** 1차 조사 `M-06`(logAction 무음 실패)이 원인 중 하나였고 `e05f0c8`으로 수정됐다.

---

## 11. 매출분석 — `/analytics`

| 항목 | 내용 |
|---|---|
| **하는 일** | 매출 개요 / 마진 / 거래처별 3탭 분석 |
| **쓰는 데이터** | `analytics.ts` → `orders`, `order_lines`, `payments`, `customers`, `collection_allocations` |
| **구성** | `OverviewTab`, `MarginTab`, `CustomerTab`, `CostCoverageNotice` 🚧 |
| **계산 모듈** | `lib/analytics-calc.ts` |

> 🚧 "원가 미확정 경고 + 계산 제외"는 dev에만 있다. 1차 실측 `order_lines.cost_price <= 1`이 **64/522(12.3%)** 이므로, **운영의 마진율은 지금 12%의 오염된 라인을 포함해 계산되고 있다.**

---

## 12. 설정 — `/settings` (3화면)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| 설정 | `/settings` | 사업자 정보, 명세서 양식 등 | `settings.ts`, `message.ts` → `settings`,`settings_logs`,`tenants`,`customers`,`message_logs` |
| 운영분류 관리 | `/settings/tags` | 거래처 태그 옵션 | `customer-tag-options.ts` → `customer_tag_options` |
| **메시지 템플릿** | `/settings/messages` | 문자 템플릿 관리 | `message-template.ts` → **`message_templates`** |

> 🔴 **`message_templates` 테이블이 운영 DB에 없다** (실측). 1차 `M-02`·`C-02`. 4단계 참조.

---

## 13. 구독 — `/subscribe` (3화면)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| 구독 | `/subscribe` | 플랜·결제수단 | `subscribe.ts` → `tenants` |
| 빌링 성공/실패 | `/subscribe/billing/success`·`/fail` | 콜백 | — |

**관련 API**: `/api/toss/billing`, 🚧 `/api/cron/billing-renewal`(매일 자정 자동 재청구 — **dev 전용, 미배포**)
**부가**: `subscribe-promo.ts` → `coupons`,`coupon_uses`

---

## 14. 인증·기타 (사이드바 밖)

| 경로 | 성격 |
|---|---|
| `/` | 루트 리다이렉트 |
| `/login`, `/forgot-password`, `/reset-password` | 인증 |
| `/onboarding` | 가입 후 초기 설정 |
| `/privacy`, `/terms` | 법적 고지 |
| `/auth/callback` [API] | Supabase Auth 콜백 |
| `/api/admin/export-listings` [API] | 리스팅 엑셀 내보내기 |
| `/api/toss/billing` [API] | 빌링키 |
| 🚧 `/api/cron/billing-renewal` [API] | 구독 자동 재청구 (dev 전용) |

---

## 15. 사이드바에 없지만 존재하는 것 · 사이드바에 있지만 없는 것

| 유형 | 항목 |
|---|---|
| **사이드바에 없는 실재 화면** | `/customers/all`, `/customers/[id]/ledger`, `/orders/[id]/edit`, `/products/[id]`, `/products/[id]/edit`, `/payments/[id]`, `/rfq/[id]`, `/quotes/[id]`, `/sales`, `/subscribe`, `/orders/quotes/*` 3개, `/automation/*` 3개 |
| **사이드바에 있으나 미구현** | 지급관리 > **지급 상세** (`soon: true`) |
| **사이드바 항목이 가리키는 곳이 특이** | 수금관리 그룹의 대표 링크가 `/payments`가 아니라 **`/payments/new`**(등록 화면) |
