# connection-gap-report.md — 화면·앱 간 연결 상태 점검 (5단계)

- 조사일: 2026-09-09 18:48~19:10
- 질문: **"A에서 만든 데이터를 B가 제대로 쓰는가? 아무 데도 안 이어진 고립 기능(섬)이 있는가?"**
- 방법: 3단계 기능 맵의 테이블 대응표 + **운영 DB 연결 컬럼 실측**(외래키가 실제로 채워졌는지)
- 성격: 읽기 전용. `SELECT`만 실행

---

## 0. 요약 — 한 장으로 본 연결 상태

```
[관리자OS]                    [식당OS]                    [공급자OS]
상품관리 38 리스팅 ──✅──▶ /buy 상품목록 ──✅──▶ 장바구니 4 ──✅──▶ 커머스주문 9
    │                                                              │
    │ 공급자 지정                                                  │ ERP 반영
    ▼ ❌ 2/38 만 지정                                              ▼
지급예정 배분 2/8 ──❌ 0건──▶ 공급자 지급원장 0  ◀────── 공급자OS 지급/정산
                                    ↑ 여기서 완전히 끊긴다

[식당OS] 발주 RFQ 0 ──❌──▶ [공급자OS] 입찰 0 ──❌──▶ 주문 전환 0
[공급자OS] 거래처 142 ──❌ 0/142 ──▶ [식당OS] 식당 tenant
[식당OS] 식자재 0 ──❌──▶ 메뉴 2 ──❌ 0 레시피──▶ 메뉴 원가
[공급자OS] 주문 284 ──✅ 202/260 ──▶ 수금 배분 ──✅──▶ 원장
```

| 연결 | 실측 | 판정 |
|---|---|---|
| 관리자OS 리스팅 → 식당OS 구매 | 38 → 10 노출 → 장바구니 4 → 주문 9 | ✅ **이어진다** |
| 공급자OS 주문 → 수금 배분 | `payments.order_id` **202/260 (78%)** | ✅ 이어진다 |
| 공급자OS 거래처 → 거래처별 단가 | `customer_product_prices` **245건** | ✅ 이어진다 |
| 커머스 주문 → **공급자 지급** | `supplier_payables` **0** | 🔴 **끊김** |
| 리스팅 → 공급자 | `supplier_tenant_id` **2/38** | 🔴 **끊김** |
| 공급자OS 거래처 → 식당OS tenant | `customers.linked_tenant_id` **0/142** | 🔴 **완전 단절** |
| 식당 발주(RFQ) → 공급자 입찰 → 주문 | `rfq_requests` 0 · `orders.rfq_id` **0** · `orders.bid_id` **0** | 🔴 **전 구간 미가동** |
| 식자재 → 메뉴 → 원가 | `ingredients` 0 · `menu_ingredients` **0** | 🔴 **끊김** |
| 관리자OS 쿠폰 → 식당OS 구독 | `coupons` **0** | ⚫ 데이터 없음 |
| 신뢰도 엔진 → 이상거래 | `trust_scores` **0** · `action_queue` **0** | ⚫ 한 번도 안 돎 |

---

## 1. 🔴 가장 큰 단절 — 커머스 정산 체인이 마지막에서 끊긴다

**돈이 식당에서 들어와 공급자에게 나가는 경로**가 이 서비스의 핵심이다. 그 경로를 끝까지 따라가 보면:

| 단계 | 화면 | 테이블 | 실측 | 상태 |
|---|---|---|---|---|
| 1 | 관리자OS 상품관리 | `commerce_product_listings` | **38** | ✅ |
| 2 | 식당OS `/buy` | (조회) | 식당 세션에 **10건 노출** | ✅ |
| 3 | 식당OS 장바구니 | `cart_items` | **4** | ✅ |
| 4 | 식당OS 결제 | `commerce_orders` | **9** (`completed`, `pending_payment`) | ✅ |
| 5 | — | `commerce_order_items` | **8** | ✅ |
| 6 | 관리자OS 지급 예정 | `commerce_order_allocations` | **2** | 🟡 8건 중 2건만 |
| 7 | 관리자OS 공급자 지급 원장 | `supplier_payables` | **0** | 🔴 **끊김** |
| 8 | 공급자OS 지급/정산 | — | — | 🔴 도달 불가 |

