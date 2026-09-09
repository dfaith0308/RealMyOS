# feature-map-admin.md — 관리자OS 기능 전체 목록 (3단계)

- 조사일: 2026-09-09
- 대상 레포: `RealMyOS`, **`dev` 브랜치 기준**, 범위 `src/app/(admin)/**`
- 운영 URL: `real-my-os.vercel.app/admin/*` — **배포된 것은 `main`.** dev에만 있는 것은 🚧
- 공급자OS(`(app)`)와 **같은 Next.js 앱·같은 DB**를 쓰고 레이아웃만 다르다

---

## 0. 전체 규모

| | 수 |
|---|---|
| 관리자OS 페이지 라우트 | **23** |
| 사이드바 최상위 항목 | **8** |
| 사이드바 하위 항목 | 12 |
| 전용 서버 액션 모듈 (`actions/admin/*`) | **21** |
| 참조 테이블 | 약 35 |

## 1. 사이드바 구조 (`src/components/layout/AdminSidebar.tsx`)

```
🧭 홈                /admin/dashboard
📇 영업/가입관리
    ├ 리드 관리      /admin/sales
    └ 프로모션 코드  /admin/sales/promo
🏢 회원관리          /admin/tenants
🛒 쇼핑몰관리
    ├ 상품관리       /admin/commerce/products
    ├ 카테고리       /admin/commerce/categories
    ├ 식자재 마스터  /admin/commerce/ingredients
    ├ 주문처리       /admin/commerce/orders
    ├ 가격 정책      /admin/commerce/pricing
    ├ 무통장 입금    /admin/commerce/storefront-bank
    ├ 쿠폰 관리      /admin/coupons
    └ 푸시 알림      /admin/push
💰 매출/정산
    ├ 정산 현황          /admin/settlements
    ├ 지급 예정          /admin/commerce/allocations
    └ 공급자 지급 원장   /admin/commerce/payables
🧬 이상거래 확인     /admin/trades
⚙️ 설정              /admin/policy
🧾 활동 기록         /admin/logs
```

> 1차 조사가 언급한 「사이드바 재구성 — 12개 → 8개」(`b39bc33`, 08-31)의 결과다.

---

## 2. 🧭 홈 — `/admin/dashboard` (2화면)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| 관리자 홈 | `/admin/dashboard` | 플랫폼 전체 지표 카드 + 처리 대기 큐 | `admin/dashboard-metrics.ts` → `commerce_orders`,`coupon_uses`,`coupons`,`customers`,`orders`,`payments`,`sales_leads`,`tenants`,`users` / `admin/action-queue.ts` → `action_queue`,`admin_logs` |
| 지표 상세 | `/admin/dashboard/[metric]` | 카드 클릭 시 해당 지표 상세 목록 | `admin/dashboard-metrics.ts` |
| (그룹 루트) | `/admin` | 액션 없음 — `/admin/dashboard`로 보내는 셸 | — |

> 운영 실측: `action_queue` **0행** — 처리 대기 큐가 한 번도 안 쌓였다.

---

## 3. 📇 영업/가입관리 — `/admin/sales` (3화면)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 | 연결점 |
|---|---|---|---|---|
| **리드 관리** | `/admin/sales` | 가입 리드 목록·상태 관리 + 🚧 **관찰기록 탭** | `admin/sales-leads.ts` → `sales_leads`,`sales_lead_notes`,`tenants` / 🚧 `admin/field-observations.ts` → `field_observations` | → 리드 상세 |
| 리드 상세 | `/admin/sales/leads/[id]` | 리드 1건, 메모, SMS 발송 | `admin/sales-leads.ts`, `admin/sales-lead-sms.ts` → + SOLAPI | → 회원 전환 |
| 프로모션 코드 | `/admin/sales/promo` | 가입 유도용 쿠폰 발급 | `admin/sales-promo.ts` → `coupons`,`coupon_uses`,`sales_leads`,`tenants` | → 식당OS `/subscribe` |

> 🚧 **현장 관찰기록** (`FieldObservationsClient.tsx` 526줄 + `sales.module.css` 376줄 + 마이그레이션 231줄)은 **dev 전용, 미배포**. 1단계 「B 묶음」.
> 운영 실측: **`field_observations` 3행 (2026-09-07)** — 테이블·데이터는 운영에 있는데 **화면이 배포 안 됐다.**
> `sales_leads` 0행 / `sales_lead_notes` 0행.

---

## 4. 🏢 회원관리 — `/admin/tenants`

