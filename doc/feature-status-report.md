# feature-status-report.md — 기능 실제 작동 여부 검증 (4단계)

- 조사일: 2026-09-09 18:43~19:15
- 대상: `RealMyOS`(공급자OS·관리자OS) / `restaurant-os`(식당OS)
- 성격: 읽기 전용. **운영 DB에 `SELECT`만 실행했다.** 쓰기 0건 / 코드 수정 0건

---

## 0. 판정 방법 — 근거 3종을 모두 썼다

| # | 방법 | 무엇을 알 수 있나 |
|---|---|---|
| **A. 코드↔스키마 자동 대조** | 두 레포 전 `.ts/.tsx`에서 `.from('T')` 체인의 `select`·필터 컬럼을 파싱 → 운영 `information_schema`와 대조. **`dev`와 `origin/main` 양쪽 모두 스캔** | "화면이 없는 컬럼을 부르는가" |
| **B. 운영 데이터 실측** | 96개 테이블 행 수·최종 활동일 (1차 조사 + 2차 재확인) | "그 기능을 실제로 쓰는가" |
| **C. 라이브 쿼리 재현** 🆕 | **코드에 있는 select 문자열을 그대로 운영 DB에 실행.** E2E 계정(restaurant/supplier) 세션 JWT 사용 | "정말 에러가 나는가" — 추정이 아닌 실측 |

> **C가 이번 2차의 새로운 점이다.** 1차는 컬럼 존재 여부만 개별 확인했지만, 이번엔 **화면이 실제로 던지는 쿼리를 그대로 던져 응답 코드를 받았다.**

### 판정 등급

| 등급 | 뜻 |
|---|---|
| 🟢 **정상** | 코드-스키마 일치 + 쿼리 성공 |
| 🟡 **부분작동** | 화면은 뜨지만 일부가 비거나 조용히 실패 |
| 🔴 **작동안함** | 진입 시 에러 또는 기능 자체가 성립 불가 |
| ⚫ **빈 껍데기** | 코드는 정상인데 **데이터가 0행**이라 보여줄 게 없음 |

### ⚠️ 가장 중요한 전제 — **운영에 배포된 것은 `main`이다**

`dev`에서 고쳐진 것이 운영에서는 아직 깨져 있다. 그래서 **모든 판정을 `운영(main)` / `dev` 두 열로 나눠 적었다.**

| | 코드↔스키마 불일치 건수 |
|---|---|
| RealMyOS `main`(운영) | **4** |
| RealMyOS `dev` | **4** (변화 없음) |
| restaurant-os `main`(운영) | **10** |
| restaurant-os `dev` | **6** |

---

## 1. 🔴 운영에서 지금 깨져 있는 것 — 라이브 쿼리로 확인한 8건

아래는 전부 **운영 DB에 실제로 던져서 받은 응답**이다.

| # | 화면 | 코드 위치 (main) | 실행 결과 |
|---|---|---|---|
| **F-01** | 식당OS **홈** `/today` | `actions/today.ts:73` | `42703 column ingredients.supplier_name does not exist` |
| **F-02** | 식당OS **내역** `/orders` | `actions/orders.ts:279` | `42703 column rfq_bids.tenant_id does not exist` |
| **F-03** | 식당OS **거래처** `/suppliers` 3화면 | `actions/suppliers.ts`, `actions/import.ts` | `PGRST205 Could not find the table 'public.suppliers'` |
| **F-04** | 식당OS **명세서 OCR** (홈 카드) | `actions/import.ts:65` | `42703` × 5컬럼 (`barcode`,`brand`,`manufacturer`,`parsed_name`,`possible_duplicate_group_id`) |
| **F-05** | 식당OS **식자재** `/settings/ingredients` | `actions/ingredients.ts:860` | `42703 column ingredients.supplier_name does not exist` |
| **F-06** | 식당OS **발주 상세** `/rfq/[id]` | `actions/rfq.ts:309` | `42703 column orders.counterparty_name does not exist` |
| **F-07** | 공급자OS **메시지 템플릿** `/settings/messages` | `actions/message-template.ts` | `PGRST205 Could not find the table 'public.message_templates'` |
| **F-08** | 공급자OS **견적 내보내기** | `actions/quote-export.ts:49` | `42703 column quotes.deleted_at does not exist` |