### 왜 끊겼나 — 원인은 **6단계 이전**에 있다

```
commerce_product_listings 38건 중 supplier_tenant_id 가 채워진 것 = 2건 (5%)
```

**리스팅의 95%에 공급자가 지정돼 있지 않다.** 공급자를 모르면 배분(`commerce_order_allocations`)을 만들 수 없고, 배분이 없으면 지급 원장(`supplier_payables`)도 생기지 않는다.

- 코드는 정상이다. `admin/commerce-allocation.ts`가 11개 테이블을 다루며 배분을 만든다.
- **데이터 입력 단계에서 끊긴 것**이다. 리스팅을 등록할 때 공급자를 지정하지 않았다.
- 09-08~09-09의 「리스팅 판매자 이관」 작업(`d6e49c1`,`793765c`)이 정확히 이 문제를 건드리고 있다. **이관 기능은 만들어졌지만, 애초에 공급자가 없는 36건은 이관할 대상 자체가 없다.**

> **연결된 1차 조사 항목**: `design-risk-report.md` R-02/R-03(리스팅은 이관되는데 원가는 안 따라감). 같은 뿌리 — **리스팅과 공급자의 소유 관계가 약하다.**

---

## 2. 🔴 두 앱이 사용자 축에서 이어져 있지 않다

```
공급자OS 거래처(customers)              142건
  그중 식당OS tenant 와 연결된 것        0건   ← customers.linked_tenant_id
```

**공급자OS가 관리하는 거래처 142개 중 단 하나도 식당OS 계정과 연결돼 있지 않다.**

| 결과 | 설명 |
|---|---|
| 공급자OS에서 보는 "거래처 김밥천국" | 그냥 문자열 이름. 식당OS를 쓰는 그 김밥천국인지 알 수 없다 |
| 식당OS 식당이 보는 "내 거래처" | `/suppliers` 화면 — **테이블 자체가 없어 작동 안 함**(4단계 F-03) |
| 재구매 예측·영업 자동화 | 공급자OS의 `sales_schedules`가 식당OS 활동을 참조할 수 없다 |
| 커머스 주문 → 거래처 원장 | 커머스로 산 식당이 공급자OS 거래처로 안 잡힌다 |

**즉 두 앱은 같은 DB를 쓰지만 「같은 식당」이라는 개념이 양쪽에 이어져 있지 않다.**
`ARCH-01` 전제 3(「tenants = 모든 주체」)이 코드에는 있으나 **데이터에는 실현돼 있지 않다.**

- `orders.buyer_tenant_id`도 **284/284 전부 NULL**이다(1차 조사 + 2차 재확인). 주문의 구매자 축도 비어 있다.
- 관련: 4단계 G-02 — `orders` RLS의 `buyer_tenant_id` 절이 죽은 조건이 된 이유가 이것이다.

---

## 3. 🔴 발주(RFQ) 체인 — 만들어졌지만 한 번도 안 돌았다

식당OS와 공급자OS를 잇는 **유일하게 설계된 양방향 흐름**인데, 전 구간이 0이다.

| 단계 | 화면 | 테이블 | 실측 |
|---|---|---|---|
| 1 | 식당OS `/rfq/new` 발주 생성 | `rfq_requests` | **0** |
| 2 | → 공급자에게 알림 | `notifications` | **0** |
| 3 | 공급자OS `/rfq` 입찰 | `rfq_bids` | **0** |
| 4 | 식당OS `/rfq/[id]` 낙찰 | `orders.bid_id` | **0** |
| 5 | → 주문 생성 | `orders.rfq_id` | **0** |

- 양쪽 화면(식당 4개 + 공급자 2개)과 알림 모듈(`lib/rfq-notify-suppliers.ts`)이 전부 구현돼 있다.
- **데이터가 단 한 건도 없다.** 기능이 깨진 게 아니라 **아무도 쓰지 않았다.**
- 게다가 운영(main)에서는 `/rfq/[id]`가 `orders.counterparty_name` 참조로 **에러까지 난다**(4단계 F-06). 쓰려고 해도 못 쓴다.