| 항목 | 내용 |
|---|---|
| **하는 일** | 가입한 tenant(식당·공급자) 목록, 역할·구독 상태 관리 |
| **쓰는 데이터** | `actions/admin.ts` → `tenants`, `users`, `admin_logs` |
| **연결** | → 참여자 신뢰도(`/admin/participants`) · → 정산 |
| **부가** | `admin/subscription.ts` → `tenants` (플랜 변경) |

> 운영 실측: `tenants` **8개** (admin 1 / restaurant 3 / supplier 2 / **role NULL 2**) · `users` **6명**.
> role NULL 2건이 09-09 `7f86ae9` role 게이트 사고의 배경이다(1단계 D-03).

---

## 5. 🛒 쇼핑몰관리 — 8화면 (플랫폼 커머스의 관리자 쪽)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| **상품관리** | `/admin/commerce/products` | 리스팅 목록·판매상태·매입가 | `admin/commerce.ts` → `commerce_product_listings`,`products`,`product_costs`,`product_stats`,`product_categories`,`shipping_groups`,`tenants`,`payments`,`supplier_payables`,`commerce_orders`,`commerce_order_allocations`,`admin_logs`,`users` |
| 리스팅 등록 | `/admin/commerce/products/new` | 신규 리스팅 | (클라이언트 `ListingFormClient`) |
| 리스팅 수정 | `/admin/commerce/products/[id]/edit` | 수정 + 🚧 **공급자 이관 패널** | `admin/commerce.ts` / `admin/commerce-listing-transfer.ts` → + `product_costs` |
| 대량 등록 | `/admin/commerce/products/bulk` | 엑셀 업로드 | `admin/bulk-listing.ts` → `commerce_product_listings`,`product_categories` |
| 카테고리 | `/admin/commerce/categories` | 상품 분류 관리 | `admin/commerce.ts` → `product_categories` |
| **식자재 마스터** | `/admin/commerce/ingredients` | 전역 식자재 마스터·매핑 | `admin/ingredient-master.ts` → `ingredient_master`,`ingredient_mappings` |
| **주문처리** | `/admin/commerce/orders` | 커머스 주문 확인·상태 변경 | `admin/commerce.ts`, `admin/platform-revenue.ts` → `commerce_orders`,`orders`,`payments`,`supplier_payables`,`tenants` |
| 가격 정책 | `/admin/commerce/pricing` | 식당별·리스팅별 가격 정책 | `admin/pricing-policies.ts` → `pricing_policies`,`pricing_policy_targets`,`commerce_product_listings`,`tenants` |
| 무통장 입금 | `/admin/commerce/storefront-bank` | 계좌이체 입금 확인 | `admin/storefront-bank-transfer.ts` → `admin_settings`,`admin_logs` |
| 쿠폰 관리 | `/admin/coupons` | 쿠폰 생성·사용현황 | `admin/coupons.ts` → `coupons`,`coupon_uses` |
| 푸시 알림 | `/admin/push` | 푸시 발송 | `admin/push.ts` → `push_subscriptions`,`push_logs`,`tenants` |

**이 영역이 식당OS `/buy`의 공급 쪽이다.** 여기서 등록한 `commerce_product_listings`가 식당OS 상품 목록에 뜬다.

> 운영 실측: `commerce_product_listings` **38행 · 2026-09-07** / `commerce_orders` 9행 · 2026-07-31 / `ingredient_master` 3행 / `ingredient_mappings` 3행 / **`pricing_policies` 0행 / `pricing_policy_targets` 0행 / `shipping_groups` 0행 / `coupons` 0행 / `push_subscriptions` 3행.**
> 🚧 `commerce-listing-transfer.ts`의 **P3 이관(새 공급자 상품 생성 + 원가 분리)** 은 main에 반영돼 있고, **매입가 상한(1,000만원)** 도 반영돼 있다. 반면 **"원가 미확정" 표시·대량등록 매입가 선택입력**은 dev 전용.

---

## 6. 💰 매출/정산 — 3화면

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| **정산 현황** | `/admin/settlements` | 플랫폼 정산 통제 | `admin/settlement-control.ts` → `action_queue`,`admin_logs`,`admin_settings`,`customers`,`orders`,`payments`,`tenants`,`trust_scores` |
| **지급 예정** | `/admin/commerce/allocations` | 커머스 주문별 공급자 지급 배분 | `admin/commerce-allocation.ts` → `commerce_order_allocations`,`commerce_order_items`,`commerce_orders`,`commerce_product_listings`,`products`,`payments`,`supplier_payables`,`tenants`,`users`,`admin_logs`,`admin_settings` |
| **공급자 지급 원장** | `/admin/commerce/payables` | 공급자별 미지급·지급 이력 | `admin/supplier-payables.ts` → `supplier_payables`,`payments`,`tenants`,`admin_logs` |

