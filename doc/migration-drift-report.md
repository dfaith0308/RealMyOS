# migration-drift-report.md — 마이그레이션 "적용완료" 신뢰성 전수 검증 (2단계)

- 조사일: 2026-09-09
- 대상: `RealMyOS/supabase/migrations` (104개) + `restaurant-os/supabase/migrations` (13개) = **117개 `.sql`**
- 대조 기준: 운영 DB `cqiwcyuclpuarynrreat` 실측
- 방법: 각 파일에서 `CREATE TABLE` / `ALTER TABLE ... ADD|DROP COLUMN` / `CREATE FUNCTION` / `CREATE POLICY` 를 파싱 → 운영 DB와 대조

---

## 0. 결론 먼저

| 검증 항목 | 결과 |
|---|---|
| **"적용 완료" 주장 44개 파일의 컬럼·테이블 수준 정합성** | ✅ **불일치 0건 — 주장은 신뢰할 수 있다** |
| 주장 없는 파일 중 **미적용** | ❌ **1건** (`add_ingredients_barcode_if_missing.sql`) |
| **파일 주석과 실제가 반대** | ⚠️ **2건** (「실행 금지」인데 적용돼 있음) |
| **역방향 드리프트** (DB에 있는데 레포에 DDL 없음) | ❌ **테이블 56/96개(58%) + 버킷 1개 + RLS 정책 다수** |
| **RLS 정책 본문 검증** | ⛔ **원천적으로 불가** — 대신 동작 검증 수행 (§4) |
| **트리거 함수 3개 존재 검증** | ⛔ **불가** |

**핵심**: 「적용 완료」주석 자체는 거짓이 아니었다. **진짜 문제는 반대 방향이다 — 운영 DB의 절반 이상이 어떤 마이그레이션 파일로도 추적되지 않는다.** 그래서 1단계에서 나온 불일치(`quotes.deleted_at`, `menus.is_featured`, `suppliers`, `message_templates`, `ingredients.*`)는 전부 "마이그레이션이 잘못 적용된" 게 아니라 **"애초에 마이그레이션이 없는" 테이블에서 발생했다.**

---

## 1. 마이그레이션 파일 분류

| 분류 | 개수 | 판정 기준 |
|---|---|---|
| 「운영 DB 적용 완료」 주석 | 30 | `적용 완료` 문자열 |
| `RECORD-ONLY`(운영에서 덤프해 git에 기록) | 14 | `20260807120000~13` 전부 |
| **적용 주장 소계** | **44** | |
| 주장 없음 | 73 | |
| **합계** | **117** | |

---

## 2. 「적용 완료」 주장 44개 검증 결과 — 불일치 0건

**[SQL 결과]** 44개 파일이 선언한 `CREATE TABLE` 컬럼 + `ADD COLUMN` 을 전부 운영 스키마와 대조 → **불일치 0건.**

대표 검증 샘플:

| 파일 | 선언 | 운영 DB 실측 | 판정 |
|---|---|---|---|
| `20260509010000_create_commerce_tables.sql` | `commerce_product_listings`, `cart_items`, `commerce_orders`, `commerce_order_items` | 4개 전부 존재, 선언 컬럼 전부 존재 | ✅ |
| `20260508010000_add_admin_logs_columns.sql` | `admin_logs` + `admin_id, tenant_id, reason, target_table, target_id, old_value, new_value` | 7개 전부 존재 | ✅ |
| `20260618140000_create_ingredient_master.sql` | `ingredient_master`, `ingredient_mappings` | 존재 | ✅ |
| `20260831091000_add_ingredient_master_missing_columns.sql` | `ingredient_master.manufacturer`, `.ingredients_text` | 둘 다 존재 | ✅ (과거 드리프트가 **정상 복구됨**) |
| `20260626120000_create_coupons.sql` | `coupons`, `coupon_uses` | 존재 | ✅ |
| `20260616100000_add_subscription_plan_to_tenants.sql` | `tenants.subscription_plan` | 존재 | ✅ |
| `20260617200000_add_product_detail_fields.sql` 외 5개 (listing 확장) | `origin, storage_method, min_order_qty, package_unit, usage_desc, allergen, ingredients, barcode, manufacturer, box_qty, ai_*` | 전부 존재 | ✅ |
| `20260807120000~13` RECORD-ONLY 함수 14개 | 함수 정의 | PostgREST 노출 11개 확인 / 트리거 함수 3개 검증 불가 | ⚠️ 부분 |

