# improvement-suggestions.md — 개선 제안 (5단계)

- 작성일: 2026-09-09
- 성격: **강제 사항 아님.** 1~4단계 조사 중 눈에 띈 것을 자유롭게 적었다. 각 항목에 「왜 필요한지」와 「예상 난이도(간단/중간/큼)」를 붙였다.
- 난이도 기준: **간단** = 하루 이내·파일 몇 개 / **중간** = 며칠·스키마 변경 또는 여러 화면 / **큼** = 설계 결정이 선행되어야 함

---

## A. 가격·원가 정확성

### I-01 · 스키마 계약 테스트 (CI에서 코드 참조 컬럼 vs 운영 스키마 자동 대조) 🔴 최우선
**난이도: 간단** (이번 조사에서 쓴 스크립트가 이미 동작한다)

**왜**: 1단계에서 나온 **13개 컬럼 + 2개 테이블 불일치가 전부 "배포된 뒤에야, 그것도 사용자가 부딪혀야" 드러났다.** `action_logs`는 5개월간 아무도 몰랐다.
`GET /rest/v1/` 한 번이면 운영 스키마 전체가 나오고, 코드의 `.from().select().eq()`는 정규식으로 뽑힌다. **CI에 붙이면 같은 사고가 다시 안 난다.**

```
# 개념
1) GET /rest/v1/           → 운영 스키마 (테이블 96 × 컬럼)
2) src/ 정적 스캔          → 코드가 참조하는 (테이블, 컬럼) 집합
3) 차집합이 비어 있지 않으면 CI 실패
```
`docs/CONTEXT.md`가 「DB 변경 ❌ / 추가(additive) 방식으로만」이라고 못박은 만큼, **코드가 앞서 나가는 것을 막는 장치**가 정확히 이 자리에 필요하다.

---

### I-02 · 운영 DB 현재 상태를 RECORD-ONLY로 통째 덤프
**난이도: 중간**

**왜**: 운영 테이블 **96개 중 56개(58%)에 CREATE TABLE 파일이 없다.** `orders`·`payments`·`products`·`product_costs`·`customers`·`tenants`가 전부 여기 포함된다. RLS 정책도 상당수가 git 밖에 있다 (`product_costs`의 tenant 격리는 **동작은 하는데 어느 파일에도 없다**).

이미 좋은 선례가 있다 — `20260807120000~13_record_*.sql` 14개가 `pg_get_functiondef`로 함수를 덤프해뒀다. **같은 방식을 테이블·정책·인덱스로 확대**하면 된다. 재적용이 목적이 아니라 **기록**이 목적이다.

**부수 효과**: 신규 환경(스테이징/재구축/사업 양도 후) 구축이 처음으로 가능해진다 → `design-risk-report.md` R-11 해소.

---

### I-03 · 원가 미확정(1원 자리값) 상품을 운영 화면에서 상시 노출
**난이도: 간단**

**[SQL 결과] 지금 상태**
```
product_costs 활성 190건 중 cost_price <= 1  :  11건
order_lines 518건 중 cost_price <= 1         :  64건 (12.4%)
```
**왜**: 주문이 생길 때 `order_lines.cost_price`에 **그 시점의 원가가 스냅샷된다**(`actions/order.ts:164`). 원가가 1원 자리값인 채로 주문이 나가면 **그 라인의 마진은 영구히 틀린다.** 나중에 원가를 채워도 과거 라인은 안 고쳐진다(RULE-03 append-only).

지금 이미 **주문 라인의 12%가 이 상태**다. `lib/analytics-calc.ts:131`에 `isCostConfirmed()`가 이미 있고, `components/analytics/CostCoverageNotice.tsx`도 있는데 **둘 다 미참조 상태**다(`dead-code-report.md`). 만들어둔 걸 화면에 붙이기만 하면 된다.

**제안**: 관리자OS 상품 목록에 「원가 미확정 N건」 배지 + 주문 생성 시 경고. `scripts/report-unconfirmed-cost-listings.ts`가 이미 같은 계산을 한다 — **스크립트를 화면으로 승격**.