**추가 2건** (공급자OS, 호출자 없음 = 죽은 코드)
| `product.ts:996` `getProductCostHistory` | `42703 column product_costs.tenant_id does not exist` |
| `product.ts:1348` | `42703 column product_stats.id does not exist` — **`id` 컬럼조차 없다** (1차가 `tenant_id`만 지적했으나 실제로는 더 심각) |

### 🔴 F-01 이 가장 중요하다 — 식당OS 홈의 핵심 기능이 **무음으로** 죽어 있다

`main`의 `actions/today.ts`:
```ts
supabase.from('ingredients')
  .select('id, name, unit, current_price, supplier_name, created_at, barcode, brand,
           parsed_name, possible_duplicate_group_id, group_confirmed_same_at')   // ← 6개가 없는 컬럼
  .eq('tenant_id', tenant_id).eq('is_active', true)
...
const ingList = ingredients ?? []                    // ← 에러면 조용히 빈 배열
const savingCandidates = ingList.filter(...).slice(0, 3)
```

| | |
|---|---|
| **증상** | 홈 화면은 **정상적으로 뜬다.** 에러 메시지도 없다. 다만 **「AI 절약 제안」 카드가 영원히 비어 있다** |
| **원인** | `Promise.all` 안의 `ingredients` 조회가 `42703`으로 실패 → `?? []` 로 흡수 |
| **판정** | 🟡 **부분작동 (무음 실패)** — 1차 조사가 만든 「무음 실패」 등급에 해당 |
| **dev 상태** | ✅ 고쳐져 있다 (`e5db7c0`, 09-08). **미배포** — 1단계 「J 묶음」 |
| **실측** | dev 버전 쿼리(`id,name,unit,current_price,created_at`)는 `[]` 정상 응답 |

### F-02 도 같은 형태다

```ts
const { data: bids } = await supabase.from('rfq_bids')
  .select('id, delivery_days').eq('tenant_id', tenant_id).in('id', bidIds)   // ← tenant_id 없음
for (const b of bids ?? []) { ... }        // ← 조용히 흡수
```
→ 주문 내역의 **예상 배송일이 항상 빈칸**. 에러는 안 보인다. 🟡 부분작동(무음).

---

## 2. 식당OS 화면별 판정 (43화면)

| 화면 | 경로 | 운영(main) | dev | 근거 |
|---|---|---|---|---|
| **홈** | `/today` | 🟡 무음실패 | 🟢 | F-01 |
| 상품 목록 | `/buy` | 🟢 | 🟢 | 식당 세션 실측 리스팅 **10건 조회됨** |
| 상품 상세 | `/buy/products/[id]` | 🟢 | 🟢 | |
| 장바구니 | `/buy/cart` | 🟢 | 🟢 | 식당 세션 `cart_items` **3건** |
| 결제 | `/buy/checkout` | 🟢 | 🟢 | ⚠️ dev의 토스 키 분리(`1dd3feb`) 미배포 — 배포 시 환경변수 확인 필수 |
| 결제 성공/실패 | `/buy/checkout/success`·`/fail` | 🟢 | 🟢 | |
| 구매 내역 | `/buy/orders` | 🟢 | 🟢 | `commerce_orders` **8건 조회됨** |
| 구매 상세 | `/buy/orders/[id]` | 🟢 | 🟢 | 타임라인·취소·문의는 dev 전용 |
| **찜 목록** | `/buy/wishlist` | ⛔ **라우트 없음** | ⚫ 빈껍데기 | main에 파일 자체가 없음. dev는 정상이나 `wishlist_items` 0행 |
| **주문 내역** | `/orders` | 🟡 무음실패 | 🟢 | F-02 (배송일 빈칸) |
| 주문 상세 | `/orders/[id]` | ⚫ | ⚫ | 식당 세션 `orders` **0행** |
| 입찰 결과 | `/orders/results` | ⚫ | ⚫ | `rfq_bids` 전체 0행 |
| **발주 목록** | `/rfq` | ⚫ | ⚫ | `rfq_requests` 전체 **0행** |
| 새 발주 | `/rfq/new` | ⚫ | ⚫ | `ingredients` 0행이라 선택할 게 없음 |
| **발주 상세** | `/rfq/[id]` | 🔴 | 🟢 | F-06 |
| **거래처** 3화면 | `/suppliers`, `/[id]`, `/new` | 🔴 **테이블 없음** | 🔴 **동일** | F-03. **dev에서도 안 고쳐졌다** |
| 돈관리 4화면 | `/money/*` | ⚫ | ⚫ | 식당 세션 `payments` 0행 |
| 설정 허브 | `/settings` | 🟢 | 🟢 | `menus` 조회 일원화(`c6f7f69`) 반영됨 |
| 식당 정보 | `/settings/restaurant` | 🟢 | 🟢 | |
| 계정·알림 | `/settings/account`·`/notifications` | 🟢 | 🟢 | |
| **식자재** | `/settings/ingredients` | 🔴 | 🟢 | F-05 |
| 메뉴 | `/settings/menus` | ⚫ | ⚫ | `menus` 2행(전체) · 식당 세션 0행 |
| 고정비 | `/settings/fixed-costs` | ⚫ | ⚫ | `fixed_costs` 15행(전체) · 식당 세션 0행 |
| 구독 | `/subscribe` | 🟢 | 🟢 | 전 tenant `free` |
| 알림함 | `/notifications` | ⚫ | ⚫ | `notifications` 0행 |
| 로그인·약관 등 | `/login`,`/privacy`,`/terms`,`/onboarding`,`/pending` | 🟢 | 🟢 | HTTP 200 실측 |
| `/admin` (식당OS 내) | `/admin` | 🟢 | 🟢 | 5단계에서 별도 논의 |