**주목할 사례 — 과거 드리프트가 실제로 복구된 기록**
`20260831091000_add_ingredient_master_missing_columns.sql`은 자기 주석에 이렇게 적어뒀다:
> `20260618140000_create_ingredient_master.sql` 은 manufacturer / ingredients_text 를 선언하고 "운영 DB 적용 완료" 주석이 붙어 있지만, 운영 테이블에는 두 컬럼이 없다. `CREATE TABLE IF NOT EXISTS` 로 만든 뒤 파일에만 컬럼을 덧붙이고 재적용하지 않아 생긴 스키마 드리프트로 보인다.

**2026-09-09 재검증: 두 컬럼 모두 존재한다. 복구 완료.**
→ **이 사례가 「적용 완료」 주석의 진짜 실패 모드다**: `CREATE TABLE IF NOT EXISTS` 파일을 나중에 편집하면 주석은 그대로인데 DB는 안 따라온다. 같은 패턴을 쓰는 파일이 아직 남아 있다(§5-2).

---

## 3. 불일치 항목

### DR-01 ❌ 미적용 — `restaurant-os/20260508150000_add_ingredients_barcode_if_missing.sql`

**[코드 근거]** 파일 헤더
```sql
-- SUP-MISSING-011: ingredients.barcode (식자재 SKU)
-- WARNING: Migration file only. Do not execute without approval.
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS barcode text;
```
**[SQL 결과]**
```
GET /rest/v1/ingredients?select=barcode → 42703 column ingredients.barcode does not exist
```
**판정**: 파일이 스스로 "승인 없이 실행 금지"라고 했고 실제로 미적용. **파일은 정직하다.** 문제는 `restaurant-os/src/actions/import.ts`가 이 컬럼을 22곳에서 쓴다는 것 → `schema-mismatch-report.md` M-09.

---

### DR-02 ⚠️ 주석과 실제가 반대 — `realmyos/20260506130001_create_admin_logs.sql`

**[코드 근거]**
```sql
-- DB-TODO-002: admin_logs (PRODUCT §10)
-- Note: migration file only. Do not execute without approval.
create table if not exists public.admin_logs (...);
alter table public.admin_logs enable row level security;
create policy "admin_logs_select_admin" ... using (is_admin());
create policy "admin_logs_insert_admin" ... with check (is_admin());
```
**[SQL 결과]**
```
admin_logs 존재.  454행.  마지막 created_at = 2026-09-08 (어제)
컬럼: action_type, admin_id, admin_tenant_id, created_at, id, new_value,
      old_value, payload, reason, target_id, target_table, target_tenant_id, tenant_id
      → CREATE TABLE 선언 컬럼(payload, target_tenant_id 포함) + 20260508010000 확장 컬럼 전부 존재

RLS 동작 확인:
  service_role 454행  /  supplier 세션 0행  /  restaurant 세션 0행  /  anon 0행
```
**판정**: 「실행 금지」라고 적혀 있는데 **실제로는 적용돼 있고 활발히 쓰인다.** 정책도 동작상 admin 전용이 맞다. → 주석이 낡았다. 파일 헤더를 믿고 재적용하려는 사람이 있으면 혼란.

---

### DR-03 ⚠️ 주석과 실제가 반대 — `realmyos/20260508191000_fix_admin_settings_select_policy.sql`

