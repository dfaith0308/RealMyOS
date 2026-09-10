# feature-map-restaurant.md — 식당OS 기능 전체 목록 (3단계)

- 조사일: 2026-09-09
- 대상 레포: `restaurant-os` (github.com/dfaith0308/restaurant-os), **`dev` 브랜치 기준**
- 운영 URL: `restaurant.siksiki.com` — **단, 운영에 배포된 것은 `main`이다.** dev에만 있는 화면은 표에 🚧로 표시
- 추출 방법: `src/app/**/page.tsx` 전수(라우트) + 각 페이지가 import 하는 `@/actions`·`@/lib` 추적 → 각 모듈의 `.from('테이블')` 집계
- 작동 여부 판정은 이 문서가 아니라 **`feature-status-report.md`(4단계)** 에 있다

---

## 0. 전체 규모

| | 수 |
|---|---|
| 페이지 라우트 (`page.tsx`) | **43** |
| API 라우트 (`route.ts`) | **7** |
| 서버 액션 모듈 (`src/actions/*.ts`) | 17 |
| 참조하는 DB 테이블 | **36** |
| 하단 탭(BottomNav) 진입점 | 5 |
| 하단 탭에서 도달 불가한 페이지 | **17** (§7) |

## 1. 네비게이션 구조 — 하단 탭 5개가 전부다

```
BottomNav (src/components/layout/BottomNav.tsx)
 🏠 홈    /today
 🛒 구매  /buy
 📋 발주  /rfq
 📦 내역  /orders
 ☰ 더보기 /more
        └─ 식자재 입력 대행 신청 (외부 링크)
        └─ ⭐ 구독 관리   /subscribe
        └─ 🤝 거래처 관리 /suppliers
        └─ 💰 돈관리      /money
        └─ ⚙️ 설정        /settings
        └─ 고객센터 문의 (카카오 채널, 외부) 🚧
```

**사이드바가 없다.** 모바일 전용 하단 탭 구조이고, 2차 메뉴는 `/more` 하나뿐이다. 나머지 하위 페이지는 전부 **상위 화면 안의 링크·버튼으로만** 도달한다.

---

## 2. 🏠 홈 — `/today`

| 항목 | 내용 |
|---|---|
| **이름** | 홈 / "식자재 구매하기" |
| **경로** | `/today` (`src/app/(app)/today/page.tsx`) |
| **하는 일** | 오늘 할 일을 카드로 모아 보여주는 대시보드. ① AI 절약 제안(식자재별 최근 시세 비교) ② 배송 예정 ③ 발주 루프 ④ 명세서 사진 업로드(OCR) ⑤ 고정비·구독 상태 |
| **쓰는 데이터** | `ingredients`, `price_history`, `rfq_requests`, `savings_stats`, `fixed_costs`, `ai_decision_logs`, `notifications`, `payments`, `today_events`, `tenants`, `menus` |
| **주요 액션 모듈** | `actions/today.ts`, `actions/money.ts`, `actions/menus.ts`, `actions/subscribe.ts`, `actions/orders.ts`, `actions/ingredients.ts`, `lib/order-capture.ts`, `lib/personalized-price.ts`, `lib/behavior-profile.ts` |
| **다른 화면과의 연결** | → `/rfq/new`(절약 제안에서 발주 생성) · → `/orders`(배송 예정) · → `/settings/ingredients`(식자재 등록 유도) · → `/subscribe`(구독) · ← `/buy`(구매 후 복귀) |
| **구성 카드** | `TodayLoopCard`, `TodayDeliveryCard`, `TodayImportCard`, `TodaySavingCard` 계열 (`src/components/today/`) |

> 이 화면이 **식당OS에서 데이터 의존성이 가장 큰 화면**이다. 11개 테이블을 한 번에 읽는다.

---

## 3. 🛒 구매 (쇼핑몰) — `/buy` 계열 8화면

플랫폼이 중개하는 상품을 식당이 직접 사는 커머스 흐름이다. **식당OS에서 유일하게 돈이 실제로 오가는 경로.**

