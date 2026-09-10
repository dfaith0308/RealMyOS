# dead-code-report.md — 불필요한 코드·기능 전수 조사 (4단계)

- 조사일: 2026-09-09
- 대상: `RealMyOS/src` (335 파일) + `restaurant-os/src` (179 파일)
- 방법 3축
  1. **정적**: 모든 `export` 심볼을 뽑아 "정의 파일 밖에서 한 번이라도 등장하는가" 검사 (Next.js 진입점 파일명은 화이트리스트)
  2. **실행 흔적**: 운영 DB 96개 테이블 전부의 행 수 + 최종 `created_at` 조회
  3. **중복**: 파일 유사도(정규화 후 85% 이상) + 동일 이름 함수 정의 위치
- 판정: **🟢 삭제해도 안전 / 🟡 확인 후 삭제 검토 / ⚪ 당장은 유지**

---

## 0. 요약

| | RealMyOS | restaurant-os |
|---|---|---|
| `.ts`/`.tsx` 파일 | 335 | 179 |
| export 심볼 | 972 | 512 |
| **파일 밖에서 한 번도 참조 안 됨** | **224** (function 72 · type 128 · const 18 · default 6) | **141** (function 31 · type 72 · const 29 · default 9) |
| 고아 파일 (import 경로 자체가 없음) | **4** | **9** |

| 축 | 발견 |
|---|---|
| 🟢 삭제해도 안전 | **파일 13개** + 함수 5 + 상수 8 |
| 🟡 확인 후 삭제 검토 | 기능 단위 **7덩어리** (함수 ~60개) |
| ⚪ 당장은 유지 | scripts 의존 4 · 신규 기능 · 타입 200개 |
| 실행 로그 0건 | **DB 테이블 37개** (전체의 39%) |
| 코드가 한 번도 안 건드리는 테이블 | **14개** |
| 중복 구현 | 파일 **100% 동일 4쌍** · 동일 이름 함수 **90종** (`requireAdmin` 21곳, `insertAdminLog` 13곳) |

---

## 1. 🟢 삭제해도 안전

### D-고아-01 · `RealMyOS` — page.tsx가 없는 라우트 트리에 남은 클라이언트 파일 4개

**[코드 근거]**
```
src/app/(admin)/participants/participants-client.tsx                    ← page.tsx 없음
src/app/(admin)/participants/relationships/relationships-client.tsx     ← page.tsx 없음
src/app/(admin)/policy/PolicyConsoleClient.tsx                          ← page.tsx 없음
src/app/(admin)/settlements/SettleOrderButton.tsx                       ← page.tsx 없음
```
같은 이름의 **최신본이 `(admin)/admin/` 아래에 따로 있고, 그쪽에는 page.tsx가 있다**:
```
src/app/(admin)/admin/participants/{page.tsx, participants-client.tsx}
src/app/(admin)/admin/participants/relationships/{page.tsx, relationships-client.tsx}
src/app/(admin)/admin/policy/{page.tsx, PolicyConsoleClient.tsx}
src/app/(admin)/admin/settlements/{page.tsx, SettleOrderButton.tsx}
```
Next.js App Router는 `page.tsx`가 없는 폴더를 라우트로 만들지 않는다 → **빌드에 포함되지만 절대 렌더링되지 않는다.**

⚠️ **단, 두 사본의 내용이 완전히 같지는 않다** (`participants-client.tsx` 기준 197행 vs 199행). 어느 쪽이 의도된 최신인지 사람이 한 번 확인할 것 → `overnight-audit-log.md` C-09.

### D-고아-02 · `restaurant-os` — 아무도 import하지 않는 `components/today/` 컴포넌트 9개

**[코드 근거]** 전수 grep 결과 **자기 파일에서만 등장**
```
src/components/today/TodayDate.tsx           TodayDate
src/components/today/TodayDeliveryCard.tsx   TodayDeliveryCard
src/components/today/TodayImportCard.tsx     TodayImportCard
src/components/today/TodayLoopCard.tsx       TodayLoopCard      (*)
src/components/today/TodayNotifications.tsx  TodayNotifications
src/components/today/TodayPaymentCard.tsx    TodayPaymentCard
src/components/today/TodayRfqCard.tsx        TodayRfqCard
src/components/today/TodayStrip.tsx          TodayStrip
src/components/today/TodayTracker.tsx        TodayTracker
```
(*) `TodayLoopCard`만 `src/actions/ai-logs.ts`에 **문자열 라벨**로 등장한다(로그 출처 표기). 컴포넌트로서는 쓰이지 않는다.