---

### I-04 · 리스팅 이관 시 원가 축을 분리 (`listing_cost` 도입)
**난이도: 큼** (설계 결정 필요)

**왜**: 지금 구조에서는 리스팅을 공급자에게 넘겨도 **원가는 플랫폼 상품에 붙어 있다.** 코드가 스스로 인정한다 — `ListingSupplierTransferPanel.tsx:240` 「원가(product_costs)는 여전히 플랫폼 상품에 묶여 있어…」

**[SQL 결과]** 이미 2건이 `owner_type='approved_supplier'`로 이관된 상태다. 가설이 아니다.

결과적으로 **공급자 귀속 상품의 할인 한도가 "플랫폼이 제조사에서 산 가격"으로 계산된다.** 공급자가 실제로 받는 금액(`supplier_payables.payable_amount`)과 무관하다.

**방향(택1)**
- (a) `commerce_product_listings`에 원가 축을 직접 두고 이관 시 함께 옮긴다
- (b) `product_costs`에 소유 tenant를 명시해 이관 시점에 새 행을 만든다 (`design-risk-report.md` R-02도 같이 해소)

어느 쪽이든 **"원가는 누구의 것인가"를 먼저 정해야** 해서 난이도 「큼」으로 뒀다.

---

### I-05 · 죽어 있는 원가 이력 / 마진 분석을 살린다
**난이도: 간단**

`getProductCostHistory`(`product.ts:988`)와 `getProductMarginAnalysis`(`product.ts:1337`)가 **없는 컬럼(`tenant_id`)을 필터해서 항상 실패**하고, 그래서 아무도 호출하지 않는 상태다.

`product_costs`/`product_stats`에는 `tenant_id`가 없고 **`product_id → products.tenant_id`로 이미 격리가 걸려 있다**(RLS 동작 실측 확인: supplier 세션이 자기 상품 원가 3건만 봄). 즉 **`.eq('tenant_id', ...)` 한 줄만 빼면 두 함수가 바로 동작한다.**

「가격 변경 로그(product_costs)」 탭(`ProductDetailTabsClient.tsx:393`)이 도입 이후 한 번도 값을 못 보여준 것도 이 때문이다.

---

### I-06 · 할인 계산이 원가를 역산 가능한 숫자로 내보내지 않게
**난이도: 중간**

`restaurant-os/src/actions/buy.ts:1471` `calcCartDiscount`가 서비스롤로 `product_costs`를 읽어 100원 단위 할인액을 돌려준다. 상수(`PG_RATE=0.033`, `MIN_MARGIN=0.16`)가 소스에 있어 **역산이 성립한다.** 지금은 유료 tenant가 0이라 발동하지 않지만, 구독자가 1명 생기는 순간 열린다.

> 상세 분석과 심각도는 **어제 별도 보고서**에 있다. 여기서는 개선 방향만 적는다.

**방향**
- 할인액을 **미리 정해진 몇 단계(예: 0 / 1,000 / 3,000 / 5,000원)로 버킷팅**해 연속 함수가 되지 않게 한다
- 또는 원가 기반 계산을 서버에서만 하고 **클라이언트에는 "적용 가능/불가"만** 내린다
- `items`의 `commerce_price`를 **호출자 입력이 아니라 DB에서 재조회**한다 (현재는 호출자가 임의 값을 넣을 수 있다)
- 덤으로 `createCommerceOrder`(`buy.ts:1279`)가 클라이언트 `discount_amount`를 `subtotal` 상한으로만 clamp하고 재검증하지 않는 것도 같이 고친다

---

## B. 재구매·고객 추적

### I-07 · `logAction` 무음 실패 복구 — 영업 데이터가 5개월째 안 쌓인다 🔴
**난이도: 간단** (원인은 컬럼 1개)

**[SQL 결과]** `action_logs` **1행 / 마지막 2026-04-07**
**[코드 근거]** `action-log.ts:30` `logAction`이 존재하지 않는 `message_template_id`를 insert하고, `try/catch`로 에러를 삼킨 뒤 `null`을 반환한다.