| 화면 | 경로 | 하는 일 | 쓰는 데이터 | 연결점 |
|---|---|---|---|---|
| **상품 목록** | `/buy` | 카테고리별 리스팅 검색·조회. 개인화 가격 적용 | `commerce_product_listings`, `products`, `product_categories`, `tenants`, `admin_settings`, `wishlist_items` 🚧 | → 상품 상세 · → 장바구니 · → 찜 🚧 |
| **상품 상세** | `/buy/products/[id]` | 단일 리스팅 상세, 수량 선택, 장바구니 담기 | 위와 동일 | → 장바구니 · → 찜 🚧 |
| **장바구니** | `/buy/cart` | 담은 상품 수량 조정·삭제, 할인 계산 | `cart_items`, `commerce_product_listings`, `coupons` | → 결제 |
| **결제** | `/buy/checkout` | 배송지 확인, 결제수단 선택(토스 단건결제 / 무통장) | `cart_items`, `commerce_orders`, `commerce_order_items`, `admin_settings` | → 토스 API · → 성공/실패 |
| **결제 성공** | `/buy/checkout/success` | 결제 승인 결과 표시 | — | → 구매 내역 |
| **결제 실패** | `/buy/checkout/fail` | 실패 사유 표시 | — | → 장바구니 |
| **구매 내역** | `/buy/orders` | 내가 산 커머스 주문 목록 | `commerce_orders`, `commerce_order_items` | → 주문 상세 |
| **구매 상세** | `/buy/orders/[id]` | 주문 1건 상세 + **진행 타임라인** 🚧 + **취소** 🚧 + **문의** 🚧 | `commerce_orders`, `commerce_order_items` | → 카카오 문의 🚧 |
| **찜 목록** 🚧 | `/buy/wishlist` | 찜한 리스팅 모아보기 | `wishlist_items`, `commerce_product_listings` | → 상품 상세 |

**API 라우트**
| 경로 | 하는 일 |
|---|---|
| `/api/toss/confirm` | 토스 단건결제 승인 콜백 → `commerce_orders` 확정 |
| `/api/toss/billing` | 구독 빌링키 발급/결제 |

**핵심 모듈**: `actions/buy.ts`(9개 테이블), `lib/commerce-order-erp.ts`(주문 확정 시 공급자OS 쪽 ERP 반영 — 8개 테이블), `lib/buy-discount.ts`, `lib/storefront-bank-transfer.ts`

> 🚧 표시 5개(찜/취소/타임라인/문의/장바구니 스타일)는 **08-26에 만들어졌으나 14일째 미배포**다. 1단계 보고서 「G 묶음」 참조.

---

## 4. 📋 발주 (RFQ) — `/rfq` 계열 4화면

식자재를 여러 공급자에게 견적 요청하고 최저가를 고르는 흐름이다.

| 화면 | 경로 | 하는 일 | 쓰는 데이터 | 연결점 |
|---|---|---|---|---|
| **발주 목록** | `/rfq` | 내가 낸 견적요청 목록·상태 | `rfq_requests`, `rfq_bids`, `notifications` | → 발주 상세 · → 새 발주 |
| **새 발주** | `/rfq/new` | 식자재·수량·희망일 입력해 RFQ 생성 → 공급자에게 알림 | `rfq_requests`, `ingredients`, `notifications` | ← `/today` 절약 제안 · → 발주 목록 |
| **발주 상세** | `/rfq/[id]` | 들어온 입찰 비교, 낙찰 선택 | `rfq_requests`, `rfq_bids`, `orders`, `price_history` | → 주문 생성 |
| **입찰 결과** | `/orders/results` | 입찰 결과 모아보기 | `rfq_requests`, `rfq_bids` (페이지에서 직접 조회) | ← 발주 상세 |

**핵심 모듈**: `actions/rfq.ts`, `lib/rfq-notify-suppliers.ts`(공급자에게 `notifications` 발송), `components/rfq/BidCompareClient.tsx`

> **주의**: 운영 실측 `rfq_requests` 0행 / `rfq_bids` 0행. 이 흐름은 **한 번도 실사용된 적이 없다.**

---

## 5. 📦 내역 — `/orders` 계열

| 화면 | 경로 | 하는 일 | 쓰는 데이터 | 연결점 |
|---|---|---|---|---|
| **주문 내역** | `/orders` | 발주(RFQ)로 생긴 주문 + 커머스 구매 내역을 함께 표시 | `orders`, `rfq_bids`, `restaurant_order_items`, `commerce_orders` | → 주문 상세 · → 구매 내역 |
| **주문 상세** | `/orders/[id]` | 주문 1건 상세, 명세서 사진 첨부/판독 | `orders`, `ingredients`, `price_history`, `payments` | → 식자재 등록 |
| **입찰 결과** | `/orders/results` | (위 §4 참조) | | |