> 이건 「고칠 것」이 아니라 **「살릴 것인가 접을 것인가」** 결정 대상이다. 1차 조사 `C-01`~`C-04`와 같은 성격이며, 여기에 **RFQ 존폐(C-17)** 를 추가해야 한다.

---

## 4. 🔴 식자재 → 메뉴 → 원가 체인도 전부 끊겨 있다

식당OS의 원가 관리는 **식자재 → 메뉴 레시피 → 메뉴 원가** 순서로 이어져야 한다.

| 단계 | 화면 | 테이블 | 실측 |
|---|---|---|---|
| 1 | `/settings/ingredients` 식자재 등록 | `ingredients` | **0** |
| 2 | `/settings/menus` 메뉴 등록 | `menus` | 2 (최종 **2026-05-17**) |
| 3 | 메뉴별 레시피 | `menu_ingredients` | **0** |
| 4 | 메뉴 원가 캐시 | `menu_cost_cache` | 2 |
| 5 | 홈 AI 절약 제안 | `price_history`, `savings_stats` | **0 / 0** |

- 메뉴 2개가 등록됐지만 **레시피(구성 식자재)가 하나도 없다.** 따라서 메뉴 원가는 계산될 수 없다.
- 식자재가 0행이라 1단계부터 비어 있다.
- 게다가 운영(main)에서는 `/settings/ingredients`가 **에러로 진입조차 안 된다**(4단계 F-05).
- **추가 장벽**: `ingredient_master`·`ingredient_price_history`·`ingredient_unit_history`가 **RLS 정책 0개**라 사용자 세션에서 무조건 0행이다(2단계 §6-1). 컬럼을 고쳐도 안 보인다.

> **3중 장벽**이다: ① 컬럼 없음(main) ② RLS 정책 없음 ③ 데이터 0행. 이 기능을 살리려면 셋 다 풀어야 한다.

---

## 5. ✅ 잘 이어지는 연결 (기록해둔다)

| 연결 | 실측 | 비고 |
|---|---|---|
| 주문 → 수금 배분 | `payments.order_id` **202/260 (78%)** | 공급자OS의 핵심 흐름. 잘 돈다 |
| 주문 → 라인 항목 | `order_lines` **522** / `orders` 284 | 평균 1.8라인 |
| 거래처 → 거래처별 단가 | `customer_product_prices` **245** | 거래처 138개 대비 잘 채워짐 |
| 거래처 → 태그 | `customer_tags` **51** / `customer_tag_logs` 51 | |
| 상품 → 원가 | `products` 199 / `product_costs` 194 | 다만 **원가 미확정 11건** |
| 상품 → tenant | `products.tenant_id` **199/199** | 소유 축 완전 |
| 커머스 주문 → 항목 | 9 → 8 | |
| 관리자 작업 → 감사 로그 | `admin_logs` **455 · 09-08** | 가장 잘 도는 연결 |

---

## 6. 🏝 고립된 기능(섬) — 쓰기만 하고 아무도 안 읽는 것

**"이 테이블에 쓰는 코드는 있는데, 그 데이터를 읽어서 뭔가 하는 코드가 없는" 것**들이다.