**왜 중요한가**: 이 함수의 반환값(`action_log_id`)으로 `contact_logs.action_log_id` → `updateActionConversion` → `linkActionResult`가 이어진다. **영업 액션 → 접촉 → 전환 → 매출의 추적 사슬 전체가 첫 고리에서 끊겨 있다.** 재구매 추적을 아무리 잘 만들어도 입력이 0이다.

**같이 볼 것**: `message_templates` 테이블이 아예 없다(M-02). 이 둘은 같은 미완성 기능의 양쪽 끝이라 **하나만 고치면 안 된다.**

**추가 제안**: 이런 "로그 실패를 삼키는" 패턴을 전수 점검할 것. 최소한 `console.error`라도 남겨야 5개월을 안 놓친다.

---

### I-08 · `product_stats` 갱신 파이프라인 점검
**난이도: 중간**

**[SQL 결과]**
```
product_stats                    180행
  used_by_count > 0               0행   ← 한 번도 안 채워짐
  last_margin_rate NOT NULL       0행   ← 한 번도 안 채워짐
  avg_unit_price                  채워짐
```
**왜**: 행은 생성되는데 **지표 컬럼 2개가 한 번도 갱신된 적이 없다.** `used_by_count`(몇 개 거래처가 쓰는 상품인가)는 재구매 추천·이탈 감지의 기본 신호다. `last_margin_rate`는 마진 경고의 기준이다.

`customer_stats`도 비슷하다 — **활성 고객 138명 중 11명(8%)만 통계 행이 있다.** `update_customer_stats` RPC는 존재하고 호출도 되는데 커버리지가 8%다. 왜 나머지가 안 생기는지 확인 필요.

---

### I-09 · 이탈/재구매 신호 로직이 있는데 화면에 안 붙어 있다
**난이도: 간단~중간**

`lib/churn-signal.ts`의 `CYCLE_MULTIPLIER`·`REPURCHASE_WAIT_DAYS`·`REPURCHASE_WAIT_MAX_DAYS` 상수가 **어디서도 참조되지 않는다.**
`lib/customer-logic.ts`의 `calcActionType`·`calcRecontactMessage`·`calcNoContactMessage`도 미참조.
`components/sales/TodaySalesWidget.tsx`·`components/dashboard/DashboardQueueSection.tsx`·`components/dashboard/CommandStrip.tsx`도 미참조 고아.

**왜**: 재구매 추적에 필요한 계산이 **이미 짜여 있는데 화면에 안 걸려 있다.** 새로 만들기 전에 이것부터 확인할 것. (`sales_schedules` 1행/2026-04-12, `today_events` 0행 — 행동 유도 파이프라인 전체가 멈춰 있다.)

---

### I-10 · `orders.buyer_tenant_id` — 선언만 되고 100% NULL
**난이도: 중간**

**[SQL 결과]** `orders` 282행 중 `buyer_tenant_id` **NULL 282건 (100%)**

**왜**: 공급자OS의 주문(`orders`)과 식당OS의 tenant가 데이터로 연결되어 있지 않다. 그래서
- 「이 식당이 우리에게서 얼마나 샀나」를 tenant 축으로 못 센다 (`customers` 텍스트 매칭에 의존)
- `customers.linked_tenant_id`도 **0건** — 거래처↔tenant 브리지가 비어 있다
- RFQ → 주문 → 재구매로 이어지는 관계 축(`relationships` 0행)이 전부 공백

재구매 추적을 tenant 단위로 하려면 이 연결부터 채워야 한다.

---

## C. 판매자(공급자) 관리·정산

### I-11 · `payments`의 tenant 축 백필 완료 🔴
**난이도: 중간** (규칙 결정 필요 → `overnight-audit-log.md` C-05)