**핵심 모듈**: `actions/orders.ts`, `lib/order-capture.ts`(명세서 이미지 → 품목 추출), `components/orders/OrderCaptureCard.tsx`, `OrderImageCaptureCard.tsx`, `RecentOrderActivity.tsx`

---

## 6. ☰ 더보기 하위 — 4개 영역

### 6-1. ⭐ 구독 관리 — `/subscribe`

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| 구독 관리 | `/subscribe` | 플랜 확인·변경, 프로모션 코드 입력, 빌링키 등록 | `tenants`, `coupons`, `coupon_uses` |
| 빌링 성공 | `/subscribe/billing/success` | 빌링키 등록 결과 | — |
| 빌링 실패 | `/subscribe/billing/fail` | 실패 사유 | — |

> 운영 실측: **전 tenant `subscription_plan='free'`.** 유료 전환 실적 0건.
> 연결: 공급자OS/관리자OS의 `/admin/coupons`·`/admin/sales/promo`에서 만든 쿠폰이 여기로 들어온다.

### 6-2. 🤝 거래처 관리 — `/suppliers` (3화면)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| 거래처 목록 | `/suppliers` | 내가 거래하는 공급자 목록 | **`suppliers`**, `orders` |
| 거래처 상세 | `/suppliers/[id]` | 거래처별 거래 이력·가격 | **`suppliers`**, `orders` |
| 거래처 등록 | `/suppliers/new` | 거래처 수기 등록 | **`suppliers`** |

> 🔴 **`suppliers` 테이블이 운영 DB에 존재하지 않는다** (실측 확인). 1차 조사 `M-03`·`C-03`. 4단계 참조.

### 6-3. 💰 돈관리 — `/money` (4화면)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| 돈관리 홈 | `/money` | 매출·원가·지출 요약 | `payments`, `tenants` |
| 현금 흐름 | `/money/cashflow` | 기간별 입출금 흐름 | `payments` |
| 거래처별 | `/money/suppliers` | 공급자별 지출 집계 | `payments` |
| 지급 예정 | `/money/upcoming` | 앞으로 나갈 돈 | `payments` |

**핵심 모듈**: `actions/money.ts`, `lib/get-restaurant.ts`

### 6-4. ⚙️ 설정 — `/settings` (7화면)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| 설정 허브 | `/settings` | 하위 설정 진입점 + 요약 | `tenants`, `menus`, `fixed_costs`, `ingredients` |
| 식당 정보 | `/settings/restaurant` | 상호·주소·영업시간 | `tenants` |
| 계정 | `/settings/account` | 비밀번호·탈퇴 | (Supabase Auth) |
| 알림 | `/settings/notifications` | 푸시 수신 설정 | `push_subscriptions` (API 경유) |
| **식자재** | `/settings/ingredients` | 식자재 마스터 등록·단가·단위 관리 | `ingredients`, `ingredient_price_history`, `ingredient_unit_history`, `invoice_suppliers` |
| **메뉴** | `/settings/menus` | 메뉴 등록, 메뉴별 원가(레시피) | `menus`, `menu_ingredients`, `menu_cost_cache`, `ingredients` |
| **고정비** | `/settings/fixed-costs` | 임대료·인건비 등 고정비 | `fixed_costs`, `menus`, `tenants` |

> 운영 실측: `ingredients` **0행** / `menus` **2행(최종 2026-05-17)** / `menu_ingredients` 0행 / `fixed_costs` 15행.
> **식자재·메뉴 원가 기능은 4개월째 사실상 미사용이다.**

---

## 7. 네비게이션에서 도달할 수 없는 화면 17개

하단 탭·`/more`·상위 화면 링크 어디에서도 직접 진입점이 없거나, 인증 흐름 전용인 것들이다.

| 경로 | 성격 | 비고 |
|---|---|---|
| `/` | 루트 리다이렉트 | → `/today` 또는 `/login` |
| `/login`, `/login/reset` | 인증 | |
| `/privacy`, `/terms` | 법적 고지 | 푸터 링크 |
| `/onboarding` | 가입 후 초기 설정 | `tenants`, `users`, `ingredients` |
| `/pending` | role 미할당 대기 화면 | `users` — **09-09 `8e40059`가 여기로 보내도록 수정** |
| `/admin` | 식당OS 안의 관리자 화면 | `orders`, `rfq_requests`, `tenants` 직접 조회. **관리자OS와 별개** |
| `/notifications` | 알림함 | `notifications` — 진입 링크가 홈 카드에만 있음 |
| `/buy/checkout/success`·`/fail` | 결제 콜백 | |
| `/subscribe/billing/success`·`/fail` | 빌링 콜백 | |
| `/orders/results` | 입찰 결과 | 발주 상세에서만 |
| `/buy/wishlist` 🚧 | 찜 목록 | 하트 버튼에서만 |
| `/suppliers/new` | 거래처 등록 | 목록에서만 |
| `/rfq/new` | 새 발주 | 목록·홈에서만 |