**[코드 근거]**
```sql
-- HIGH: admin_settings SELECT 전면 허용 수정
-- DB 실행 금지 (migration 제안 파일)
-- 운영 DB 적용 완료 (2026-05-08)          ← 같은 파일 안에서 서로 모순
DROP POLICY IF EXISTS "admin_settings_read" ON public.admin_settings;
CREATE POLICY "admin_settings_read" ON public.admin_settings
  FOR SELECT USING (auth.role() = 'authenticated');
```
**[SQL 결과]** — 동작으로 검증
```
admin_settings 19행
  service_role 19  /  supplier 19  /  restaurant 19  /  anon 0
```
`anon = 0`, `authenticated = 전량` → **이 파일이 실제로 적용됐다.** (적용 전이었다면 `USING (true)`라 anon도 19를 봤어야 한다.)
**판정**: 「DB 실행 금지」와 「적용 완료」가 한 파일에 같이 있다. 실제는 적용됨. 주석 정리 필요.

---

### DR-04 ⛔ 오탐 2건 (드리프트 아님)

| 스캐너 경고 | 실제 |
|---|---|
| `orders.final_amount` 를 DROP 했는데 아직 있음 | `20260719100000`이 **같은 파일 안에서** DROP → generated 컬럼으로 재생성. 현재 존재가 정상 |
| `tenants.opening_time` / `closing_time` 을 ADD 했는데 없음 | `20260518000000`이 추가 → `20260518010000_simplify_business_hours.sql`이 DROP + `business_hours_text` 추가. 현재 부재가 정상 (`tenants.business_hours_text` 존재 확인) |

---

## 4. ⛔ 검증 불가 영역 (가장 중요한 신뢰성 공백)

### 4-1. RLS 정책 본문 — 56개 `CREATE POLICY` 중 본문 대조 0건

**왜 불가한가**: `pg_policies`에 도달할 SQL 통로가 없다.
```
POST /rest/v1/rpc/exec_sql       → 404
POST /rest/v1/rpc/execute_sql    → 404
POST /rest/v1/rpc/run_sql        → 404
POST /rest/v1/rpc/sql            → 404
POST /rest/v1/rpc/exec           → 404
로컬 psql 미설치 · 어느 .env 에도 Postgres 접속 문자열 없음 · Management API PAT 없음
```

**대신 한 것 — role별 동작 매트릭스**
E2E 계정 세션(supplier=`d99a4eec…`, restaurant=`9336ce44…`)과 anon으로 동일 SELECT를 돌려 가시 행수를 비교했다.

| 테이블 | service | anon | supplier | restaurant | 선언된 정책 | 동작 판정 |
|---|---|---|---|---|---|---|
| `products` | 199 | 0 | 15 | 10 | `products_select_if_visible_commerce_listing` (20260801010000) | ✅ 적용됨 (노출 리스팅 상품 10건 + 자기 tenant 5건) |
| `product_costs` | 194 | 0 | **3 (자기 것만)** | 0 | **선언 없음** | ✅ tenant 격리 동작 (정책 출처 불명) |
| `product_prices` | 45 | 0 | 0 | 0 | 선언 없음 | ✅ 차단 |
| `product_stats` | 180 | 0 | 0 | 0 | 선언 없음 | ✅ 차단 |
| `product_logs` | 61 | 0 | 0 | 0 | 선언 없음 | ✅ 차단 |
| `order_lines` | 518 | 0 | 0 | 0 | 선언 없음 | ✅ 차단 |
| `orders` | 282 | 0 | 3 | 0 | `20260508020000_fix_rls_with_check` | ✅ tenant 격리 |
| `payments` | 258 | 0 | 6 | 0 | 동일 | ✅ tenant 격리 |
| `customers` | 142 | 0 | 4 | 0 | — | ✅ tenant 격리 |
| `admin_logs` | 454 | 0 | 0 | 0 | `admin_logs_select_admin` | ✅ admin 전용 |
| `admin_settings` | 19 | **0** | **19** | **19** | `admin_settings_read` (authenticated) | ✅ 의도대로 (DR-03) |
| `commerce_product_listings` | 38 | **10** | 10 | 10 | `commerce_listings_read` (`TO` 절 없음 = PUBLIC) | ⚠️ **의도된 공개 카탈로그이나 anon 포함** |
| `commerce_orders` | 9 | 0 | 0 | 8 | `commerce_orders_tenant` | ✅ |
| `commerce_order_items` | 8 | 0 | 0 | 7 | `commerce_order_items_tenant` | ✅ |
| `cart_items` | 4 | 0 | 0 | 3 | `cart_items_tenant` | ✅ |
| `commerce_order_allocations` | 2 | 0 | **2 (자기 것)** | 0 | `..._supplier_select` | ✅ 의도대로 |
| `customer_tag_options` | 67 | 0 | 35 (전부 자기) | 0 | `20260507170000` | ✅ |
| `ingredient_master` / `ingredient_mappings` | 3 / 3 | 0 | 0 | 0 | **선언 없음(RLS 문 자체가 없음)** | ✅ 실제로는 차단됨 — **파일과 DB가 다르다** |
| **`sales_scripts`** | **7** | **7** | **7** | **7** | **선언 없음** | ❌ **아래 DR-06** |
| `field_observations`·`sales_leads`·`pricing_policies` 등 | 0~3 | 0 | 0 | 0 | 각 파일 | ✅ (0행이라 일부는 판정 약함) |