**[SQL 결과]**
```
payments 258행 :  payee_tenant_id NULL 209 (81%)  /  payer_tenant_id NULL 210 (81%)
                  legacy tenant_id  NULL   0 (0%)
```
**왜**: 지금 조회가 동작하는 유일한 이유는 **레거시 `tenant_id`가 100% 채워져 있어서**다. 코드는 `.or(payee_tenant_id.eq.X, tenant_id.eq.X)`로 두 축을 동시에 훑는다(10곳 이상).
누군가 "전환 끝났겠지" 하고 레거시 컬럼을 드롭하면 **결제 258건 중 209건이 미귀속**이 된다. 미수금·정산·원장이 통째로 틀어진다.

`docs/CONTEXT.md`가 이 상태를 「⚠️ 전환 중」으로 표시한 지 오래됐다. **끝내거나, 못 끝낼 이유를 문서에 적어두거나** 둘 중 하나가 필요하다.

---

### I-12 · 정산 로직이 두 레포에 중복되어 있다
**난이도: 중간**

같은 이름·같은 목적의 함수가 두 레포에 각각 있다:
```
realmyos/src/actions/admin/commerce-allocation.ts   ↔   restaurant-os/src/lib/commerce-order-erp.ts
  tryRecordPlatformReceivablePayment
  resolveSupplierTenantId
  loadPlatformFeePercentNumerator
```
**둘 다 같은 `commerce_order_allocations` 테이블에 쓴다.** 한쪽만 수수료 계산을 고치면 **주문 경로에 따라 정산액이 달라진다.** 지금은 `commerce_order_allocations` 2행뿐이라 티가 안 나지만, 거래가 늘면 대조가 불가능해진다.

**제안**: 정산 계산을 **DB 함수(SECURITY DEFINER) 한 곳**으로 내리거나, 한쪽을 SSOT로 정하고 다른 쪽은 호출만 한다.

---

### I-13 · 공급자에게 「내 정산 현황」 화면이 없다
**난이도: 중간**

**[SQL 결과]** `supplier_payables` 0행, `commerce_order_allocations` 2행. RLS에는 이미 `supplier_payables_supplier_select` / `commerce_order_allocations_supplier_select`가 있고 **동작도 확인**했다 (supplier 세션이 자기 allocation 2건을 정상 조회).

**왜**: DB 레벨 준비는 끝나 있는데 **공급자OS(`(app)/`)에 커머스 관련 화면이 단 하나도 없다.** (`grep -rln "commerce" "src/app/(app)"` → 0건. 전부 `(admin)/`에만 있다.)
공급자는 자기가 언제 얼마를 받는지 시스템에서 볼 수 없다. 리스팅 이관이 이미 2건 일어난 상태라 곧 필요해진다.

---

### I-14 · `sales_scripts`가 비로그인 전체 공개다 🔴 보안
**난이도: 간단**

**[SQL 결과]** anon key만으로, **로그인 없이**
```
GET /rest/v1/sales_scripts?select=tenant_id,type,title   [anon]
→ 7행 전부
  00000000-...  call     안부 전화 / 미수금 확인 / 재주문 유도
  00000000-...  message  주문 감사 문자 / 입금 요청 문자
  5bf7aa92-...  message  1단계 : 쿠팡 안심번호용(된장)     ← 다른 공급자의 영업 스크립트
  d99a4eec-...  message  재구매 알림                        ← 또 다른 공급자의 것
```
**[코드 근거]** `actions/sales.ts:347`은 애플리케이션에서 「자기 tenant + 플랫폼 공용」만 읽도록 짜여 있다. **DB에는 그 제약이 없다.**

**제안**: `sales_scripts`에 `tenant_id = get_my_tenant_id() OR tenant_id = <플랫폼>` RLS 추가. 한 줄이면 끝난다.

---

### I-15 · `admin_memo`가 "내부 전용"이라고 화면에 쓰여 있는데 실제로는 공개다
**난이도: 간단**