---

## 3. 공급자OS 화면별 판정 (45화면)

공급자 E2E 세션으로 실측한 가시 행수:
```
customers 4 · orders 3 · payments 6 · products 15 · product_costs 3
quotes 1 · purchases 1 · accounts 1 · settings 11 · sales_scripts 6 · contact_logs 1
order_lines 0 · fund_rules 0 · sales_schedules 0 · action_logs 0 · customer_stats 0
```

| 화면 | 경로 | 운영(main) | dev | 근거 |
|---|---|---|---|---|
| 대시보드 | `/dashboard` | 🟢 | 🟢 | |
| 거래처 목록·상세·수정·등록 | `/customers/*` | 🟢 | 🟢 | `customers` 4건 조회됨 |
| **거래처 원장** | `/customers/[id]/ledger` | 🟡 | 🟡 | `customer_stats` 세션 **0행** · 전체도 11/138(8%) — 통계 칸이 대부분 빔 |
| 원장관리 | `/ledger` | 🟡 | 🟡 | 동일 |
| 주문 목록·상세·수정·등록 | `/orders/*` | 🟢 | 🟢 | `orders` 3건 |
| **견적 3화면** | `/quotes/*` | 🟡 | 🟡 | 목록·상세는 뜨나 **내보내기(F-08)가 깨짐.** `quotes` 1행 |
| **견적 중복 3화면** | `/orders/quotes/*` | ⚠️ 중복 | ⚠️ 중복 | 액션 import 0 — 5단계 |
| 발주요청 | `/rfq`, `/rfq/[id]` | ⚫ | ⚫ | `rfq_requests`/`rfq_bids` 전체 0행 |
| 상품 목록·상세·수정·등록 | `/products/*` | 🟢 | 🟢 | `products` 15건 |
| — 원가 미확정 표시 | `/products` | ⛔ 없음 | 🟢 | dev 전용 (1단계 「C 묶음」) |
| 대량 등록 | `/products/bulk` | 🟡 | 🟢 | 매입가 선택입력(`8d2e5a7`) 미배포 |
| 수금 3화면 | `/payments/*` | 🟢 | 🟢 | `payments` 6건 |
| 지급 목록·등록 | `/disbursements/*` | 🟢 | 🟢 | |
| **지급 상세** | — | ⛔ **미구현** | ⛔ | 사이드바가 `soon: true`로 표시 |
| 매입 2화면 | `/purchases/*` | ⚫ | ⚫ | `purchases` 1행 |
| **자금 2화면** | `/funds/*` | ⚫ | ⚫ | **`fund_rules` 0행 / `fund_transfers` 0행** — 규칙이 없어 배분이 일어나지 않음 |
| **매출분석** | `/analytics` | 🟡 **수치 오염** | 🟢 | `order_lines.cost_price<=1` 이 **64/522(12.3%)**. main은 이걸 원가·순이익·마진율에 그대로 포함. dev는 제외 + 경고 표시 |
| 설정 | `/settings` | 🟢 | 🟢 | `settings` 11건 |
| 운영분류 | `/settings/tags` | 🟢 | 🟢 | |
| **메시지 템플릿** | `/settings/messages` | 🔴 | 🔴 | F-07. **dev에서도 안 고쳐졌다** |
| **자동화영업 4화면** | `/sales/*` | ⚫ | ⚫ | `sales_schedules` 세션 0행 · `action_logs` 세션 **0행** |
| **자동화영업 중복 3개** | `/automation/*` | ⚠️ 레이아웃 없음 | ⚠️ | 5단계 |
| 구독 | `/subscribe` | 🟢 | 🟢 | |
| 인증 화면 | `/login` 등 | 🟢 | 🟢 | HTTP 200 실측 |