`src/components/today/` 16개 중 **9개가 고아**다. 살아 있는 7개: `SupplierRiskSection`, `TodayActionPriorityCard`, `TodayMainOperationFeed`, `TodayOperationInsights`, `TodayRiskSection`, `TodaySupplierInsights`, `TodayTrustNotice`.

**연쇄**: `TodayImportCard` / `TodayLoopCard`가 `src/actions/import.ts`의 유일한 호출자다. 이 둘이 죽어 있으므로 **명세서 OCR 식자재 import 기능 전체가 화면에서 도달 불가**다 (그리고 DB 컬럼 7개도 없다 → `schema-mismatch-report.md` M-09).

### D-안전-03 · DB 스키마 때문에 절대 성공할 수 없고, 호출자도 없는 함수

| 함수 | 위치 | 왜 안전한가 |
|---|---|---|
| `getProductCostHistory` | `realmyos/src/actions/product.ts:988` | 호출자 0 + `product_costs.tenant_id` 없음 → 항상 `42703` (M-10) |
| `getProductMarginAnalysis` | `realmyos/src/actions/product.ts:1337` | 호출자 0 + `product_stats.tenant_id` 없음 → 항상 `42703` (M-11) |

> 지우기보다 **고쳐서 되살리는 쪽**이 나을 수 있다(원가 이력·마진 분석은 제품상 의미가 있다). 그래서 이 항목만 `improvement-suggestions.md` I-05에 교차 기록했다.

### D-안전-04 · 어디서도 안 쓰는 상수

**RealMyOS**
```
lib/bulk-listing-template-xlsx.ts:10-15   LIGHT_GREEN, BLUE, LIGHT_BLUE, AMBER, WHITE, GRAY
lib/churn-signal.ts:18,20,22              CYCLE_MULTIPLIER, REPURCHASE_WAIT_DAYS, REPURCHASE_WAIT_MAX_DAYS
lib/subscription-renewal.ts:20            MAX_RETRY
styles/design-system.ts:233               DS_STATUS_ORDER
```
**restaurant-os**
```
lib/behavior-profile.ts:27-59             DEFAULT_PROFILE 외 13개  ← 파일 전체가 사실상 미사용
lib/ai-evaluate.ts:39-47                  AUTO_READY_* 7개
lib/push-client.ts:1                      PUSH_PREF_KEY
lib/naver-place-import.ts:1               NAVER_PLACE_MENUS_STORAGE_KEY
lib/invoice-document.ts:18                INVOICE_DOCUMENT_BUCKET_SUGGESTED
```

---

## 2. 🟡 확인 후 삭제 검토 — 기능 단위 7덩어리

> 개별 함수가 아니라 **기능 통째로** 판단해야 하는 것들이다. 전부 "코드는 있는데 실행 흔적이 없거나 DB가 없다".

### D-검토-01 · 견적(Quote) 기능 — 코드는 완비, 실사용 1건, DB 컬럼 없음

**[SQL 결과]** `quotes` **1행**(2026-07-31 E2E 테스트) / `quote_items` **0행** / `quote_logs` **0행**
**[코드 근거]** `actions/quote.ts`(약 500행), `actions/quote-export.ts`, `app/(app)/quotes/*` 3페이지, `app/(app)/orders/quotes/*` 리다이렉트 3개 + `QuoteCreateClient`/`QuoteDetailClient`/`QuoteListClient`, `components/quote/QuoteExportButton.tsx`
**상태**: `quotes.deleted_at` 부재로 목록·상세·수정·삭제·내보내기가 **전부 실패**(M-01), 견적번호는 영구 `-0001`(M-07)
**미참조 함수**: `updateQuote`(`:127`), `convertQuoteToOrder`(`:443`)
**판단 필요**: 컬럼 1개 추가로 살릴 것인가, 기능째 걷어낼 것인가 → C-01

### D-검토-02 · 메시지 템플릿 + 영업 액션 로그 — 절반만 만들어진 기능

**[SQL 결과]** `message_templates` 테이블 **없음** / `action_logs` **1행, 마지막 2026-04-07(5개월 전)** / `message_logs` 3행, 마지막 2026-07-31
**[코드 근거]** `actions/message-template.ts`(4함수 전부 죽은 테이블), `actions/action-log.ts`(`message_template_id` 때문에 무음 실패), `components/settings/MessageTemplateManager.tsx`, `app/(app)/settings/messages/page.tsx`, `Sidebar.tsx:88`
**미참조 함수**: `getAligoSettings`·`saveAligoSettings`(`actions/message.ts:70,85`) — 솔라피로 갈아탄 뒤 남은 알리고 잔재
**판단 필요**: 테이블을 만들 것인가, 화면·액션을 걷어낼 것인가 → C-02