**부가**: `admin/commerce-reversal.ts`(주문 취소·환불 — `commerce_orders`,`payments`,`supplier_payables`), `admin/platform-revenue.ts`(플랫폼 수익 집계)

> 운영 실측: **`supplier_payables` 0행** / `commerce_order_allocations` 2행 / `trust_scores` 0행.
> 커머스 주문이 9건뿐이라 정산 파이프라인은 사실상 미가동.

---

## 7. 🧬 이상거래 확인 — `/admin/trades` (2화면)

| 화면 | 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|---|
| 이상거래 목록 | `/admin/trades` | 의심 거래 탐지 목록 | `admin/trade-monitor.ts` → `action_queue`,`admin_logs`,`customers`,`order_logs`,`orders`,`payments`,`rfq_bids`,`rfq_requests`,`trust_scores` / `admin/action-queue.ts` |
| 이상거래 상세 | `/admin/trades/[id]` | 단건 조사 | `admin/trade-monitor.ts` |

**연관**: `admin/trust-engine.ts` (신뢰도 엔진 — `trust_scores`,`trust_score_logs`,`relationships`,`contact_logs`,`customers`,`orders`,`payments`,`rfq_requests`,`tenants`,`action_queue`,`admin_logs` — **11테이블**)

> 운영 실측: **`trust_scores` 0행 / `trust_score_logs` 0행 / `relationships` 0행 / `action_queue` 0행.**
> **신뢰도·이상거래 엔진은 한 번도 데이터를 만든 적이 없다.**

---

## 8. ⚙️ 설정 — `/admin/policy`

| 항목 | 내용 |
|---|---|
| **하는 일** | 플랫폼 운영 정책 콘솔 (정산 규칙·신뢰도 임계값 등) |
| **쓰는 데이터** | `admin/policy-console.ts` → `admin_settings`, `admin_logs`, `customer_stats`, `rfq_requests`, `sales_schedules`, `trust_scores` |

> 운영 실측: `admin_settings` **19행** — 실제로 쓰이고 있다.

---

## 9. 🧾 활동 기록 — `/admin/logs`

| 항목 | 내용 |
|---|---|
| **하는 일** | 관리자 작업 감사 로그 열람 |
| **쓰는 데이터** | `actions/admin.ts` → `admin_logs`, `tenants`, `users` |

> 운영 실측: `admin_logs` **455행 · 2026-09-08** — **관리자OS에서 가장 활발한 테이블.** 감사 로그는 잘 쌓이고 있다.

---

## 10. 사이드바에 없는 화면 3개

| 경로 | 하는 일 | 쓰는 데이터 |
|---|---|---|
| `/admin/participants` | 참여자(식당·공급자) 신뢰도 목록 | `admin/trust-engine.ts` (11테이블) |
| `/admin/participants/[id]` | 참여자 1명 상세 | 동일 |
| `/admin/participants/relationships` | 참여자 간 거래 관계망 | 동일 (`relationships`) |

> 08-31 사이드바 재구성(12→8)에서 **빠졌지만 화면은 남아 있다.** URL을 직접 치면 열린다.

## 11. 🔴 렌더링 불가능한 잔재 파일 4개 (1차 `D-고아-01` 확인)

```
src/app/(admin)/participants/participants-client.tsx
src/app/(admin)/participants/relationships/relationships-client.tsx
src/app/(admin)/policy/PolicyConsoleClient.tsx
src/app/(admin)/settlements/SettleOrderButton.tsx
```
- 이 디렉터리들에는 **`page.tsx`가 없다.** 따라서 라우트가 만들어지지 않고 **어떤 URL로도 도달 불가**다.
- 최신본은 각각 `(admin)/admin/participants/`, `(admin)/admin/policy/`, `(admin)/admin/settlements/` 아래에 있다.
- 1차 조사 `C-09`(어느 쪽이 의도된 최신인지 사람 확인 필요)가 아직 미결이다.

---

## 12. `actions/admin/*` 모듈 ↔ 테이블 전체 대응표