**API 라우트 7개**: `/api/toss/confirm`, `/api/toss/billing`, `/api/push/send`, `/api/push/subscribe`, `/api/push/unsubscribe`, `/auth/callback`, `/auth/signout`

> ⚠️ `/admin`이 식당OS 안에 별도로 존재한다. 관리자OS(RealMyOS의 `/admin/*`)와 **이름이 같고 기능이 다르다.** 5단계에서 다룬다.

---

## 8. 서버 액션 모듈 ↔ 테이블 전체 대응표

| 모듈 | 참조 테이블 |
|---|---|
| `actions/buy.ts` | `admin_settings`, `cart_items`, `commerce_order_items`, `commerce_orders`, `commerce_product_listings`, `product_categories`, `products`, `tenants`, `wishlist_items` |
| `actions/today.ts` | `ai_decision_logs`, `fixed_costs`, `ingredients`, `notifications`, `payments`, `rfq_requests`, `savings_stats` |
| `actions/orders.ts` | `ingredients`, `orders`, `payments`, `price_history`, `restaurant_order_items`, `rfq_bids` |
| `actions/rfq.ts` | `orders`, `price_history`, `rfq_bids`, `rfq_requests` |
| `actions/ingredients.ts` | `ingredient_price_history`, `ingredient_unit_history`, `ingredients`, `invoice_suppliers` |
| `actions/menus.ts` | `menu_cost_cache`, `menu_ingredients`, `menus` |
| `actions/settings.ts` | `fixed_costs`, `ingredients` |
| `actions/suppliers.ts` | `orders`, **`suppliers`** |
| `actions/import.ts` | `ingredients`, `price_history`, **`suppliers`** |
| `actions/money.ts` | `payments` |
| `actions/subscribe.ts` | `coupon_uses`, `coupons`, `tenants` |
| `actions/notifications.ts` | `notifications` |
| `actions/today-events.ts` | `today_events` |
| `actions/restaurant.ts` | `tenants` |
| `actions/signup.ts` | `tenants`, `users` |
| `actions/ai-logs.ts` | `ai_decision_logs` |
| `actions/storefront-bank-transfer.ts` | `admin_settings` |
| `lib/commerce-order-erp.ts` | `admin_logs`, `admin_settings`, `commerce_order_allocations`, `commerce_order_items`, `commerce_orders`, `commerce_product_listings`, `payments`, `products` |
| `lib/personalized-price.ts` | `ingredients`, `price_history` |
| `lib/rfq-notify-suppliers.ts` | `notifications`, `rfq_bids`, `rfq_requests` |
| `lib/behavior-profile.ts` | `ai_decision_logs`, `today_events` |
| `lib/get-restaurant.ts` / `lib/supabase-server.ts` | `users` |
| `lib/admin-settings-read.ts` | `admin_settings` |

---

## 9. 이 앱이 건드리는 테이블의 실사용 현황 (운영 실측)

| 활발 | 행수 / 최종 |
|---|---|
| `orders` / `payments` | 284 / 260 · 2026-09-08 |
| `commerce_product_listings` | 38 · 2026-09-07 |
| `cart_items` | 4 |
| `commerce_orders` / `commerce_order_items` | 9 / 8 · 2026-07-31 |

| 멈춤·미사용 | 행수 |
|---|---|
| `menus` / `menu_cost_cache` | 2 / 2 · **2026-05-17** |
| `fixed_costs` | 15 · 2026-05-18 |
| **`ingredients`** | **0** |
| `menu_ingredients`, `rfq_requests`, `rfq_bids`, `restaurant_order_items`, `savings_stats`, `today_events`, `notifications`, `ai_decision_logs`, `wishlist_items`, `price_history`, `ingredient_*_history`, `invoice_suppliers` | **전부 0** |

> **읽는 방법**: 식당OS에서 실제로 돌아가는 것은 **커머스 구매(`/buy`)와 주문·결제 조회**뿐이다.
> 발주(RFQ)·식자재·메뉴 원가·절약 제안은 **데이터가 0행이라 화면은 있으나 내용이 비어 있다.**