### D-검토-03 · 식당OS 「거래처 관리」 — 테이블이 없다

**[SQL 결과]** `suppliers` 테이블 **없음**. (`_etl_suppliers`는 존재하나 0행 + 코드 미참조)
**[코드 근거]** `actions/suppliers.ts` 3함수, `app/(app)/suppliers/` 3페이지 + `SupplierNewClient.tsx`, `components/more/MoreClient.tsx:19` 링크
**판단 필요**: `customers`로 통합할 것인가 → C-03 (`docs/CONTEXT.md`가 이미 「⚠️ 목표와 다름」 표시)

### D-검토-04 · 식당OS 식자재/메뉴/명세서 OCR 라인 — 4개월째 정지

**[SQL 결과]**
```
ingredients               0행
menu_ingredients          0행
ingredient_price_history  0행
ingredient_unit_history   0행
invoice_suppliers         0행
menus                     2행  마지막 2026-05-17
menu_cost_cache           2행
fixed_costs              15행  마지막 2026-05-18
```
**[코드 근거]** `actions/import.ts`(약 500행, DB 컬럼 7개 부재), `actions/ingredients.ts`, `actions/menus.ts`, `lib/invoice-ocr.ts`·`invoice-ocr-correction.ts`·`invoice-table-crop.ts`·`invoice-item-validation.ts`·`invoice-document.ts`·`ingredient-canonical.ts`·`sku.ts`·`market-reference.ts`, `components/settings/IngredientsClient.tsx`·`MenusClient.tsx`·`InvoiceOcrReviewGroups.tsx`
**미참조 함수**: `createIngredientsBatch`, `getIngredientPriceAtDate`, `deleteIngredient`, `analyzeInvoiceImage`, `isValidInvoiceItemSpec`, `formatInvoiceItemDisplayTitle`, `lookupReference`, `skuDisplayName`
**판단 필요**: 로드맵상 위치 → C-04

### D-검토-05 · 신뢰엔진 / 관계 / RFQ — 전부 0행

**[SQL 결과]**
```
trust_scores 0  trust_score_logs 0  relationships 0  tenant_relationships 0
rfq_requests 0  rfq_bids 0  restaurant_order_items 0
```
**[코드 근거]**
- `realmyos/src/actions/admin/trust-engine.ts` — 미참조 `syncTrustScoreFromRealData`(`:509`), `runTrustSyncBatch`(`:597`, **scripts가 씀 → ⚪ 유지**)
- `realmyos/src/actions/admin/trade-monitor.ts:98` `detectTradeAnomalies` 미참조
- 양쪽 `lib/rfq-notify-suppliers.ts` — **두 레포에 100% 동일 파일**, `insertNotificationRow`·`notifyBidResult` 미참조
- `realmyos/src/actions/rfq.ts`, `restaurant-os/src/actions/rfq.ts`(`createBid:182` 미참조)
- 화면은 살아 있다: `(admin)/admin/participants/*`, `(admin)/admin/trades/*`, `(app)/rfq/*`
**주의**: `docs/CONTEXT.md`가 `relationships`를 「RFQ 거래 형성·반복주문 관계 유지의 연결 축」이라고 제품 정의로 못박고 「코드 미사용=미구현 표현은 철회」라고 명시했다. **지우면 안 되고, 미완이라는 사실만 기록한다.**

### D-검토-06 · 가격정책 엔진 — 코드는 양쪽에 있는데 데이터가 0

**[SQL 결과]** `pricing_policies` **0행** / `pricing_policy_targets` **0행**
**[코드 근거]** `lib/pricing-policy-engine.ts`가 **두 레포에 100% 동일하게 존재**. 미참조 함수: `matchTargetTier`, `bestTierForPolicyOnLine`, `batchApplicablePoliciesByListingId`, `buildAppliedPolicySnapshot`, `parsePricingPoliciesFromRpcJson`(realmyos) / `matchTargetTier`, `bestTierForPolicyOnLine`, `getApplicablePricingPolicy`(restaurant-os)
`realmyos/src/actions/admin/pricing-policies.ts:218` `getApplicablePricingPolicyAdminPreview` 미참조
체크아웃 경로(`restaurant-os/src/actions/buy.ts:1184` → RPC `fetch_active_pricing_policies_for_checkout`)는 살아 있으나 정책이 0건이라 항상 빈 배열을 받는다.
**판단**: 곧 쓸 기능이면 유지, 아니면 두 레포 중복부터 정리