### 4-2. 트리거 함수 3개 — 존재 검증 불가
`handle_new_user_onboarding`, `delete_user_on_auth_delete`, `sync_quote_total_amount` 는 `RETURNS trigger`라 PostgREST에 노출되지 않는다. RECORD-ONLY 파일(`20260807120003`, `06`, `11`)만 있고 실제 존재 여부는 확인 못 했다.
나머지 **11개 RECORD-ONLY 함수는 전부 존재 확인**했다.

### 4-3. 인덱스 · 제약조건 · DEFAULT · CHECK
OpenAPI가 노출하지 않는다. `20260507020000_rfq_bids_unique_supplier.sql`, `20260514200000_commerce_orders_idempotency.sql`, `20260831092000_add_ingredient_mappings_missing_indexes.sql` 등 인덱스/제약 전용 마이그레이션 **9개는 전부 미검증**이다.
→ `quotes.quote_number`의 UNIQUE 여부를 확인 못 한 것도 이 때문이다(`schema-mismatch-report.md` M-07).

---

## 5. ❌ 역방향 드리프트 — DB에 있는데 레포에 없는 것

### DR-05 · 운영 테이블 96개 중 **56개(58%)가 어떤 마이그레이션으로도 생성되지 않았다**

**[SQL 결과]**
```
운영 DB public 테이블            96
레포 전체 CREATE TABLE 대상       40 (실존 기준)
→ DDL 파일이 없는 테이블          56
```

**DDL이 없는 56개** (핵심 업무 테이블이 거의 다 여기에 있다):
```
_etl_order_items, _etl_orders, _etl_payments_outgoing, _etl_restaurants,
_etl_rfq_bids, _etl_rfq_requests, _etl_suppliers, account_purposes,
accounts, acquisition_channels, action_logs, ai_decision_logs,
categories, collection_schedules, contact_logs, customer_monthly_stats,
customer_product_prices, customer_stats, customers, fixed_costs,
fund_rules, fund_transfers, ingredient_unit_history, ingredients,
message_logs, notices, notifications, opening_balance_logs,
order_lines, order_logs, orders, payments,
price_history, product_categories, product_code_sequences, product_costs,
product_logs, product_prices, product_stats, products,
push_logs, quote_items, quote_logs, quotes,
restaurant_order_items, rfq_bids, rfq_requests, sales_schedules,
sales_scripts, savings_stats, settings, supplier_contacts,
tenant_relationships, tenants, today_events, users
```