### 🟡 `/analytics` — "깨지진 않았는데 숫자가 틀리다"

가장 조용하고 가장 위험한 유형이다.

| | |
|---|---|
| 증상 | 매출분석이 **정상적으로 뜨고 숫자도 나온다** |
| 문제 | 그 숫자가 **원가가 확정되지 않은 라인 64건(12.3%)을 포함**해 계산된 값이다 |
| 결과 | 마진율·순이익이 실제보다 **높게** 나온다 (원가를 1원 이하로 잡으므로) |
| dev | ✅ 제외 + `CostCoverageNotice` 경고 배너 (`1be345b`, `b42cf8c`) |
| 배포 | ❌ 미배포. 6개 커밋 한 덩어리 |

---

## 4. 관리자OS 화면별 판정 (23화면)

> 관리자 E2E 계정은 로그인에 실패했다(`E2E_ADMIN_EMAIL`/비밀번호 불일치). 따라서 **관리자OS는 세션 실측 없이 A·B 근거만으로 판정**했다. 한계로 명시한다.

| 화면 | 경로 | 판정 | 근거 |
|---|---|---|---|
| 홈 | `/admin/dashboard`, `/[metric]` | 🟢 | 코드-스키마 일치 |
| 리드 관리 | `/admin/sales` | ⚫ | `sales_leads` **0행** |
| — 관찰기록 탭 | `/admin/sales` | ⛔ **미배포** | dev 전용. **운영 DB엔 `field_observations` 3행이 이미 있다** |
| 리드 상세 | `/admin/sales/leads/[id]` | ⚫ | 동일 |
| 프로모션 코드 | `/admin/sales/promo` | ⚫ | `coupons` 0행 |
| 회원관리 | `/admin/tenants` | 🟢 | `tenants` 8 · `users` 6 |
| **상품관리** | `/admin/commerce/products` | 🟢 | `commerce_product_listings` 38행 · 09-07 |
| 리스팅 등록·수정·대량 | `/admin/commerce/products/*` | 🟢 | 이관·상한 반영됨 |
| 카테고리 | `/admin/commerce/categories` | 🟢 | `product_categories` 29행 |
| 식자재 마스터 | `/admin/commerce/ingredients` | 🟡 | `ingredient_master` 3행 + **RLS 정책 0개** (2단계 §6-1) |
| 주문처리 | `/admin/commerce/orders` | 🟡 | `commerce_orders` 9행 · **최종 07-31** |
| **가격 정책** | `/admin/commerce/pricing` | ⚫ | `pricing_policies` **0행** / `pricing_policy_targets` **0행** |
| 무통장 입금 | `/admin/commerce/storefront-bank` | 🟢 | `admin_settings` 19행 |
| **쿠폰 관리** | `/admin/coupons` | ⚫ + 🟡 | `coupons` 0행 + **RLS 정책 0개** → 사용자 세션 접근 불가 |
| **푸시 알림** | `/admin/push` | 🟡 | `push_subscriptions` 3행 + **RLS 정책 0개** |
| **정산 현황** | `/admin/settlements` | ⚫ | `supplier_payables` **0행** |
| 지급 예정 | `/admin/commerce/allocations` | ⚫ | `commerce_order_allocations` 2행 |
| 공급자 지급 원장 | `/admin/commerce/payables` | ⚫ | `supplier_payables` 0행 |
| **이상거래 2화면** | `/admin/trades`, `/[id]` | ⚫ | `trust_scores`/`trust_score_logs`/`relationships`/`action_queue` **전부 0행** |
| 설정(정책) | `/admin/policy` | 🟢 | `admin_settings` 19행 |
| **활동 기록** | `/admin/logs` | 🟢 | `admin_logs` **455행 · 09-08** — 가장 활발 |
| 참여자 3화면 | `/admin/participants/*` | ⚫ | 사이드바에 없음 + `relationships` 0행 |
| **잔재 4파일** | `(admin)/participants|policy|settlements` | ⛔ **도달 불가** | `page.tsx`가 없어 라우트가 생성되지 않음 |