### D-검토-07 · 정산/자금/쿠폰 — 0행 테이블 묶음

**[SQL 결과]**
```
supplier_payables 0   payment_allocations 0   fund_rules 0   fund_transfers 0
coupons 0   coupon_uses 0   subscription_billing_attempts 0   shipping_groups 0
action_queue 0   notifications 0   notices 0   today_events 0   savings_stats 0
ai_decision_logs 0   sales_leads 0   sales_lead_notes 0   wishlist_items 0
```
**[코드 근거] 미참조 함수**
```
admin/settlement-control.ts:45   ensureAdminSettingsDefaultsForSettlement
admin/settlement-control.ts:656  setCreditLineOverride
admin/commerce-reversal.ts:87    cancelSupplierPayableWithClient
admin/commerce-reversal.ts:321   createPaymentReversalRow
admin/action-queue.ts:101        createActionQueueItem
admin/ingredient-master.ts:219   mergeMasterIngredients
admin/commerce.ts:329            getSubCategories
admin/commerce.ts:720            updateListingPrice
admin/commerce.ts:1496           createListing          ← createListingFull 로 대체됨
actions/collection.ts:128,146,164,230  markCollectionDone, markCollectionDoneById,
                                       getPendingCollectionSchedule, getCollectionScheduleMap
actions/customer-deposits.ts:37  getDepositLogs
actions/ledger.ts:553,923        getDailyCashflow, getCustomersWithStats
actions/order.ts:560             confirmOrder
actions/payment.ts:415           insertInboundPaymentReversal
actions/admin.ts:163,205         getAdminDashboard, getTenantList
```
`getAdminDashboard`·`getTenantList`는 `admin/dashboard-metrics.ts`·`getTenantAdminList`로 대체된 **구세대 함수**로 보인다.

---

## 3. ⚪ 당장은 유지

### D-유지-01 · `src/`에서는 안 쓰이지만 `scripts/`가 쓰는 것 (4개)
```
lib/ledger-calc.ts:63       isConfirmedRevenueStatus  ← backfill-order-customer-a.ts, -b-ok.ts, phase1-dup-payment-reversal.ts
lib/subscription-renewal.ts:84   kstToday             ← unit-renewal-dates.ts
lib/subscription-renewal.ts:117  nextExpiresAt        ← unit-renewal-dates.ts
admin/trust-engine.ts:597   runTrustSyncBatch         ← _dryrun-trust-engine.ts
```
지우면 운영 백필/검증 스크립트가 깨진다.

### D-유지-02 · 최근 추가된 기능
`field_observations` 3행 (마지막 **2026-09-07**), `customer_tag_logs` 51행 (2026-09-07), `admin_logs` 454행 (2026-09-08) — 현역이다.

### D-유지-03 · 미참조 `type` / `interface` 200개 (realmyos 128 + restaurant 72)
같은 파일 안에서 함수 시그니처에 쓰이는데 `export`만 불필요한 경우가 대부분이다. **런타임 비용 0**이라 우선순위가 낮다. `export` 키워드만 떼는 정리는 언제든 안전하다.

### D-유지-04 · 코드가 한 번도 안 건드리는 DB 테이블 14개
```
_etl_order_items  _etl_orders  _etl_payments_outgoing  _etl_restaurants
_etl_rfq_bids  _etl_rfq_requests  _etl_suppliers        ← 레거시 ETL, docs/CONTEXT.md 가 별도 관리 전제로 명시
categories                    ← product_categories 로 대체됨 (1행)
customer_monthly_stats (0)    notices (0)               product_code_sequences (0)
product_related_manual (0)    supplier_contacts (0)     tenant_relationships (0)
```
DB 객체라 코드 삭제와 별개 판단이 필요하다. **읽기 전용 조사이므로 아무것도 지우지 않았다.**

---

## 4. 중복 구현

### D-중복-01 · 두 레포에 **100% 동일한 파일** 4쌍
```
realmyos/src/lib/barcode-lookup.ts          ≡  restaurant-os/src/lib/barcode-lookup.ts        (100%)
realmyos/src/lib/pricing-policy-engine.ts   ≡  restaurant-os/src/lib/pricing-policy-engine.ts (100%)
realmyos/src/lib/rfq-notify-suppliers.ts    ≡  restaurant-os/src/lib/rfq-notify-suppliers.ts  (100%)
realmyos/src/components/product/BarcodeScanner.tsx ≡ restaurant-os/.../BarcodeScanner.tsx     (100%)
```
거의 동일한 것:
```
(auth)/terms/page.tsx        98%     (auth)/privacy/page.tsx     97%
subscribe/billing/fail       94%     subscribe/page.tsx          91%
subscribe/billing/success    89%
```
**위험**: 한쪽만 고치면 두 OS의 동작이 갈라진다. 실제로 그런 일이 이미 일어났다 → D-중복-05.