**[코드 근거]** `ListingFormClient.tsx:2732` 「내부 전용, 고객에게 안 보입니다 — 직원 간 소통용 메모입니다」
마이그레이션 주석(`20260510140000`)도 「운영자 내부 메모 (구매자 비노출)」.
**[SQL 결과]** 그런데 `commerce_listings_read` 정책에 `TO` 절이 없어 **anon 포함 전원**에게 열려 있다:
```
GET /rest/v1/commerce_product_listings?select=id,admin_memo   [anon, 비로그인]
→ 200, admin_memo 컬럼 반환 (현재 값은 전부 null)
```
**왜 지금 고쳐야 하나**: 지금은 전 행이 null이라 실피해가 없다. **누군가 여기에 매입 조건이나 공급처 메모를 한 줄 쓰는 순간 비로그인 공개된다.** UI가 안전을 약속하고 있어서 더 위험하다.

**제안**: 공개 SELECT용 컬럼 화이트리스트를 두거나(뷰), `admin_memo`를 별도 테이블로 분리.

---

## D. 구조·운영 안전장치

### I-16 · 플랫폼 tenant ID를 상수 하나로 모은다
**난이도: 간단(코드) / 큼(DB)**

`00000000-0000-0000-0000-000000000000`이 **소스 16개 파일 + SQL 4개**에 흩어져 있다. `lib/subscription-renewal.ts:37`이 이미 `export const PLATFORM_OWNER_TENANT`를 내보내는데 **13개 파일이 각자 다시 선언**하고, 2곳은 문자열 리터럴을 쿼리에 직접 박는다(`sales.ts:347`, `buy.ts:308`).

더 무거운 쪽은 DB다 — `is_admin()` 함수 본문에 박혀 있고, 이 함수가 거의 모든 RLS 정책의 판정 기준이다.

**제안**: 최소한 코드 쪽 16곳은 공용 상수 import로 통일. DB 쪽은 `admin_settings`에서 읽는 형태로 바꿀 수 있는지 검토(단, RLS 함수 안에서의 조회 비용 고려).

---

### I-17 · 거래명세서를 발행 시점 스냅샷으로
**난이도: 중간**

**[코드 근거]** `order-export.ts:88-146`이 사업자번호·대표자·계좌·도장을 **지금의 `tenants` 행에서 실시간으로 읽는다.**

**왜**: 라인 단위(`order_lines`)는 스냅샷이 제대로 돼 있는데 **"누가 팔았나"만 얼어 있지 않다.** 상호·대표자·계좌·사업자번호가 바뀌면 **과거 명세서를 다시 뽑을 때 현재 정보가 찍힌다.** 세무 증빙으로 못 쓴다.

**제안**: `orders`에 `issuer_snapshot jsonb`를 두고 발행 시점 정보를 얼린다. `commerce_order_items.applied_policy_snapshot`이 이미 같은 패턴을 쓰고 있으니 일관성도 맞는다.

---

### I-18 · 이미지를 절대 URL이 아니라 경로로 저장
**난이도: 간단** (지금은 12행뿐)

**[SQL 결과]** 저장값에 프로젝트 ref가 들어 있다
```
"https://cqiwcyuclpuarynrreat.supabase.co/storage/v1/object/public/commerce-images/admin/....jpg"
thumbnail_url NOT NULL 10행 / image_urls NOT NULL 2행 / tenants.stamp_image_url 0행
```
**왜**: Supabase 프로젝트를 옮기면(사업 양도·조직 이관·재구축) **DB에 박힌 URL이 전부 404**가 된다. 경로만 저장하고 렌더링 시 조립하면 앱 설정 한 줄로 끝난다.
**지금이 가장 싸다** — 12행이다.

---

### I-19 · 식당OS에 role 게이트가 없다
**난이도: 간단**

**[코드 근거]** `restaurant-os/src/middleware.ts` 전문:
```ts
export function middleware() { return NextResponse.next() }
```
`getAuthCtx`(`lib/supabase-server.ts:45`)는 `users.tenant_id`만 요구하고 `role`은 반환만 할 뿐 검사하지 않는다. 레포 전체에 `role === 'restaurant'` 게이트가 없다.

**왜**: 단일 Supabase 프로젝트라 auth가 공유된다. **공급자 계정으로 식당OS에 그대로 로그인된다.** 장바구니·주문·구독 등 식당 전용 흐름에 다른 role이 들어온다. I-06(할인 역산)의 전제조건이기도 하다.