**왜 중요한가**
- `orders`, `order_lines`, `payments`, `customers`, `products`, `product_costs`, `tenants`, `users` — **매출·정산·원가의 근간이 전부 이 목록에 있다.**
- 새 환경(스테이징/재구축/사업 양도 후 신규 프로젝트)을 마이그레이션만으로 세울 수 없다.
- 이 테이블들의 컬럼이 조용히 바뀌어도 git diff에 안 나온다. → **1단계에서 찾은 불일치 5건 중 4건(`quotes.deleted_at`, `menus.is_featured`, `suppliers`, `customers.created_by`)이 정확히 이 56개 안에서 나왔다.**

### DR-06 ❌ `sales_scripts` — RLS 정책 파일 없음 + **비로그인 전체 공개 + 크로스 tenant**

**[SQL 결과]** — apikey(anon)만으로, 로그인 없이
```
GET /rest/v1/sales_scripts?select=tenant_id,type,title      [anon, 비로그인]
→ 7행 전부 반환
  00000000-0000-0000-0000-000000000000  call     안부 전화
  00000000-0000-0000-0000-000000000000  call     미수금 확인
  00000000-0000-0000-0000-000000000000  call     재주문 유도
  00000000-0000-0000-0000-000000000000  message  주문 감사 문자
  00000000-0000-0000-0000-000000000000  message  입금 요청 문자
  5bf7aa92-7eaa-4f0e-a75f-89310c7b275d  message  1단계 : 쿠팡 안심번호용(된장)
  d99a4eec-6038-4f12-92dc-86538d38da31  message  재구매 알림
```
**[코드 근거]** `realmyos/src/actions/sales.ts:347` 은 애플리케이션 레벨에서 「자기 tenant + 플랫폼 공용」만 읽도록 짜여 있다:
```ts
.or(`tenant_id.eq.${ctx.tenant_id},tenant_id.eq.00000000-0000-0000-0000-000000000000`)
```
그런데 **DB 레벨에는 그 제약이 없다.** PostgREST에 직접 붙으면 다른 공급자가 쓴 영업 스크립트(`5bf7aa92`의 "쿠팡 안심번호용(된장)")까지 로그인 없이 읽힌다.
**판정**: `sales_scripts`에 대한 `CREATE POLICY`가 레포 어디에도 없고, 운영에도 tenant 격리 정책이 없다. **애플리케이션 코드만 믿고 있는 상태.**

### DR-07 ⚠️ `tenant-assets` 스토리지 버킷 — 마이그레이션 없음

**[SQL 결과]**
```
GET /storage/v1/bucket
→ commerce-images  public=True  2026-05-10T10:17:12Z
   tenant-assets   public=True  2026-07-15T04:29:20Z
```
**[코드 근거]** `commerce-images`는 `20260510190000_storage_commerce_images_policies.sql`로 추적된다. **`tenant-assets`는 대응 마이그레이션이 없다.** `realmyos/src/actions/settings.ts:217,233`(사업자 도장 이미지 업로드)이 쓴다. 코드가 스스로 부재를 대비한 에러 문구까지 갖고 있다(`settings.ts:226` "tenant-assets 버킷이 없습니다. Supabase에서 마이그레이션(SQL)을 적용해주세요.") — **있지도 않은 마이그레이션을 안내한다.**

### DR-08 ⚠️ `ingredient_master` / `ingredient_mappings` — 파일엔 RLS가 없는데 DB엔 걸려 있음

**[코드 근거]** `20260618140000_create_ingredient_master.sql` 에 `ENABLE ROW LEVEL SECURITY`도 `CREATE POLICY`도 **없다.**
**[SQL 결과]** 그런데 실제로는 차단된다 — `service_role 3행 / supplier 0 / restaurant 0 / anon 0`.
**판정**: 누군가 콘솔에서 직접 RLS를 켰다. 방향은 안전한 쪽이지만 **레포로 재현 불가능한 상태 변경**이다.

---

## 6. 종합 판정