### D-중복-02 · `requireAdmin` — **21곳에 각자 구현**
```
lib/auth.ts (공용, export)  ←  이게 있는데도
actions/admin.ts / admin/action-queue.ts / admin/bulk-listing.ts / admin/commerce-allocation.ts /
admin/commerce-listing-transfer.ts / admin/commerce-reversal.ts / admin/commerce.ts / admin/coupons.ts /
admin/dashboard-metrics.ts / admin/field-observations.ts / admin/policy-console.ts / admin/pricing-policies.ts /
admin/sales-lead-sms.ts / admin/sales-leads.ts / admin/sales-promo.ts / admin/settlement-control.ts /
admin/storefront-bank-transfer.ts / admin/supplier-payables.ts / admin/trade-monitor.ts / admin/trust-engine.ts
```
**보안 영향**: 관리자 판정 로직을 바꾸려면 21곳을 다 고쳐야 한다. 실제로 `actions/admin/` 안에 **가드가 아예 없는 export 함수가 10개** 있다 (`createActionQueueItem`, `upsertIngredientMaster`, `reorderCategory`, `ensurePolicyDefaults`, `getTrustLevelThresholds`, `getAdminSettingNumber`, `analyzeProductStrengths`, `cancelPendingCommerceOrderAllocationsForOrder`, `cancelSupplierPayableWithClient`, `processCommerceOrderCancelledAccountingP0`). 원가를 반환하는 것은 없지만, 21벌 분산이 누락을 만든 구조다.

### D-중복-03 · `insertAdminLog` — **13곳에 각자 구현**
```
actions/admin.ts, admin/action-queue.ts, admin/commerce-allocation.ts, admin/commerce-listing-transfer.ts,
admin/commerce-reversal.ts, admin/commerce.ts, admin/policy-console.ts, admin/settlement-control.ts,
admin/storefront-bank-transfer.ts, admin/supplier-payables.ts, admin/trade-monitor.ts, admin/trust-engine.ts,
lib/subscription-renewal.ts
```
`docs/CONTEXT.md`의 「모든 행동 → admin_logs 기록 필수」를 13벌로 나눠 구현한 상태다.

### D-중복-04 · 날짜·통화 유틸이 파일마다 재구현
| 함수 | 정의 위치 수 | 비고 |
|---|---|---|
| `formatKRW` | **8** | `lib/calc.ts`(realmyos) / `lib/utils.ts`(restaurant) 공용본이 있는데도 6곳이 재구현 |
| `todayKST` | 7 | realmyos |
| `kstTodayStr` | 5 | realmyos |
| `fmtDate` | 6 | 두 레포 |
| `formatDate` | 4 | realmyos |
| `monthStartStr` / `daysAgoStr` | 각 3 | realmyos |
| `kstTodayDateString` | 3 | 두 레포 |
| `downloadBlob` / `pdfBlobToJpgBlob` | 각 3 | realmyos |
| `todayStr` | 2 | `lib/calc.ts` ↔ `lib/utils.ts` |

### D-중복-05 · **같은 일을 하는 함수 2벌 — 한 벌만 스키마 변경을 따라갔다** 🔴

`restaurant-os`에서 메뉴 조회/생성이 두 곳에 있다:
| 파일 | 쓰는 컬럼 | 상태 |
|---|---|---|
| `src/actions/menus.ts` (`getMenus`, `createMenu`) | `is_representative` | ✅ 정상 |
| `src/actions/restaurant.ts:140,162` (`getMenus`, `createMenu`) | `is_featured` | ❌ **없는 컬럼 → 42703** |

`restaurant.ts` 쪽을 `app/(app)/settings/page.tsx`와 `settings/fixed-costs/page.tsx`가 쓴다 → **설정 화면이 깨져 있다** (`schema-mismatch-report.md` M-04).
**이것이 중복 구현이 실제로 사고를 낸 증거다.**