| 테이블 | 쓰는 곳 | 읽는 곳 | 행수 | 판정 |
|---|---|---|---|---|
| `today_events` | 식당OS `actions/today-events.ts` | `lib/behavior-profile.ts`(같은 앱 내부) | **0** | 🏝 반쪽 섬 — 외부 소비자 없음 |
| `savings_stats` | 식당OS `actions/today.ts` | 같은 화면만 | **0** | 🏝 섬 |
| `ai_decision_logs` | 식당OS `actions/ai-logs.ts` | `behavior-profile.ts` | **0** | 🏝 섬 |
| `field_observations` | 관리자OS `admin/field-observations.ts` 🚧 | **없음** | **3** | 🏝 **데이터는 있는데 읽는 화면이 미배포** |
| `trust_scores` / `trust_score_logs` | `admin/trust-engine.ts` | `trade-monitor`, `settlement-control`, `policy-console` | **0 / 0** | 🏝 읽는 쪽 3개가 전부 빈손 |
| `relationships` | `admin/trust-engine.ts` | `/admin/participants/relationships` | **0** | 🏝 |
| `action_queue` | `admin/action-queue.ts` | `/admin/dashboard`, `/admin/trades` | **0** | 🏝 |
| `pricing_policies` / `_targets` | `admin/pricing-policies.ts` | `fetch_active_pricing_policies_for_checkout` (DB함수) | **0 / 0** | 🏝 **결제 경로가 읽는데 데이터가 없다** |
| `push_subscriptions` / `push_logs` | 식당OS `/api/push/subscribe` | 관리자OS `/admin/push` | **3 / 1** | 🏝 + **RLS 정책 0개** |
| `coupons` / `coupon_uses` | 관리자OS 2화면 | 식당OS `/subscribe` | **0 / 0** | 🏝 |
| `notifications` | `lib/rfq-notify-suppliers.ts` | 식당OS `/notifications` | **0** | 🏝 |
| `sales_scripts` | 공급자OS `/sales/scripts` | `sales.ts` → `message_logs` | **7 / 3** | 🟡 반쯤 이어짐 |
| `action_logs` | `actions/action-log.ts` | `ledger.ts` | **1 · 최종 04-07** | 🏝 5개월 정지 (`e05f0c8`로 수정됨) |
| `_etl_*` 7개 | 없음 | 없음 | **전부 0** | 🏝 이관 잔재 |
| `dev` / `nurungchip` 스키마 13테이블 | **없음** | **없음** | 359 | 🏝 **코드가 존재조차 모름** (2단계 §6-6) |

### 특히 `pricing_policies`가 문제다

`fetch_active_pricing_policies_for_checkout(p_listing_ids, p_restaurant_tenant_id)` — **`SECURITY DEFINER` DB 함수**가 결제 시점에 이 테이블을 읽는다. 즉 **식당OS 결제 경로가 이 데이터에 의존한다.** 그런데 0행이다.
→ 지금은 "정책 없음 = 기본가"로 동작하겠지만, 관리자OS `/admin/commerce/pricing` 화면은 **만들어도 아무 효과가 없는 것처럼 보일** 수 있다. 확인이 필요하다.

---

## 7. ⚠️ 연결이 아니라 **중복**인 것 — 같은 기능이 두 곳에

| # | 중복 | 상태 |
|---|---|---|
| **N-01** | 공급자OS 견적: `/quotes/*` (3화면) **vs** `/orders/quotes/*` (3화면) | 사이드바는 `/quotes`를 가리킴. `/orders/quotes/*`는 **액션 import가 0개인 껍데기** |
| **N-02** | 공급자OS 자동화영업: `/sales/*` **vs** `/automation/*` (3개) | `/automation/*`는 `/sales/*` 페이지를 그대로 `re-export`. **`src/app/automation/`에 `layout.tsx`가 없어 `(app)` 그룹 밖 → 사이드바 없이 렌더링된다** |
| **N-03** | `/admin` 이 **두 앱에 모두 있다** | 식당OS `/admin`(`orders`,`rfq_requests`,`tenants` 직접 조회) ↔ 관리자OS `/admin/*`. 이름이 같고 기능이 다르다 |
| **N-04** | 관리자OS 잔재 4파일 | `(admin)/participants|policy|settlements` — `page.tsx`가 없어 **도달 불가**. 최신본은 `(admin)/admin/*` (1차 `D-고아-01`, `C-09` 미결) |
| **N-05** | 두 레포에 **100% 동일한 파일 4쌍** | 1차 `D-중복-01`. 아직 미해결 |
| **N-06** | 1차 감사 문서 6종이 **양쪽 레포에 동일 사본** | 의도된 것(`J-02`)이나 SSOT 미결(`C-08`). 이번 2차 문서도 같은 방식 |

