# schema-mismatch-report.md — 코드-DB 불일치 전수 스캔 (1단계)

- 조사일: 2026-09-09
- 대상: `RealMyOS/src` (335 파일) + `restaurant-os/src` (179 파일)
- 대조 기준: 운영 DB `cqiwcyuclpuarynrreat` public 스키마 실측 (테이블 96개)
- 방법: Server Action / API 라우트 / 페이지의 `.from('테이블')` 체인에서 `.select` / 필터(`eq·is·in·order`…) / `.insert·.update·.upsert` 객체 키를 추출 → PostgREST OpenAPI 스키마와 대조 → 의심 항목은 `GET /rest/v1/<t>?select=<col>` 로 개별 재확인(`42703` 확인)
- **모든 항목은 운영 DB에 직접 쿼리해 확인했다. 마이그레이션 파일 기준 추정 없음.**

---

## 0. 요약

| 심각도 | 건수 | 뜻 |
|---|---|---|
| 🔴 **즉시 에러** | **5** | 화면에 들어가거나 버튼을 누르면 바로 실패. 사용자에게 에러가 보임 |
| 🟠 **무음 실패** | **2** | 에러를 코드가 삼킨다. 실패했는데 성공처럼 보임 — **가장 위험** |
| 🟡 **조건부 에러** | **2** | 특정 조작에서만 실패 |
| ⚪ **죽은 코드** | **3** | 깨져 있지만 아무도 호출하지 않음 |
| ⛔ 오탐 | 4 | 스캐너 오인. 실제 문제 아님 (§4) |

- 코드가 참조하는데 **DB에 없는 테이블: 2개** (`message_templates`, `suppliers`)
- 코드가 참조하는데 **DB에 없는 컬럼: 13개** (오탐 1건 제외)
- 코드가 호출하는 RPC 22개는 **전부 존재하고 인자 이름도 100% 일치** (드리프트 0건)

---

## 1. 🔴 즉시 에러

### M-01 · `quotes.deleted_at` 컬럼 없음 — 견적 기능 전반 마비 (realmyos)

**[SQL 결과]**
```
GET /rest/v1/quotes?select=deleted_at&limit=1
→ {"code":"42703","message":"column quotes.deleted_at does not exist"}   HTTP 400

quotes 실제 컬럼:
  created_at, created_by, customer_id, expires_at, id, memo,
  quote_date, quote_number, status, tenant_id, total_amount, updated_at
```

**[코드 근거]** `deleted_at`을 쓰는 곳 전부 (8곳)

| 파일:라인 | 함수 | 결과 |
|---|---|---|
| `src/actions/quote.ts:289` | `getQuotes` | `.is('deleted_at', null)` → **견적 목록 화면 전체 실패** |
| `src/actions/quote.ts:356` | `getQuoteDetail` | 동일 → **견적 상세 실패** |
| `src/actions/quote.ts:137` | `updateQuote` | `existing`이 null → `"견적을 찾을 수 없습니다."` → **수정 불가** |
| `src/actions/quote.ts:197` | `deleteQuote` | `.update({deleted_at})` → error 반환 → **삭제 불가** |
| `src/actions/quote-export.ts:53` | 견적서 내보내기 | → **PDF/엑셀 내보내기 실패** |
| `src/actions/quote.ts:241` | `getQuotes` 내부 | 동일 |
| `src/actions/quote.ts:38` | `issueQuoteNumber` | **무음 실패 → M-06 참조** |
| `src/actions/quote.ts:108` | `createQuote` 롤백 경로 | 롤백 자체가 실패(고아 견적 잔존) |

**도달 경로**: 사이드바 → `/quotes`, `/quotes/[id]`, `/quotes/new` (`src/app/(app)/quotes/`). `/orders/quotes/*`는 여기로 리다이렉트한다.

**마이그레이션 상태**: `quotes.deleted_at`을 추가하는 마이그레이션이 **양쪽 레포 어디에도 없다**. `20260508161000_fix_quotes_soft_delete_and_logs.sql`은 `quote_items.is_active`와 `quote_logs.tenant_id`만 다루고 `quotes.deleted_at`은 건드리지 않는다(둘 다 DB에 정상 존재 확인).

**실사용 흔적**: `quotes` 1행(2026-07-31, E2E 테스트), `quote_items` 0행, `quote_logs` 0행 → **견적 기능은 실사용 이력이 없다.** 우선순위 판단에 반영할 것.

---

### M-02 · `message_templates` 테이블 없음 — 메시지 템플릿 화면 전체 (realmyos)