**제안**: realmyos `middleware.ts`가 이미 하는 방식(`users.role` 확인 후 리다이렉트)을 식당OS에도 붙인다.

---

### I-20 · admin Server Action 가드 누락 10건
**난이도: 간단**

`realmyos/src/actions/admin/` 안에서 `requireAdmin` 없이 export된 함수:
```
action-queue.ts:101          createActionQueueItem
ai-product-analysis.ts       analyzeProductStrengths
commerce-allocation.ts       cancelPendingCommerceOrderAllocationsForOrder
commerce-reversal.ts:87      cancelSupplierPayableWithClient
commerce-reversal.ts:321(*)  processCommerceOrderCancelledAccountingP0
commerce.ts:3077             reorderCategory
ingredient-master.ts:56      upsertIngredientMaster        ← service role 로 쓰기
policy-console.ts            ensurePolicyDefaults, getTrustLevelThresholds, getAdminSettingNumber
```
**원가를 반환하는 것은 없다**(확인함). 다만 `upsertIngredientMaster`는 `'use server'` export이면서 서비스롤로 `ingredient_master`/`ingredient_mappings`에 쓴다.

**근본 원인**: `requireAdmin`이 **21벌로 흩어져 있다**(`lib/auth.ts`에 공용본이 있는데도). 공용화하면 누락을 정적으로 잡을 수 있다.

---

### I-21 · `bulk_create_products` RPC의 권한
**난이도: 간단**

**[코드 근거]** `20260807120000_record_bulk_create_products.sql` (운영 덤프)
```sql
CREATE FUNCTION public.bulk_create_products(p_tenant_id uuid, ...) SECURITY DEFINER
...
GRANT EXECUTE ON FUNCTION ... TO anon;
GRANT EXECUTE ON FUNCTION ... TO authenticated;
```
`p_tenant_id`를 **인자로 받아 그대로 insert**하는데 함수 안에 호출자 검증이 없고, `anon`에게도 실행 권한이 있다. 애플리케이션(`product.ts:675`)은 `ctx.tenant_id`를 넣지만 **RPC를 직접 때리면 임의 tenant로 상품을 만들 수 있다.**

**제안**: 함수 내부에서 `p_tenant_id = get_my_tenant_id()` 검증, `anon` GRANT 회수.

---

### I-22 · 부분 쓰기 방지 — `deleteContactLog`
**난이도: 간단**

`sales.ts:716`이 ① `sales_schedules.status='pending'` 갱신(성공) → ② `contact_logs.is_active=false` 갱신(**42703 실패**) 순서로 진행한다. 트랜잭션이 아니라서 **삭제는 안 되고 일정만 되돌아간다.** 사용자가 재시도할 때마다 일정 상태가 계속 리셋된다.

**제안**: 컬럼 문제(M-05)를 고치는 김에 순서를 뒤집거나 RPC로 원자화. 이 코드베이스는 이미 `cancel_order_and_void_allocations` 같은 원자 RPC 패턴을 쓰고 있다.

---

## E. 작은 것들

### I-23 · 견적번호 채번의 무음 실패 패턴
**난이도: 간단**

`quote.ts:36` `issueQuoteNumber`가 `const { count } = await ...` 로 **`error`를 아예 구조분해하지 않는다.** 쿼리가 400이어도 `count`가 `undefined`가 되어 번호가 영구히 `-0001`이다.

**제안**: 같은 패턴(`error`를 안 읽는 구조분해)을 두 레포에서 전수 점검. 이번 조사에서 잡힌 것만 2건이다(`issueQuoteNumber`, `logAction`).

---

### I-24 · 두 레포 100% 동일 파일 4쌍
**난이도: 중간**