### D-중복-06 · 그 외 동일 이름 함수 (양 레포 교차 포함)
```
createSupabaseAdmin   3곳 (realmyos actions/admin.ts, lib/supabase-admin.ts / restaurant lib/supabase-server.ts)
getAuthCtx            2곳 (레포별 1개씩 — 시그니처·동작 다름)
cancelOrder / updateOrderStatus   realmyos actions/order.ts  ↔  restaurant actions/orders.ts
getListings / getCommerceOrderDetail   realmyos admin/commerce.ts ↔ restaurant actions/buy.ts
getSubscriptionStatus / getNotifications / markNotificationRead / getRfqDetail / lookupBarcode   각 2곳
deleteAuthUser / deleteTenant   realmyos actions/admin.ts ↔ restaurant actions/signup.ts
tryRecordPlatformReceivablePayment / resolveSupplierTenantId / loadPlatformFeePercentNumerator
                      realmyos admin/commerce-allocation.ts ↔ restaurant lib/commerce-order-erp.ts   ← 정산 로직 중복
getIngredients / getMenus / createMenu / markPaymentPaid   restaurant 내부 2곳씩
isLikelySameIngredient / findCanonicalIngredient / parseSupplierFromMemo / todayDateString
                      restaurant actions/ingredients.ts ↔ components/settings/IngredientsClient.tsx
parseCSV / parseNumber / cellStr / validateRow   realmyos 업로드 계열 2곳씩
```
가장 위험한 축은 **정산 로직 중복**(`commerce-allocation.ts` ↔ `commerce-order-erp.ts`)이다. 두 레포가 같은 `commerce_order_allocations`에 쓴다.

### D-중복-07 · 통째로 복붙된 페이지
```
realmyos  (app)/customers/loading.tsx ≡ orders/loading.tsx ≡ payments/loading.tsx ≡ products/loading.tsx  (100%)
                                       ≈ funds/loading.tsx (90%)
realmyos  components/customer/CustomerOrderModal.tsx ≈ CustomerPaymentModal.tsx                     (98%)
realmyos  components/ledger/LedgerStatementExportButtons.tsx ≈ order/OrderStatementExportButtons.tsx (91%)
restaurant (app)/money/{cashflow,suppliers,upcoming}/page.tsx  서로 97%
restaurant api/push/subscribe/route.ts ≈ unsubscribe/route.ts                                       (88%)
```

---

## 5. 실행 로그 0건인 기능 (DB 기준)

**[SQL 결과]** 96개 테이블 중 **37개가 0행**
```
action_queue            ai_decision_logs        coupon_uses             coupons
customer_monthly_stats  fund_rules              fund_transfers          ingredient_price_history
ingredient_unit_history ingredients             invoice_suppliers       menu_ingredients
notices                 notifications           payment_allocations     price_history
pricing_policies        pricing_policy_targets  product_code_sequences  product_related_manual
quote_items             quote_logs              relationships           restaurant_order_items
rfq_bids                rfq_requests            sales_lead_notes        sales_leads
savings_stats           shipping_groups         subscription_billing_attempts  supplier_contacts
supplier_payables       tenant_relationships    today_events            trust_score_logs
trust_scores            wishlist_items          _etl_payments_outgoing  _etl_rfq_bids
_etl_rfq_requests       _etl_suppliers
```

**행은 있으나 오래 멈춘 것**
| 테이블 | 행 | 마지막 기록 | 경과 |
|---|---|---|---|
| `action_logs` | 1 | **2026-04-07** | 5개월 — 무음 실패 때문 (M-06) |
| `sales_schedules` | 1 | 2026-04-12 | 5개월 |
| `menus` | 2 | 2026-05-17 | 4개월 |
| `fixed_costs` | 15 | 2026-05-18 | 4개월 |
| `product_logs` | 61 | 2026-07-20 | 1.5개월 |
| `deposit_logs` | 30 | 2026-07-21 | 1.5개월 |
| `commerce_orders` | 9 | 2026-07-31 | 1.3개월 |
| `quotes` / `message_logs` / `contact_logs` | 1 / 3 / 6 | 2026-07-31 | 1.3개월 |

**지금 살아 움직이는 축** (2026-09-07~08): `orders`(282) · `order_lines`(518) · `payments`(258) · `collection_allocations`(202) · `customers`(142) · `admin_logs`(454) · `products`(199) · `product_costs`(194) · `commerce_product_listings`(38) · `customer_tag_logs`(51) · `field_observations`(3)

→ **두 시스템에서 실제로 매일 돌아가는 것은 「공급자OS의 주문·수금·거래처·상품」과 「관리자OS의 커머스 상품 등록」뿐이다.** 나머지는 대부분 정지 상태다.

---

## 6. 정리 제안 (우선순위)