| 모듈 | 참조 테이블 |
|---|---|
| `trust-engine.ts` | `action_queue`,`admin_logs`,`contact_logs`,`customers`,`orders`,`payments`,`relationships`,`rfq_requests`,`tenants`,`trust_score_logs`,`trust_scores` |
| `commerce-allocation.ts` | `admin_logs`,`admin_settings`,`commerce_order_allocations`,`commerce_order_items`,`commerce_orders`,`commerce_product_listings`,`payments`,`products`,`supplier_payables`,`tenants`,`users` |
| `commerce.ts` | `admin_logs`,`commerce_order_allocations`,`commerce_orders`,`commerce_product_listings`,`payments`,`product_categories`,`product_costs`,`product_stats`,`products`,`shipping_groups`,`supplier_payables`,`tenants`,`users` |
| `trade-monitor.ts` | `action_queue`,`admin_logs`,`customers`,`order_logs`,`orders`,`payments`,`rfq_bids`,`rfq_requests`,`trust_scores` |
| `settlement-control.ts` | `action_queue`,`admin_logs`,`admin_settings`,`customers`,`orders`,`payments`,`tenants`,`trust_scores` |
| `dashboard-metrics.ts` | `commerce_orders`,`coupon_uses`,`coupons`,`customers`,`orders`,`payments`,`sales_leads`,`tenants`,`users` |
| `commerce-listing-transfer.ts` | `admin_logs`,`commerce_order_allocations`,`commerce_order_items`,`commerce_orders`,`commerce_product_listings`,`product_costs`,`products`,`tenants` |
| `policy-console.ts` | `admin_logs`,`admin_settings`,`customer_stats`,`rfq_requests`,`sales_schedules`,`trust_scores` |
| `platform-revenue.ts` | `commerce_orders`,`orders`,`payments`,`supplier_payables`,`tenants` |
| `pricing-policies.ts` | `commerce_product_listings`,`pricing_policies`,`pricing_policy_targets`,`tenants` |
| `sales-promo.ts` | `coupon_uses`,`coupons`,`sales_leads`,`tenants` |
| `supplier-payables.ts` | `admin_logs`,`payments`,`supplier_payables`,`tenants` |
| `commerce-reversal.ts` | `admin_logs`,`commerce_orders`,`payments`,`supplier_payables` |
| `sales-leads.ts` | `sales_lead_notes`,`sales_leads`,`tenants` |
| `sales-lead-sms.ts` | `sales_lead_notes`,`sales_leads` |
| `push.ts` | `push_logs`,`push_subscriptions`,`tenants` |
| `bulk-listing.ts` | `commerce_product_listings`,`product_categories` |
| `ingredient-master.ts` | `ingredient_mappings`,`ingredient_master` |
| `coupons.ts` | `coupon_uses`,`coupons` |
| `action-queue.ts` | `action_queue`,`admin_logs` |
| `storefront-bank-transfer.ts` | `admin_logs`,`admin_settings` |
| `subscription.ts` | `tenants` |
| 🚧 `field-observations.ts` | `field_observations` |
| `ai-product-analysis.ts` | (테이블 직접 참조 없음 — OpenAI 호출) |

---

## 13. 관리자OS 전체 요약 — 무엇이 살아 있고 무엇이 비어 있나

| 영역 | 근거 데이터 | 판정 |
|---|---|---|
| 활동 기록 | `admin_logs` 455행 · 09-08 | **활발** |
| 쇼핑몰 상품관리 | `commerce_product_listings` 38행 · 09-07 | **활발** |
| 회원관리 | `tenants` 8 · `users` 6 | 소규모지만 사용 |
| 설정(정책) | `admin_settings` 19행 | 사용 |
| 쇼핑몰 주문처리 | `commerce_orders` 9행 · 07-31 | 저조 |
| 영업/가입관리 | `sales_leads` **0행** | **미사용** |
| 정산·지급 | `supplier_payables` **0행** | **미사용** |
| 이상거래·신뢰도 | `trust_scores`/`trust_score_logs`/`relationships`/`action_queue` **전부 0행** | **한 번도 안 돌았음** |
| 가격 정책 | `pricing_policies`/`pricing_policy_targets` **0행** | **미사용** |
| 쿠폰·푸시 | `coupons` 0행 / `push_subscriptions` 3행 | 거의 미사용 |

> **읽는 방법**: 관리자OS는 **커머스 상품 운영과 감사 로그**만 실제로 돌아간다. 정산·신뢰도·이상거래·가격정책은 **화면과 코드가 완성돼 있지만 데이터가 0행**이다.