> **N-02가 실사용 위험이 있다.** `/automation/schedule` 링크를 누군가 공유하면 **사이드바 없는 화면**이 뜬다. 되돌아갈 내비게이션이 없다.

---

## 8. 두 앱이 같은 테이블을 공유하는 구조 — 연결이자 위험

`ARCH-01` 전제 1(단일 Supabase DB)에 따라 두 앱이 같은 테이블을 쓴다. 실제 공유 현황:

| 테이블 | 식당OS | 공급자OS | 관리자OS | 비고 |
|---|---|---|---|---|
| `orders` | ✅ 읽기·쓰기 | ✅ 읽기·쓰기 | ✅ 읽기 | **소유 축이 3개**(`tenant_id`/`seller_tenant_id`/`buyer_tenant_id`)인데 뒤 둘이 사실상 미사용 |
| `payments` | ✅ | ✅ | ✅ | `payee_tenant_id`/`payer_tenant_id` **81% NULL**(1차 `R-04`) |
| `tenants` | ✅ | ✅ | ✅ | |
| `products` | (조회) | ✅ | ✅ | |
| `commerce_*` | ✅ 구매 | — | ✅ 운영 | |
| `admin_settings` | ✅ 읽기 | — | ✅ 쓰기 | 식당OS가 관리자 설정을 읽는다 |
| `admin_logs` | ✅ 쓰기(`commerce-order-erp.ts`) | — | ✅ 읽기 | **식당OS가 관리자 감사로그에 쓴다** |

> **주목**: 식당OS의 `lib/commerce-order-erp.ts`가 `admin_logs`·`admin_settings`·`payments`·`products`·`supplier_payables` 계열까지 건드린다. **식당의 결제 한 번이 공급자OS/관리자OS의 데이터를 동시에 바꾼다.**
> 이건 설계상 의도된 연결이지만, **한 앱의 버그가 세 앱에 퍼지는 경로**이기도 하다. 4단계 G-01(`order_lines` RLS 비대칭)이 위험해지는 것도 이 경로가 활성화될 때다.

---

## 9. 종합 — 연결 상태를 한 문장으로

> **"구매(커머스) 한 줄기만 끝까지 이어져 있고, 나머지는 앱 경계에서 끊겨 있다."**

| 축 | 상태 |
|---|---|
| 관리자OS → 식당OS (상품 공급) | ✅ 이어짐 |
| 식당OS → 관리자OS (주문·결제) | ✅ 이어짐 |
| 관리자OS → 공급자OS (지급 정산) | 🔴 **끊김** (`supplier_payables` 0) |
| 식당OS ↔ 공급자OS (발주·거래처) | 🔴 **전 구간 끊김** |
| 앱 내부 (원장·수금·상품) | ✅ 잘 이어짐 |

**세 OS가 하나의 사이클을 이루려면 「식당 ↔ 공급자」 축이 필요한데, 그 축을 담당하는 두 기능(RFQ / 거래처 연결)이 각각 「미사용」과 「테이블 없음」 상태다.**

---

## 10. 여기서 파생되는 「사람 확인 필요」 추가 항목

| # | 항목 | 왜 |
|---|---|---|
| **C-17** | RFQ(발주·입찰) 기능 존폐 | 화면 6개·알림 모듈이 완성돼 있으나 전 구간 0행. 살릴지 접을지 결정 필요 |
| **C-18** | `commerce_product_listings.supplier_tenant_id` 36건 미지정을 채울 것인가 | **정산 체인이 여기서 끊긴다.** 채워야 지급 원장이 생긴다 |
| **C-19** | `customers.linked_tenant_id`로 두 앱 사용자를 이을 것인가 | 142건 전부 미연결. 이걸 이어야 재구매·영업 자동화가 의미를 갖는다 |
| **C-20** | `/orders/quotes/*` 3개, `/automation/*` 3개 중복 라우트 정리 | N-01·N-02. 특히 `/automation/*`은 레이아웃이 없다 |
| **C-21** | `pricing_policies` 0행 — 가격 정책 기능을 쓸 것인가 | 결제 경로(DB 함수)가 이미 이 테이블을 읽고 있다 |