| 순위 | 작업 | 난이도 | 이유 |
|---|---|---|---|
| 1 | **D-중복-05** `restaurant.ts`의 `getMenus`/`createMenu` 제거하고 `menus.ts`로 일원화 | 간단 | 지금 깨진 화면을 고치면서 중복도 없앤다 |
| 2 | **D-고아-01** `(admin)/participants|policy|settlements` 잔재 4파일 | 간단 | 라우트가 없어 렌더링 불가. C-09 확인 후 |
| 3 | **D-중복-02/03** `requireAdmin`·`insertAdminLog` 공용화 | 중간 | 보안 로직 21벌 분산이 가드 누락 10건을 낳았다 |
| 4 | **D-중복-01** 두 레포 100% 동일 파일 4쌍 | 중간 | 갈라지기 전에. 공유 패키지 vs 한쪽 삭제는 결정 필요 |
| 5 | **D-고아-02** `components/today/` 고아 9개 | 간단 | D-검토-04 결정과 묶어서 |
| 6 | **D-안전-04** 미사용 상수 | 간단 | 기계적 |
| 7 | **D-검토-01~07** 기능 존폐 | — | **제품 결정이 먼저** (C-01 ~ C-04) |
| 8 | **D-유지-03** 미참조 `export` 타입 200개 | 간단 | 이득이 작아 마지막 |

> 이번 조사는 읽기 전용이므로 **아무것도 삭제하지 않았다.** 위는 전부 제안이다.

---

# 【2차 보완】 2026-09-09 — DB 층의 죽은 자산 (D-DB-01 ~ D-DB-03)

> 2차 조사(`audit-log-round2.md`)에서 추가. 위 본문은 1차 기록 그대로 둔다.
> 1차와 동일하게 **🟢 삭제해도 안전 / 🟡 확인 후 삭제 검토 / ⚪ 당장은 유지** 3단계로만 제안한다. **이번에도 아무것도 삭제하지 않았다.**

## 7. 1차가 못 본 층 — 코드가 아니라 DB에 죽은 것이 있다

1차는 `src/` 안의 미참조 `export`와 고아 파일을 찾았다. 그 방법으로는 **DB 안의 죽은 자산**이 잡히지 않는다. 2차에서 `supabase db query`로 DB를 직접 조회해 다음을 찾았다.

### D-DB-01 · 🟡 **`dev` 스키마 — 7테이블 354행, 참조하는 코드가 없다**

```
dev.orders         95행 (33컬럼)     dev.order_lines   170행 (19컬럼)
dev.payments       81행 (24컬럼)     dev.tenants         6행 (13컬럼)
dev.users           2행 ( 7컬럼)     dev.execution_logs  6행 (13컬럼)
dev.relationships   0행 (12컬럼)
```

| 검사 | 결과 |
|---|---|
| 두 레포 `src/` 참조 | **0건** |
| 두 레포 `supabase/migrations/` 참조 | **0건** |
| PostgREST 노출 | **없음** (`PGRST106: Only public, graphql_public`) |
| 인덱스 | `orders`/`order_lines`/`payments`/`tenants`/`users` **전부 0 bytes (인덱스 없음)** |

**판정: 🟡 확인 후 삭제 검토.**
컬럼 수(33/19/24)가 `public` 대응 테이블과 비슷해 **운영 데이터의 스냅샷 사본**으로 보인다. 인덱스가 하나도 없다는 점이 "쓰기 전용 덤프"라는 해석을 뒷받침한다.
그러나 **무엇의, 언제 사본인지 알 수 없다.** 백업 목적이라면 지우면 안 되고, 실험 잔재라면 지워야 한다. → `C-12`

### D-DB-02 · 🟡 **`nurungchip` 스키마 — 6테이블, 별도 서비스 잔재로 보임**

```
nurungchip.repurchase_queue  3행     nurungchip.orders          1행
nurungchip.customers         1행     nurungchip.leads           0행
nurungchip.lead_activities   0행     nurungchip.order_items     0행
+ 함수 handle_new_order + 트리거 nurungchip_after_order (둘 다 실재)
```

| 검사 | 결과 |
|---|---|
| 두 레포 `src/` 참조 | **0건** |
| 마이그레이션 참조 | **0건** |
| PostgREST 노출 | 없음 |

**판정: 🟡 확인 후 삭제 검토.**
이름이 두 제품(`RealMyOS`/`restaurant-os`) 어느 쪽과도 무관하다. **트리거가 살아 있으므로** `nurungchip.orders`에 INSERT가 들어오면 지금도 함수가 돈다. 다만 넣는 코드가 없다. → `C-13`

### D-DB-03 · 🟢 **뷰 0개 — 확인 결과 정리할 것 없음**

`public` 스키마의 뷰는 **0개**다. 죽은 뷰를 찾을 필요가 없다. (기록 목적)