**[SQL 결과]**
```
GET /rest/v1/message_templates?select=id&limit=1
→ {"code":"PGRST205","message":"Could not find the table 'public.message_templates' in the schema cache",
   "hint":"Perhaps you meant the table 'public.message_logs'"}
```

**[코드 근거]** `src/actions/message-template.ts` — 4개 함수 전부가 이 테이블만 쓴다
- `:33` `getMessageTemplates` / `:60` `createMessageTemplate` / `:93` `updateMessageTemplate` / `:114` `deactivateMessageTemplate`

**도달 경로 (라이브)**
- `src/components/layout/Sidebar.tsx:88` → 「메시지 템플릿」 → `/settings/messages`
- `src/app/(app)/settings/page.tsx:55` → 설정 허브 카드
- `src/app/(app)/settings/messages/page.tsx:13` → `getMessageTemplates()` 호출
- `src/components/settings/MessageTemplateManager.tsx` → 나머지 3개 호출

→ **사이드바에서 클릭 가능한 화면이 통째로 죽어 있다.**

---

### M-03 · `suppliers` 테이블 없음 — 식당OS 「거래처 관리」 전체 (restaurant-os)

**[SQL 결과]**
```
GET /rest/v1/suppliers?select=id&limit=1
→ {"code":"PGRST205","message":"Could not find the table 'public.suppliers' in the schema cache",
   "hint":"Perhaps you meant the table 'public._etl_suppliers'"}
```

**[코드 근거]**
- `src/actions/suppliers.ts:31` `getSuppliers` / `:94` `getSupplierDetail` / `:140` `createSupplier`
- `src/actions/import.ts:157`, `:168` (명세서 import 중 거래처 매칭)

**도달 경로 (라이브)**
- `src/components/more/MoreClient.tsx:19` → 「🤝 거래처 관리」 → `/suppliers`
- `src/app/(app)/suppliers/page.tsx:2` → `getSuppliers()`
- `src/app/(app)/suppliers/[id]/page.tsx:1` → `getSupplierDetail()`
- `src/app/(app)/suppliers/new/SupplierNewClient.tsx:5` → `createSupplier()`

**배경**: `docs/CONTEXT.md`가 이미 `suppliers`를 「restaurant-os 전용 주소록(별도 테이블) — ⚠️ 목표와 다름」으로 표시해뒀다. 테이블이 만들어진 적이 없거나 통합 과정에서 사라진 것으로 보인다. **`_etl_suppliers`는 존재하지만 0행이며 코드가 참조하지 않는다.**

---

### M-04 · `menus.is_featured` 컬럼 없음 (실제는 `is_representative`) — 식당OS 설정 화면 (restaurant-os)

**[SQL 결과]**
```
GET /rest/v1/menus?select=is_featured&limit=1
→ {"code":"42703","message":"column menus.is_featured does not exist"}

menus 실제 컬럼:
  category, created_at, id, is_active, is_representative, memo, name, price, tenant_id, updated_at
```

**[코드 근거]** — **같은 일을 하는 코드가 두 벌인데 한 벌만 스키마를 따라갔다**

| 파일 | 쓰는 컬럼 | 상태 |
|---|---|---|
| `src/actions/menus.ts:283,287,304,305,308,368,394,395` | `is_representative` | ✅ 정상 |
| `src/actions/restaurant.ts:146,148,168` | `is_featured` | ❌ 42703 |

`restaurant.ts`
```ts
// :146  getMenus
.select('id, name, price, is_featured')        // ← 42703
.order('is_featured', { ascending: false })    // ← 42703
// :168  createMenu
.insert({ ..., is_featured: input.is_featured ?? false })   // ← 42703
```

**도달 경로 (라이브)**
- `src/app/(app)/settings/page.tsx:2` → `import { getRestaurant, getMenus } from '@/actions/restaurant'` → **설정 메인 진입 시 메뉴 조회 실패**
- `src/app/(app)/settings/fixed-costs/page.tsx:3` → 동일

**실사용 흔적**: `menus` 2행, 최종 2026-05-17 → 4개월 미사용.
**교차 참조**: `dead-code-report.md` D-중복-05 (동일 이름 함수 2벌).

---

### M-05 · `contact_logs.is_active` 컬럼 없음 — 영업이력 삭제 (realmyos)

**[SQL 결과]**
```
GET /rest/v1/contact_logs?select=is_active&limit=1
→ {"code":"42703","message":"column contact_logs.is_active does not exist"}
```