| 질문 | 답 |
|---|---|
| 「운영 DB 적용 완료」 주석을 믿어도 되나? | **컬럼/테이블 수준은 예.** 44개 전부 검증했고 불일치 0건 |
| 그럼 마이그레이션 폴더를 SSOT로 볼 수 있나? | **아니오.** 운영 테이블의 58%, RLS 정책 상당수, 버킷 1개가 파일로 존재하지 않는다 |
| 가장 큰 리스크는? | **역방향 드리프트.** 핵심 업무 테이블이 git 밖에 있어 스키마 변경이 리뷰·이력에 안 잡힌다 |
| 즉시 확인 필요한 보안 항목은? | **DR-06 `sales_scripts` 비로그인 공개.** 다른 공급자의 영업 스크립트가 anon key만으로 읽힌다 |

### 권고 (읽기 전용 조사이므로 실행하지 않음)
1. `20260807120000~13`의 **RECORD-ONLY 방식을 테이블·정책까지 확대**해서, 운영 DB의 현재 상태를 그대로 덤프한 파일을 레포에 넣는다. 재적용이 아니라 **기록**이 목적이다. → 56개 테이블 + RLS 정책 전부.
2. DR-02 / DR-03의 모순된 주석을 정리한다(`실행 금지` vs `적용 완료`).
3. DR-06을 보안 항목으로 별도 처리한다.
4. 추적 방식 자체를 바꾸는 제안은 `improvement-suggestions.md` I-02.

---

# 【2차 보완】 2026-09-09 — ⛔ 로 남겼던 2건 해소 + 결론 1건 정정

> 2차 조사(`audit-log-round2.md`)에서 추가. 위 본문은 1차 기록 그대로 둔다.

## 7. 「원천적으로 불가」였던 2건이 가능해졌다

1차 §0의 결론표에서 ⛔로 남긴 두 줄을 채운다. 통로는 `supabase db query --linked` (근거: `overnight-audit-log.md` §5).

| 1차 결론 | 2차 결과 |
|---|---|
| **RLS 정책 본문 검증** — ⛔ 원천적으로 불가 | ✅ **가능. 전수 조회 완료** |
| **트리거 함수 3개 존재 검증** — ⛔ 불가 | ✅ **3개 전부 존재 확인** |

### 7-1. RLS 정책 — 56개 `CREATE POLICY` 선언 대조 결과

| 상태 | `public` 테이블 수 |
|---|---|
| RLS ON + 정책 있음 | **77** |
| RLS ON + 정책 0개 | **17** |
| **RLS OFF** | **2** (`message_logs`, `quote_logs`) |

1차가 "본문 대조 0건"이라고 남긴 부분이 이제 대조 가능하다. 다만 **마이그레이션 파일의 `CREATE POLICY` 56개와 운영 정책을 1:1로 이름 대조하는 작업은 이번에도 하지 않았다** — 2차의 우선순위는 「운영 현재 상태가 안전한가」였기 때문이다. 파일↔운영 정책 대조는 다음 조사로 남긴다.

### 7-2. 트리거 함수 — 3개 전부 실재 (+ 1개 추가 발견)

| 스키마 | 테이블 | 트리거 | 함수 | 1차 예상 |
|---|---|---|---|---|
| `auth` | `users` | `on_auth_user_created` | `handle_new_user_onboarding` | ✅ 맞음 |
| `auth` | `users` | `on_auth_user_deleted` | `delete_user_on_auth_delete` | ✅ 맞음 |
| `public` | `quote_items` | `trg_sync_quote_total` | `sync_quote_total_amount` | ✅ 맞음 |
| **`nurungchip`** | `orders` | `nurungchip_after_order` | `handle_new_order` | ❌ **존재 자체를 몰랐음** |

---

## 8. ⚠️ `DR-06` 정정 — `sales_scripts`는 이미 닫혀 있다

1차 결론: 「즉시 확인 필요한 보안 항목은 **DR-06 `sales_scripts` 비로그인 공개**」
**2차 실측: 아니다.**