---

## 5. ⚠️ 지금은 안 터지지만 조건이 갖춰지면 터지는 것

### G-01. `order_lines` RLS가 `orders` RLS보다 좁다 — **시한폭탄**

```
orders      USING (tenant_id = get_my_tenant_id()
                   OR seller_tenant_id = get_my_tenant_id()
                   OR buyer_tenant_id  = get_my_tenant_id()
                   OR is_admin())
order_lines USING (order_id IN (SELECT id FROM orders WHERE tenant_id = get_my_tenant_id())
                   OR is_admin())          ← seller/buyer 축이 없다
```

**의미**: 주문을 `seller_tenant_id` 또는 `buyer_tenant_id`로만 볼 수 있는 사용자는 **주문 헤더는 보이는데 라인 항목이 0건**이 된다. 주문 상세 화면이 "품목 없음"으로 뜬다.

**현재 상태 — 실측**
```
orders 총 284건
  seller_tenant_id ≠ tenant_id : 0건
  buyer_tenant_id  ≠ tenant_id : 0건
  이 조건에 걸리는 order_lines : 0건
```
→ **지금은 아무 피해가 없다.** 모든 주문이 `tenant_id == seller_tenant_id`이기 때문이다.

**언제 터지나**: 커머스 이관(`commerce-listing-transfer.ts`)·크로스 tenant 주문처럼 **소유 축이 갈라지는 순간**이다. 그 방향은 이미 09-08~09-09 작업의 방향이다(1단계 §3 커밋 15·19~21). 1차 조사 `R-02`/`R-03`(원가 축 분리)과 같은 뿌리다.

### G-02. `orders.buyer_tenant_id` / `order_source`가 100% NULL

1차 실측 그대로다(284/284 NULL). `orders` RLS가 `buyer_tenant_id`를 조건에 넣고 있지만 **그 값이 한 번도 채워진 적이 없다.** 즉 RLS의 그 절은 현재 **아무것도 매칭하지 않는 죽은 조건**이다.

### G-03. RLS 정책 0개 테이블이 기능을 조용히 막는다

`ingredient_master`, `ingredient_mappings`, `ingredient_price_history`, `ingredient_unit_history`, `coupons`, `coupon_uses`, `push_logs`, `push_subscriptions` 등 **17개**가 RLS는 켜져 있는데 정책이 없다 → 사용자 세션에서 **무조건 0행**.
→ 식자재 컬럼(F-04·F-05)을 다 고쳐도 **사용자 세션에서는 여전히 안 보인다.** 2단계 §6-1 / `schema-mismatch-report.md` §6.

---

## 6. 종합 — 숫자로 본 상태

| 판정 | 식당OS | 공급자OS | 관리자OS | 계 |
|---|---|---|---|---|
| 🟢 정상 | 14 | 20 | 8 | **42** |
| 🟡 부분작동 | 2 | 6 | 4 | **12** |
| 🔴 작동안함 | 5 | 4 | 0 | **9** |
| ⚫ 빈 껍데기 (데이터 0행) | 15 | 12 | 10 | **37** |
| ⛔ 미배포·미구현·도달불가 | 1 | 3 | 2 | **6** |

### 이 표에서 읽어야 할 것