**[코드 근거]** `src/actions/sales.ts:716` `deleteContactLog`
```ts
// :730  ① 먼저 일정을 pending 으로 되돌린다  ← 성공한다
await supabase.from('sales_schedules').update({ status: 'pending' })...
// :739  ② 그 다음 이력을 비활성화한다        ← 42703 으로 실패한다
const { error } = await supabase.from('contact_logs').update({ is_active: false })...
if (error) return { success: false, error: error.message }
```

**도달 경로 (라이브)**
- `src/app/(app)/sales/history/SalesHistoryClient.tsx:143`
- `src/app/(app)/customers/[id]/CustomerSalesClient.tsx:139`

**추가 위험 — 부분 쓰기**: ①이 커밋된 뒤 ②가 실패한다. 즉 **삭제는 안 됐는데 영업 일정만 `pending`으로 되돌아간다.** 트랜잭션이 아니라서 되돌릴 수 없다. 사용자가 재시도할 때마다 일정 상태가 계속 리셋된다.

---

## 2. 🟠 무음 실패 (에러를 코드가 삼킨다)

> 지시서의 3분류에 없는 등급이라 새로 만들었다. 판단 근거는 `overnight-audit-log.md` J-10.

### M-06 · `action_logs.message_template_id` 컬럼 없음 — 영업 액션 로그가 5개월째 안 쌓임 (realmyos)

**[SQL 결과]**
```
GET /rest/v1/action_logs?select=message_template_id&limit=1
→ {"code":"42703","message":"column action_logs.message_template_id does not exist"}

action_logs 총 1행,  마지막 created_at = 2026-04-07T02:50:52Z   (오늘 기준 5개월 전)
```

**[코드 근거]** `src/actions/action-log.ts:30` `logAction`
```ts
export async function logAction(input: LogActionInput): Promise<string | null> {
  try {
    ...
    const { data, error } = await supabase.from('action_logs').insert({
      ...
      message_template_id: input.message_template_id ?? null,   // ← 42703, 항상
    }).select('id').single()
    if (error || !data) return null      // ← 에러를 버린다
    return data.id
  } catch { return null }                // ← 여기도 버린다
}
```

**영향**: 이 함수는 "버튼 클릭 기록 → `action_log_id` 반환"이 목적이다. 항상 `null`을 돌려주므로
1. `action_logs`에 아무것도 안 쌓인다 (실측 1행, 5개월간 0건 추가)
2. 반환된 `action_log_id`로 `contact_logs.action_log_id`를 연결하는 흐름이 전부 끊긴다
3. `updateActionConversion` / `linkActionResult`(`action-log.ts:67`, `:90`)의 전환·성과 추적이 대상 행을 못 찾는다

**연쇄**: `message_template_id`는 M-02의 `message_templates`를 가리키는 FK다. **M-02와 M-06은 같은 미완성 기능(메시지 템플릿)의 양쪽 끝이다.** 하나만 고치면 안 된다.

---

### M-07 · 견적번호가 영구히 `QUO-YYYYMMDD-0001` (realmyos)

**[코드 근거]** `src/actions/quote.ts:36`
```ts
async function issueQuoteNumber(supabase, tenant_id, quote_date) {
  const { count } = await supabase           // ← error 를 구조분해하지 않는다
    .from('quotes')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id)
    .eq('quote_date', quote_date)
    .is('deleted_at', null)                  // ← 42703 (M-01)
  const seq = String((count ?? 0) + 1).padStart(4, '0')   // count = undefined → 항상 '0001'
  return `QUO-${yyyymmdd}-${seq}`
}
```

**영향**: 쿼리가 400으로 실패해도 `count`만 꺼내므로 조용히 `undefined`가 된다. 같은 날 견적을 2건 이상 만들면 **번호가 전부 동일**해진다. `quotes.quote_number`에 UNIQUE 제약이 있는지는 확인 불가(OpenAPI가 제약을 노출하지 않음) → 제약이 있으면 2번째 견적 생성이 `23505`로 실패, 없으면 중복 번호가 그대로 저장된다.

**현재 실피해 없음**: `quotes` 1행뿐. 다만 견적 기능을 되살리는 순간 바로 터진다.

---

## 3. 🟡 조건부 에러 / ⚪ 죽은 코드

### M-08 🟡 · `customers.created_by` 컬럼 없음 — 견적용 거래처 즉석 생성 (realmyos)

**[SQL 결과]**
```
GET /rest/v1/customers?select=created_by&limit=1
→ {"code":"42703","message":"column customers.created_by does not exist",
   "hint":"Perhaps you meant to reference the column \"customers.created_at\"."}
```