---

## 8. 죽은 코드가 아니라 「막힌 코드」 — RLS 정책 0개 테이블 17개

1차의 3분류(삭제 안전/확인 후/유지)에 안 맞는 유형이라 별도로 적는다.
**RLS는 켜져 있는데 정책이 하나도 없는** 테이블 17개는, 코드가 살아 있어도 **사용자 세션에서는 무조건 0행**이다.

```
ingredient_master, ingredient_mappings, ingredient_price_history, ingredient_unit_history,
invoice_suppliers, coupons, coupon_uses, push_logs, push_subscriptions,
subscription_billing_attempts,
_etl_order_items, _etl_orders, _etl_payments_outgoing, _etl_restaurants,
_etl_rfq_bids, _etl_rfq_requests, _etl_suppliers
```

| 묶음 | 1차 판정 | 2차가 더하는 것 |
|---|---|---|
| `ingredient_*` 4개 | `D-검토-04`·`C-04`「식자재 기능 존폐」 | **컬럼을 다 고쳐도 사용자 세션에서는 안 보인다.** 되살리려면 RLS 정책도 함께 만들어야 한다 |
| `_etl_*` 7개 | 1차 「0행 테이블 37개」에 포함 | 전부 0행 + 정책 0개. **일회성 이관(ETL) 잔재로 보인다** → 🟡 삭제 검토 후보 |
| `push_*` 2개 | 미언급 | `push_subscriptions` 3행 존재. 푸시 기능이 service_role 경유로만 동작 |
| `coupons`/`coupon_uses` | 1차 「0행」 | `redeem_coupon`이 `SECURITY DEFINER`라 함수 경유로만 동작하는 **의도된 설계로 보임** → ⚪ 유지 |

---

## 9. 죽지는 않았지만 낭비 — 인덱스 없는 FK 59개

`public` FK **144개 중 59개(41%)** 에 인덱스가 없다. 1차 조사가 `0-2`-4에서 「OpenAPI가 노출하지 않아 미검증」으로 남긴 항목이다.

실측 `seq_scan` 횟수와 대조해 **실제로 자주 훑히는 것**만 추린다:

| 테이블 (seq_scan) | 인덱스 없는 FK |
|---|---|
| `customers` (2,840) | `acquisition_channel_id`, `deleted_by`, `linked_tenant_id` |
| `payments` (1,554) | `created_by`, `supplier_contact_id` |
| `orders` (1,143) | `created_by`, `rfq_id`, `bid_id` |
| `commerce_product_listings` (791) | `supplier_tenant_id`, `product_id`, `category_id`, `shipping_group_id` |
| `cart_items` (140) | `listing_id` |
| `wishlist_items` (13) | `listing_id` — 미배포 기능(1단계 G묶음) |

**판정: ⚪ 당장은 유지.** 현재 데이터 규모(최대 522행)에서는 성능 문제가 없다. 다만 `commerce_product_listings.supplier_tenant_id`는 **/buy 상품 목록의 핵심 조인**이므로 리스팅이 수백 개로 늘면 가장 먼저 문제가 된다. → `C-15`

### 별도 관찰 · `users` 테이블 seq_scan 1,917,426회
6행짜리 테이블인데 순차 스캔이 **191만 회**다. 다른 테이블이 3~4자릿수인 것과 자릿수가 다르다.
행이 6개라 지금은 비용이 사실상 0이지만, **모든 요청이 `users`를 훑고 있다**는 뜻이다. 인증·권한 조회 경로에 캐시가 없다는 신호다. 죽은 코드는 아니므로 여기서는 기록만 하고, 개선안은 `improvement-suggestions.md`로 넘긴다.

---

## 10. 1차 §6 「정리 제안」에 추가

| 순위 | 작업 | 난이도 | 이유 |
|---|---|---|---|
| (신규) | **D-DB-01/02** `dev`·`nurungchip` 스키마 존폐 결정 | — | **제품/보안 결정이 먼저**(`C-12`,`C-13`). 삭제 시 354행이 사라지므로 되돌릴 수 없다 |
| (신규) | **D-DB-03** `_etl_*` 7테이블 (전부 0행 + 정책 0개) | 간단 | 이관 잔재로 보임. 위 결정과 묶어서 |
| (신규) | RLS 정책 0개 17개 테이블 — 의도/누락 판별 | 중간 | `ingredient_*`는 기능 복구와 직결(`C-14`) |

> 1차와 동일하게 **이번 조사도 읽기 전용이며 아무것도 삭제하지 않았다.** 위는 전부 제안이다.