1. **가장 큰 덩어리는 「깨진 것」이 아니라 「빈 껍데기」다 (37화면).**
   코드도 화면도 완성돼 있는데 **데이터가 0행**이다. 발주(RFQ)·신뢰도·정산·가격정책·자금배분·자동화영업이 전부 여기 해당한다.
   → 고칠 대상이 아니라 **"쓸 것인가 접을 것인가"를 정할 대상**이다. 1차 조사의 `C-01`~`C-04`가 아직 미결인 이유다.

2. **🔴 9건 중 6건은 dev에서 이미 고쳐졌고 배포만 안 됐다.**
   배포 하나로 식당OS의 🔴 5건 중 4건이 사라진다 (1단계 「J 묶음」).
   **남는 진짜 미해결은 `suppliers`(F-03)와 `message_templates`(F-07) 둘뿐이고, 둘 다 "테이블을 만들 것인가 기능을 뗄 것인가"라는 제품 결정 대기 상태다** (`C-02`,`C-03`).

3. **🟡 12건이 가장 위험하다.** 에러가 안 보이기 때문이다.
   특히 `/today`(F-01)와 `/analytics`(원가 오염)는 **사용자도 개발자도 문제를 알 수 없다.**

---

## 7. 이번 단계에서 확인하지 못한 것

| # | 항목 | 이유 |
|---|---|---|
| 1 | 관리자OS의 세션 기반 실측 | `E2E_ADMIN_EMAIL` 로그인 실패. A·B 근거로만 판정 |
| 2 | 브라우저로 실제 화면 렌더링 확인 | 브라우저 자동화를 쓰지 않았다. 운영 사이트는 미들웨어가 모든 `(app)` 경로를 `/login`으로 307시켜 비로그인 프로브가 무의미 |
| 3 | INSERT/UPDATE 경로의 작동 | **쓰기 금지.** 조회 경로만 검증했다. "등록/수정 버튼이 실제로 저장되는가"는 미검증 |
| 4 | `SECURITY DEFINER` 함수 21개를 거치는 경로 | RLS를 우회하므로 위 세션 실측으로는 판정 불가. `improvement-suggestions.md` I-28 |
| 5 | 클라이언트 컴포넌트만 있는 화면(`/payments/new`, `/products/bulk` 등)의 쿼리 | 서버 액션 import가 없어 정적 추적이 닿지 않음 |
| 6 | 데이터가 0행인 37화면이 **데이터가 있을 때** 정상 동작하는지 | 데이터를 넣어야 알 수 있고, 그건 쓰기다 |

---

# 【2차 심화】 2026-09-09 — §7 미확인 항목 2건 해소 + 판정 1건 정정

## 8. §7-5 해소 — 클라이언트 컴포넌트만 있던 화면 6개의 실제 경로

§7-5에 "서버 액션 import가 없어 정적 추적이 닿지 않음"으로 남긴 화면들이다. 클라이언트 컴포넌트를 한 단계 더 따라가 확인했다.

| 화면 | 클라이언트 컴포넌트 | 실제 호출 서버 액션 | 판정 |
|---|---|---|---|
| `/payments/new` | `payment/PaymentCreateForm` | `payment`, `customer-deposits`, `order` | 🟢 정상 |
| `/products/bulk` | `product/ProductBulkUpload` | `product` | 🟢 정상 |
| `/purchases/new` | `purchases/PurchaseCreateClient` | `purchase` | 🟢 정상 |
| `/admin/push` | `admin/PushSendClient` | `admin/push` | 🟡 코드 정상 · `push_subscriptions` 정책 0개 |
| `/admin/commerce/products/new` | `commerce/ListingFormClient` | `admin/commerce`, `admin/ai-product-analysis` | 🟢 정상 |
| `/admin/commerce/products/bulk` | `commerce/BulkListingUploader` | `admin/bulk-listing` | 🟢 정상 |

**→ 「추적 불가」였을 뿐 전부 정상 동작하는 화면이었다.** §6 종합 집계에 변화 없다.

## 9. ⚠️ 판정 정정 — `/orders/quotes/*`와 `/sales`는 리다이렉트다

§3 표에서 `/orders/quotes/*` 3화면을 「⚠️ 중복 — 액션 import 0」으로 적었다. **파일을 열어보니 의도된 legacy 리다이렉트였다.**