**[코드 근거]** `src/actions/quote.ts:257`
```ts
const { data, error } = await supabase.from('customers').insert({
  tenant_id: ctx.tenant_id, name: ..., phone: ...,
  customer_type: 'prospect', trade_status: 'lead', is_buyer: true,
  created_by: ctx.user_id,          // ← 42703
}).select('id').single()
```

**조건**: 견적 작성 시 **기존에 없는 전화번호**를 입력해 새 거래처를 만들 때만. 기존 번호면 `:237`의 조회로 빠져나가므로 정상 동작한다.
**주의**: `orders.created_by`와 `quotes.created_by`는 **존재한다.** `customers`만 없다.

---

### M-09 🟡 · `ingredients` 7개 컬럼 없음 — 명세서 OCR 식자재 import (restaurant-os)

**[SQL 결과]** — 7개 전부 `42703` 확인
```
ingredients.barcode                     → 42703
ingredients.parsed_name                 → 42703
ingredients.brand                       → 42703
ingredients.manufacturer                → 42703
ingredients.supplier_name               → 42703
ingredients.possible_duplicate_group_id → 42703
ingredients.group_confirmed_same_at     → 42703

ingredients 실제 컬럼:
  category, created_at, current_price, id, is_active, memo, name,
  target_price, tenant_id, unit, updated_at        ← 레거시 최소 스키마
ingredients 행 수: 0
```

**[코드 근거]** `src/actions/import.ts` — 22개 지점
`:220`(select) `:238`(update) `:252`(insert) `:290`(select) `:319·:346·:363`(중복그룹) `:396·:398`(select/eq) `:413`(update) `:454·:456·:484`(그룹확정)

**왜 🟡인가**: import 진입점인 `TodayImportCard.tsx` / `TodayLoopCard.tsx`가 **어디서도 import되지 않는 고아 컴포넌트**다(`dead-code-report.md` D-고아-02). 화면에서 도달할 수 없으므로 현재 실피해 0. 되살리면 즉시 터진다.

**마이그레이션 상태**: `restaurant-os/supabase/migrations/20260508150000_add_ingredients_barcode_if_missing.sql` 이 `barcode`만 추가하는데, 파일 헤더에 **`-- WARNING: Migration file only. Do not execute without approval.`** 라고 적혀 있고 실제로 미적용이다. 나머지 6개 컬럼은 마이그레이션 자체가 없다.

---

### M-10 ⚪ · `product_costs.tenant_id` 컬럼 없음 (realmyos)

**[SQL 결과]**
```
GET /rest/v1/product_costs?select=*&tenant_id=eq.<uuid>
→ {"code":"42703","message":"column product_costs.tenant_id does not exist"}

product_costs 실제 컬럼:
  id, product_id, cost_price, start_date, end_date, created_at        ← tenant_id 없음
product_costs 행 수: 194
```

**[코드 근거]** `src/actions/product.ts:996` `getProductCostHistory`
```ts
.from('product_costs')
.select('id, start_date, end_date, cost_price, created_at')
.eq('tenant_id', ctx.tenant_id)      // ← 없는 컬럼. 항상 400
.eq('product_id', product_id)
```

**⚪로 분류한 이유**: `getProductCostHistory`를 **호출하는 코드가 없다**(전수 확인). 화면(`src/components/product/ProductDetailTabsClient.tsx:393` 「가격 변경 로그 (product_costs)」)은 존재하지만 데이터를 `getProductDetail`(`product.ts:920`, 정상 동작)에서 받는다.

**중요**: `product_costs`의 tenant 소속은 오직 `product_id → products.tenant_id`로만 판정된다. 이 구조는 `design-risk-report.md` R-02에서 별도로 다룬다.

---

### M-11 ⚪ · `product_stats.tenant_id` 컬럼 없음 (realmyos)

**[SQL 결과]**
```
GET /rest/v1/product_stats?select=tenant_id&limit=1
→ {"code":"42703","message":"column product_stats.tenant_id does not exist"}

product_stats 실제 컬럼: product_id, avg_unit_price, last_margin_rate, used_by_count, updated_at
product_stats 행 수: 180   /   used_by_count > 0 인 행: 0   /   last_margin_rate NOT NULL: 0
```

**[코드 근거]** `src/actions/product.ts:1348` `getProductMarginAnalysis`
```ts
supabase.from('product_stats').select('avg_unit_price')
  .eq('tenant_id', ctx.tenant_id)     // ← 42703
  .eq('product_id', product_id).maybeSingle(),
...
if (sErr) return { success: false, error: sErr.message }   // 에러를 그대로 반환
```