```
lib/barcode-lookup.ts · lib/pricing-policy-engine.ts · lib/rfq-notify-suppliers.ts
components/product/BarcodeScanner.tsx
```
**왜**: 한쪽만 고치면 두 OS 동작이 갈라진다. **이미 그런 일이 일어났다** — `menus` 조회가 `actions/menus.ts`(정상, `is_representative`)와 `actions/restaurant.ts`(고장, `is_featured`) 두 벌로 갈라져 설정 화면이 깨졌다.

**제안**: 공유 패키지(npm workspace)로 뽑거나, 최소한 파일 상단에 "이 파일은 X 레포와 동기화 대상" 주석 + CI 해시 비교.

---

### I-25 · 유틸 중복 정리
**난이도: 간단**

`formatKRW` **8곳**, `todayKST` 7곳, `kstTodayStr` 5곳, `fmtDate` 6곳, `formatDate` 4곳에 각자 구현돼 있다. `lib/calc.ts`(realmyos)·`lib/utils.ts`(restaurant)에 공용본이 이미 있다.
**왜**: KST 경계 계산이 파일마다 미세하게 다르면 **일별 집계가 화면마다 어긋난다.** 원장·정산이 걸린 시스템에서 이건 작은 문제가 아니다.

---

### I-26 · 죽은 라우트 잔재 정리
**난이도: 간단**

`(admin)/participants/`, `(admin)/policy/`, `(admin)/settlements/` 아래에 **page.tsx 없이 클라이언트 파일만 4개** 남아 있다. 최신본은 `(admin)/admin/` 아래에 따로 있다. 렌더링되지 않지만 빌드에 포함되고, 검색 결과를 오염시킨다.
⚠️ 두 사본이 완전히 같지는 않으니 어느 쪽이 최신인지 확인 후 삭제 (`overnight-audit-log.md` C-09).

---

### I-27 · 이 6개 문서의 SSOT 정하기
**난이도: 간단**

양쪽 레포 `doc/`에 동일 사본을 넣었다. 한쪽만 고치면 갈라진다. `docs/CONTEXT.md`가 이미 RealMyOS에 있으니 **RealMyOS를 SSOT로 하고 restaurant-os에는 포인터만** 두는 편이 자연스럽다.

---

## 우선순위 한 장 요약

| | 항목 | 난이도 | 한 줄 이유 |
|---|---|---|---|
| 1 | **I-01** 스키마 계약 테스트 | 간단 | 이번에 나온 15건이 전부 이걸로 막힌다 |
| 2 | **I-07** `logAction` 복구 | 간단 | 영업 데이터가 5개월째 0건. 재구매 추적의 입력 |
| 3 | **I-14** `sales_scripts` RLS | 간단 | 다른 공급자 영업 스크립트가 비로그인 공개 |
| 4 | **I-11** payments tenant 백필 | 중간 | 레거시 컬럼 드롭 = 결제 81% 미귀속 |
| 5 | **I-03** 원가 미확정 노출 | 간단 | 주문 라인 12%가 이미 오염 |
| 6 | **I-19** 식당OS role 게이트 | 간단 | 미들웨어가 no-op |
| 7 | **I-06** 할인 역산 차단 | 중간 | 유료 구독자 1명이면 발동 |
| 8 | **I-02** 스키마 RECORD-ONLY 덤프 | 중간 | 운영 테이블 58%가 git 밖 |
| 9 | **I-18** 이미지 상대경로 | 간단 | 12행일 때가 가장 싸다 |
| 10 | **I-05** 원가 이력/마진 분석 복구 | 간단 | `.eq('tenant_id')` 한 줄 |
| 11 | **I-17** 명세서 스냅샷 | 중간 | 사업자 변경 시 과거 문서 오염 |
| 12 | **I-20/I-21/I-22** 가드·권한·부분쓰기 | 간단 | 각각 독립적으로 처리 가능 |
| 13 | **I-12/I-24/I-25** 중복 정리 | 중간 | 이미 사고가 한 번 났다 |
| 14 | **I-04** 리스팅 원가 축 분리 | 큼 | "원가는 누구 것인가" 결정 선행 |
| 15 | **I-08/I-09/I-10/I-13** 추적·정산 화면 | 중간 | 제품 로드맵과 함께 |