```tsx
(app)/orders/quotes/page.tsx        → redirect('/quotes')
(app)/orders/quotes/[id]/page.tsx   → redirect(`/quotes/${params.id}`)
(app)/orders/quotes/new/page.tsx    → redirect('/quotes/new')
(app)/sales/page.tsx                → redirect('/sales/schedule')
```

**정정 판정: 🟢 정상 (옛 URL 호환 처리).** 정리 대상이 아니다.

반면 **`/automation/*` 3개는 문제가 맞다** — `redirect`가 아니라 **컴포넌트 re-export**이고, `src/app/automation/`에 `layout.tsx`가 없어 `(app)` 레이아웃 밖에서 **사이드바 없이 렌더링된다.**

```tsx
src/app/automation/schedule/page.tsx
  import SalesSchedulePage from '@/app/(app)/sales/schedule/page'
  export default SalesSchedulePage          // 리다이렉트 아님
```

## 10. 🔴 §5에 추가 — RLS를 우회하는 실행 경로

§5(지금은 안 터지지만 조건이 갖춰지면 터지는 것)에 `G-04`를 추가한다.

### G-04. `SECURITY DEFINER` 함수 21개가 전부 익명에게 열려 있다

| 항목 | 실측 |
|---|---|
| `SECURITY DEFINER` 함수 | 21 |
| `anon`에 `EXECUTE` 부여 | **21 (전부)** |
| 그중 `p_tenant_id`를 받으면서 **검증이 없는** 것 | **5** (`create_payment_atomic`, `upsert_savings_stat`, `generate_fund_transfers`, `redeem_coupon`, `bulk_create_products`) |
| `SET search_path` 누락 | 3 |

`create_payment_atomic`은 `payments`에 `status='confirmed'`로 INSERT하는 함수다. 같은 수금 흐름의 형제 함수 4개에는 `get_my_tenant_id()` 대조 + `RAISE`가 있는데 **이 함수에만 없다.**

**읽기 전용 실측**
```
POST /rest/v1/rpc/fetch_active_pricing_policies_for_checkout
     (익명 키 · 남의 tenant id)  → HTTP 200   ← 거부되지 않는다
```
**쓰기 RPC는 시도하지 않았다.** 운영 데이터가 바뀌기 때문이다.

**G-01(order_lines RLS 비대칭)과의 차이**: G-01은 소유 축이 갈라질 때 터지는 **잠재** 문제인데, **G-04는 조건이 이미 갖춰져 있다.** 다만 실제 악용 여부는 확인하지 않았다.

전체 근거: `overnight-audit-log.md` §10 / `design-risk-report.md` R-11.

## 11. §6 종합 표 — 변화 없음

| 판정 | 식당OS | 공급자OS | 관리자OS | 계 |
|---|---|---|---|---|
| 🟢 정상 | 14 | **23** (+3, `/orders/quotes/*` 정정) | 8 | **45** |
| 🟡 부분작동 | 2 | 6 | 4 | 12 |
| 🔴 작동안함 | 5 | 4 | 0 | 9 |
| ⚫ 빈 껍데기 | 15 | 12 | 10 | 37 |
| ⛔ 미배포·미구현·도달불가 | 1 | 3 | 2 | 6 |

> 정정으로 「⚠️ 중복」 3건이 🟢로 이동했다. **깨진 것의 수에는 변화가 없다.**

## 12. §7 갱신 — 남은 미확인 항목

| # | 항목 | 상태 |
|---|---|---|
| 1 | 관리자OS 세션 실측 | ⛔ `E2E_ADMIN_EMAIL` 로그인 실패. 그대로 |
| 2 | 브라우저 렌더링 확인 | ⛔ 그대로 |
| 3 | INSERT/UPDATE 경로 작동 | ⛔ 쓰기 금지. 다만 §10에서 **권한 구조로는 판정**했다 |
| 4 | `SECURITY DEFINER` 경유 경로 | ✅ **해소** — §10 |
| 5 | 클라이언트 전용 화면의 쿼리 | ✅ **해소** — §8 |
| 6 | 0행 37화면이 데이터가 있을 때 도는지 | ⛔ 그대로 (쓰기 필요) |