```
sales_scripts_select  roles={authenticated} cmd=SELECT
    USING ((tenant_id = get_my_tenant_id()) OR (tenant_id = '00000000-0000-0000-0000-000000000000'))
sales_scripts_insert  roles={authenticated} cmd=INSERT  CHECK (tenant_id = get_my_tenant_id())
sales_scripts_update  roles={authenticated} cmd=UPDATE  USING/CHECK (tenant_id = get_my_tenant_id())
```
익명 키 실측 = **HTTP 200 · 0행** (service_role로는 7행). tenant 스코핑이 실제로 작동한다.

**대신 그 자리에 들어가야 할 진짜 보안 항목은 `message_logs` / `quote_logs`다** (`overnight-audit-log.md` §6-2):
RLS **OFF** + `anon`에 `SELECT/INSERT/UPDATE/DELETE/TRUNCATE` 전권 → 익명 키로 메시지 본문 3행 전부 읽힘.

### 8-1. 여기서 파생되는 새 드리프트 — `DR-07`

커밋 `e9651f5`(`20260909100000_sales_scripts_rls.sql`)는 메시지에 **"미실행"**이라고 적혀 있다. 그런데 **운영 DB에는 그 마이그레이션이 의도한 정책이 존재한다.**

| | 파일이 주장하는 것 | 운영 실제 |
|---|---|---|
| `20260909100000_sales_scripts_rls.sql` | 미실행 | **정책 3개 존재** |

1차의 `DR-02`/`DR-03`(「실행 금지」인데 적용돼 있음)과 **정확히 같은 유형이 하나 더 늘었다.** 누가 언제 적용했는지 기록이 없다 → 사람 확인 필요(`C-16`).

---

## 9. 역방향 드리프트는 1차가 말한 것보다 더 나쁘다

1차: 「운영 테이블 **56/96개(58%)** 가 레포에 DDL 없음」
2차: 분모가 96이 아니다. 애플리케이션 스키마가 **3개**다.

| 스키마 | 테이블 | 마이그레이션 파일 | 코드 참조 |
|---|---|---|---|
| `public` | 96 | 일부 있음 | 있음 |
| **`dev`** | **7** (354행) | **0건** | **0건** |
| **`nurungchip`** | **6** (5행) | **0건** | **0건** |
| **합계** | **109** | | |

`grep -rlE 'nurungchip|CREATE SCHEMA' supabase/migrations/` = **0건** (양쪽 레포 모두).
→ **역방향 드리프트는 56/96(58%)이 아니라 최소 69/109(63%)다.** 그리고 `dev`·`nurungchip`은 "컬럼이 안 맞는" 수준이 아니라 **스키마의 존재 자체가 git 밖**이다.

`dev.orders`(95행)·`dev.order_lines`(170행)·`dev.payments`(81행)는 운영 거래·결제 데이터의 사본으로 보인다. 무엇의 사본인지, 지워도 되는지는 사람만 안다(`C-12`).

---

## 10. 1차 §6 「권고」에 대한 2차 갱신

1차 권고 4항은 그대로 유효하다. 다음을 더한다.

| # | 권고 | 근거 |
|---|---|---|
| 5 | **RECORD-ONLY 덤프 범위에 `dev`·`nurungchip` 스키마를 포함**하라 | 지금은 존재조차 git에 없다 |
| 6 | **RLS 상태(ON/OFF·정책 수)를 스키마 덤프에 함께 기록**하라 | `message_logs` 같은 구멍이 5개월간 아무 신호 없이 유지됐다 |
| 7 | `DR-06` 대신 **`message_logs`/`quote_logs`를 1순위 보안 항목**으로 교체 | §8 |
| 8 | 「미실행/실행금지」 주석과 실제를 대조하는 절차를 만들라 | 같은 유형이 `DR-02`·`DR-03`·`DR-07` 3건으로 늘었다 |