**⚪로 분류한 이유**: `getProductMarginAnalysis`를 호출하는 코드가 없다.
**부수 발견**: `product_stats`는 180행이 있지만 `used_by_count`가 전부 0, `last_margin_rate`가 전부 NULL이다. 즉 **테이블은 채워지는데 그 안의 지표 컬럼은 한 번도 갱신된 적이 없다.**

---

## 4. ⛔ 오탐 (스캐너가 잡았지만 실제 문제 아님)

| 항목 | 위치 | 실체 |
|---|---|---|
| `collection_allocations.payments` | `realmyos/src/actions/analytics.ts:198-199` | PostgREST **중첩 임베드 필터** `.eq('payments.status','confirmed')`. 정상 문법 |
| `${secretKey}` 라는 "테이블" | `realmyos/src/app/api/toss/billing/route.ts:49`, `restaurant-os/.../toss/confirm/route.ts:60`, `realmyos/src/lib/subscription-renewal.ts:263` | `Buffer.from(\`${secretKey}:\`)` — 스캐너가 `.from(` 을 오인 |
| `commerce-images` | `realmyos/src/actions/admin/commerce.ts:1655,1672` | `supabase.storage.from()` 버킷. **운영에 존재**(2026-05-10 생성, public) |
| `tenant-assets` | `realmyos/src/actions/settings.ts:217,233` | 동일. **운영에 존재**(2026-07-15 생성, public). 단 마이그레이션 파일이 없다 → `migration-drift-report.md` DR-05 |

---

## 5. 이상 없음이 확인된 영역

### 5-1. DB 함수(RPC) — 드리프트 0건
코드가 호출하는 22개 RPC가 전부 존재하고, **인자 이름도 100% 일치**한다.
```
accept_bid_and_create_order_atomic, allocate_payment_fifo, apply_field_observation_actions,
bulk_create_products, cancel_order_and_void_allocations, convert_quote_items,
create_disbursement_with_allocations, create_payment_atomic,
fetch_active_pricing_policies_for_checkout, generate_fund_transfers, get_supplier_balances,
get_supplier_rfqs, log_payment_reversal_audit, log_pricing_engine_admin_event,
nextval_product_code, nextval_product_code_n, redeem_coupon, reverse_disbursement,
soft_delete_customer, update_customer_stats, update_order_lines, upsert_savings_stat
```
(PostgREST 노출 25개 중 나머지 3개 `generate_order_number`·`get_my_tenant_id`·`is_admin`은 코드가 아닌 RLS/DB 내부에서 쓰인다.)

### 5-2. 나머지 테이블·컬럼
코드가 참조하는 82개 테이블 중 **위에 나열되지 않은 80개는 컬럼 단위까지 일치**한다. 특히 매일 쓰이는 축(`orders`, `order_lines`, `payments`, `collection_allocations`, `customers`, `products`, `product_costs`, `commerce_*`)에는 불일치가 없다.

---

## 6. 우선순위 제안

실사용 흔적(§`overnight-audit-log.md` 3-2)을 반영한 순서다. "깨진 정도"가 아니라 "지금 사람이 쓰다가 부딪히는가"로 정렬했다.

| 순위 | 항목 | 근거 |
|---|---|---|
| 1 | **M-06** action_logs 무음 실패 | 에러가 안 보인다. 5개월간 영업 로그 0건이 이미 발생한 실피해 |
| 2 | **M-02** message_templates | 사이드바에서 클릭 가능. M-06과 같은 기능의 반쪽 |
| 3 | **M-05** contact_logs.is_active | 라이브 화면 2곳 + **부분 쓰기로 일정 상태가 오염됨** |
| 4 | **M-04** menus.is_featured | 식당OS 설정 메인 진입 시 실패. 수정 자체는 컬럼명 한 줄 |
| 5 | **M-01 / M-07** quotes.deleted_at | 기능 전체가 죽었으나 실사용 0건 → 살릴지 접을지 결정이 먼저 (C-01) |
| 6 | **M-03** suppliers | 화면 3개가 죽었으나 `CONTEXT.md`가 이미 구조 미결로 표시 (C-03) |
| 7 | **M-08** customers.created_by | 조건부 + 견적 기능이 어차피 죽어 있음 |
| 8 | **M-09** ingredients 7개 | UI 진입점도 고아. 기능 존폐 결정이 먼저 (C-04) |
| 9 | **M-10 / M-11** product_costs·product_stats tenant_id | 현재 무피해. 다만 되살릴 때 반드시 걸림 |

> 근본 대책은 개별 수정이 아니라 **CI에서 코드 참조 컬럼과 운영 스키마를 자동 대조**하는 것이다. `improvement-suggestions.md` I-01 참조.
