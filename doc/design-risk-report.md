# design-risk-report.md — 설계 수준 위험 시나리오 점검 (3단계)

- 조사일: 2026-09-09
- 관점: **"데이터를 나중에 다른 소유자 / 다른 구조로 옮겨야 하는데 코드가 그걸 지원하지 않는" 지점**
- 시나리오: ① 사업 양도(플랫폼 주체 교체) ② 사업자 정보 변경(법인 전환·상호·대표자·계좌 변경) ③ 구조 변경(식당OS 분사, tenant 병합/분할, 상품·리스팅 소유자 이관)
- **이 문서는 문제 지점만 기록한다.** 대안 설계는 `improvement-suggestions.md`로 넘겼다 (판단 근거: `overnight-audit-log.md` J-13)

---

## 0. 위험 요약

| # | 위험 | 시나리오 | 심각도 | 되돌릴 수 있나 |
|---|---|---|---|---|
| **R-01** | 플랫폼 tenant ID가 **DB 함수 본문·RLS·소스 16개**에 상수로 박혀 있음 | ① 사업 양도 | 🔴 | 어려움 (DB 함수 수정 필요) |
| **R-02** | `product_costs`에 소유 축이 없음 (`products.tenant_id` 종속) | ③ 상품 이관 | 🔴 | 불가 (이력 분할 불가) |
| **R-03** | 리스팅은 이관되는데 **원가는 안 따라감** | ③ 공급자 이관 | 🔴 | 코드가 스스로 인정 |
| **R-04** | `payments`의 tenant 축 전환이 **81% 미완** | ①③ tenant 재편 | 🔴 | 백필 가능하나 규칙 불명 |
| **R-05** | 거래명세서가 **스냅샷이 아님** (사업자정보를 실시간 조회) | ② 사업자 변경 | 🔴 | 불가 (과거 문서 소급 오염) |
| **R-06** | 이미지가 **절대 URL**로 DB에 저장됨 (프로젝트 ref 포함) | ①③ 프로젝트 이전 | 🟠 | 일괄 치환 필요 |
| **R-07** | 단일 Supabase 프로젝트 + service role 크로스 tenant 접근 | ③ 식당OS 분사 | 🟠 | 어려움 |
| **R-08** | `users.tenant_id` 가 1:1 — 한 사람이 두 tenant에 못 속함 | ① 인수인계 병행 | 🟠 | 스키마 변경 필요 |
| **R-09** | 소프트삭제 정책이 테이블마다 다름 | ①③ 아카이빙 | 🟡 | — |
| **R-10** | `admin_logs.new_value`에 원가 스냅샷이 통째로 적재됨 | ① 양도 시 로그 인계 | 🟡 | — |
| **R-11** | RLS 정책이 git 밖에 있음 | ①③ 신규 환경 구축 | 🟠 | 재현 불가 |
| **R-12** | 스냅샷/실시간계산 원칙이 테이블마다 불일치 | ② 수수료·세율 변경 | 🟡 | — |
| **R-13** | `commerce_orders`에 주문자(사람) 기록이 없음 | ② 개인정보 대응 | 🟡 | — |

---

## R-01 🔴 플랫폼 tenant ID가 코드·DB 양쪽에 상수로 박혀 있다

**[코드 근거]** `00000000-0000-0000-0000-000000000000` 하드코딩 위치 — **소스 16개 파일 + SQL 4개**

```
realmyos/src/actions/admin/bulk-listing.ts:17            const PLATFORM_OWNER_TENANT = '000...'
realmyos/src/actions/admin/commerce-allocation.ts:7      (동일 상수 재선언)
realmyos/src/actions/admin/commerce-listing-transfer.ts:26
realmyos/src/actions/admin/commerce-reversal.ts:8
realmyos/src/actions/admin/commerce.ts:28
realmyos/src/actions/admin/platform-revenue.ts:6
realmyos/src/actions/admin/storefront-bank-transfer.ts:15
realmyos/src/actions/admin/supplier-payables.ts:10
realmyos/src/actions/sales.ts:347                        .or(`...,tenant_id.eq.00000000-...`)  ← 리터럴 직접 삽입
realmyos/src/app/(admin)/admin/push/page.tsx:24,47
realmyos/src/app/(admin)/admin/tenants/TenantsClient.tsx:27
realmyos/src/components/commerce/ListingSupplierTransferPanel.tsx:16
realmyos/src/lib/subscription-renewal.ts:37              export const PLATFORM_OWNER_TENANT   ← 공용 상수가 이미 있는데
realmyos/src/lib/supabase-server.ts:50                   const ADMIN_TENANT_ID = '000...'      ← 이름만 다른 또 하나
restaurant-os/src/actions/buy.ts:308                     .eq('tenant_id', '00000000-...')      ← 리터럴 직접 삽입
restaurant-os/src/lib/commerce-order-erp.ts
```
`lib/subscription-renewal.ts:37`이 이미 `export const PLATFORM_OWNER_TENANT`를 내보내는데 **나머지 13개 파일이 각자 다시 선언한다.**

**더 심각한 쪽 — DB 안에도 박혀 있다**
```sql
-- 20260807120007_record_is_admin.sql  (운영에서 덤프한 실제 함수 본문)
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean AS $function$
  select exists (select 1 from users
    where id = auth.uid()
      and (tenant_id is null or tenant_id = '00000000-0000-0000-0000-000000000000')
      and role = 'admin')
$function$;

-- 20260515400000_create_pricing_policies.sql:210      v_platform uuid := '00000000-...'::uuid;
-- 20260515600000_log_payment_reversal_audit.sql:16    v_platform uuid := '00000000-...'::uuid;
-- 20260515700000_..._payout_blocked.sql:15            v_platform uuid := '00000000-...'::uuid;
```

**왜 위험한가**
- `is_admin()`은 **거의 모든 RLS 정책의 판정 기준**이다(`commerce_*`, `admin_logs`, `admin_settings`, `shipping_groups`, `pricing_policies`, `supplier_payables` …). 플랫폼 주체가 바뀌어 tenant ID를 새로 발급하면 **환경변수 교체로는 절대 안 되고 DB 함수를 고쳐야 한다.**
- 마이그레이션 파일이 없는 RLS 정책까지 감안하면(§R-11), 어디까지 고쳐야 하는지 **목록조차 만들 수 없다.**

**[SQL 결과] 현재 상태**
```
tenants 8개 중 role='admin' 1개 = 00000000-0000-0000-0000-000000000000
users  6명 중 role='admin' 1명, tenant_id = 00000000-...
```
→ 센티널 tenant는 실제로 존재하는 단일 행이다. 옮기려면 이 행의 PK를 바꿔야 하는데 **FK가 걸린 테이블 전체가 연쇄**된다.

---

## R-02 🔴 `product_costs`에 소유 축이 없다 — 원가 이력을 분할할 수 없다

**[SQL 결과]**
```
product_costs 실제 컬럼:
  id, product_id, cost_price, start_date, end_date, created_at
                                       ↑ tenant_id 없음
행 수 194
```
**[코드 근거]** 그런데 코드는 있다고 믿는다 — `realmyos/src/actions/product.ts:998` `.eq('tenant_id', ctx.tenant_id)` → 항상 `42703` (`schema-mismatch-report.md` M-10)

**구조적 문제**
- `product_costs`의 소유는 오직 `product_id → products.tenant_id` 경로로만 판정된다.
- **상품을 다른 tenant로 옮기면 그 상품의 원가 이력 전체가 자동으로 따라간다.** 이관 시점 이전/이후를 나눌 방법이 없다.
- 반대도 안 된다 — 상품은 넘기고 과거 매입가는 안 넘기는 게 불가능하다.
- 사업 양도 시 **인수자가 양도인의 전체 매입가 이력을 자동으로 획득**한다. 협상 대상이 될 수 있는 정보인데 분리 수단이 없다.

**부수 효과**: 원가 이력 조회 기능(`getProductCostHistory` + 「가격 변경 로그」 탭)이 이 불일치 때문에 죽어 있다.

---

## R-03 🔴 리스팅은 이관되는데 원가는 안 따라간다 — 코드가 스스로 인정하고 있다

**[코드 근거]** `realmyos/src/actions/admin/commerce-listing-transfer.ts:1-20` (파일 상단 주석)
```
// 이 파일은 리스팅 행을 그대로 두고 소유 컬럼만 제자리에서 갱신한다.
//   owner_type       → 'approved_supplier'
//   owner_tenant_id  → 새 공급자 tenant
//   supplier_tenant_id → 새 공급자 tenant
// id / product_id / tenant_id 는 건드리지 않는다.
```

`realmyos/src/components/commerce/ListingSupplierTransferPanel.tsx:240`
> "…바뀌지만, 원가(product_costs)는 여전히 플랫폼 상품에 묶여 있어 구독 할인 계산의 원가…"

**결과**
- 이관 후에도 `commerce_product_listings.product_id`는 플랫폼 상품을 가리킨다.
- `restaurant-os/src/actions/buy.ts:1512` `calcCartDiscount`는 그 `product_id`로 `product_costs`를 읽는다.
- 즉 **공급자 귀속 리스팅의 할인 한도가 "플랫폼이 제조사에서 산 가격" 기준으로 계산된다.** 공급자가 실제로 받는 금액(`supplier_payables.payable_amount`)과 무관하다.

**[SQL 결과] 현재 노출 규모**
```
commerce_product_listings          38행
  owner_type = 'platform'  (deleted_at null)   23
  owner_type = 'approved_supplier'              2      ← 이미 2건이 이관된 상태
commerce_order_allocations 2행 (전부 supplier d99a4eec, platform_fee_rate 0.03)
supplier_payables 0행                                  ← 지급 원장은 아직 비어 있음
```
→ 이관 기능은 **이미 운영에서 2건 사용됐다.** 가설이 아니라 현재 상태다.

**추가**: 이관 시점의 소유자를 스냅샷하지 않는다. `commerce_order_allocations`는 주문이 `paid`가 되는 시점의 리스팅 소유자를 읽는다(같은 파일 주석 `:29-32`). 이관 직전에 `pending_payment` 상태인 주문이 있으면 정산 귀속이 바뀐다 — 코드는 이를 알고 `blockers`로 이관을 거부하지만, **이미 `paid`로 넘어간 과거 건은 소급 불가**라고 명시한다(`settled_order_item_count`).

---

## R-04 🔴 `payments`의 tenant 축 전환이 81% 미완 — 레거시 컬럼을 못 지운다

**[SQL 결과]**
```
orders    282행 :  tenant_id NULL 0  /  seller_tenant_id NULL 0  /  buyer_tenant_id NULL 282 (100%)
payments  258행 :  tenant_id NULL 0  /  payee_tenant_id  NULL 209 (81%)  /  payer_tenant_id NULL 210 (81%)
```

**[코드 근거]** 코드는 두 축을 `.or()`로 동시에 훑는다 — 10곳 이상
```ts
// realmyos/src/actions/order.ts:117
.or(`seller_tenant_id.eq.${tenant_id},tenant_id.eq.${tenant_id}`)
// realmyos/src/actions/analytics.ts:159
const payeeScope = `payee_tenant_id.eq.${tid},tenant_id.eq.${tid}`
// realmyos/src/actions/product.ts:1187, ledger.ts, dashboard.ts … 동일 패턴
```
`docs/CONTEXT.md`가 이 상태를 「⚠️ 전환 중」으로 표시해뒀다.

**왜 위험한가**
- 지금 동작하는 유일한 이유는 **레거시 `tenant_id`가 100% 채워져 있기 때문**이다. 새 축은 19%만 채워졌다.
- 누군가 "전환 끝났겠지" 하고 레거시 컬럼을 드롭하면 **payments 258건 중 209건이 미귀속**이 된다. 미수금·정산·원장이 통째로 틀어진다.
- tenant 병합/분할 시 어느 축을 기준으로 옮길지 판정 불가.
- `orders.buyer_tenant_id`는 **282/282 전부 NULL** — 선언만 되고 한 번도 채워진 적 없다. RFQ→주문의 구매자 연결이 데이터로 존재하지 않는다.

**→ `overnight-audit-log.md` C-05 (백필 규칙은 사람이 정해야 함)**

---

## R-05 🔴 거래명세서가 스냅샷이 아니다 — 사업자 변경 시 과거 문서가 소급 오염된다

**[코드 근거]** `realmyos/src/actions/order-export.ts:88-146`
```ts
supabase.from('tenants').select('*').eq('id', ctx.tenant_id).maybeSingle(),   // ← 지금의 tenants 행
...
const stamp_image_url  = t.stamp_image_url?.trim() || pickSetting(settingsMap, ['stamp_image_url', ...])
const bank_account     = t.bank_account?.trim()    || pickSetting(settingsMap, ['statement_bank_account', ...])
const business_number  = t.business_number?.trim() || pickSetting(settingsMap, ['business_number', ...])
const representative_name = t.representative_name?.trim() || pickSetting(settingsMap, [...])
```
구매자 정보도 마찬가지 — `:84` `customers(name, biz_number, representative_name, address, phone)` 를 **현재 값으로** 읽는다.
같은 패턴이 `ledger-export.ts`, `quote-export.ts`에도 있다(§`dead-code-report.md` 중복 항목 `pickSetting`·`joinAddress`·`resolveSupplierName`).

**대비 — 라인 단위는 스냅샷이 제대로 돼 있다**
```
order_lines: product_code, product_name, unit_price, cost_price, tax_type …  ← 주문시점 고정 ✅
commerce_order_items: listing_title, unit_price, base_price, applied_policy_snapshot ← 고정 ✅
```
**즉 "무엇을 얼마에 팔았나"는 얼어 있는데, "누가 팔았나"는 얼어 있지 않다.**

**시나리오**
1. 2026년 3월 A상사 명의로 발행한 거래명세서
2. 2026년 10월 법인 전환 → `tenants.business_number` / `representative_name` / `bank_account` / `stamp_image_url` 갱신
3. 3월 명세서를 다시 뽑으면 **2026년 10월의 사업자번호·대표자·계좌·도장이 찍힌다**
→ 세무 증빙으로 쓸 수 없다. 원본과 재발행본이 다르다.

---

## R-06 🟠 이미지가 절대 URL로 저장된다 — Supabase 프로젝트를 옮기면 전부 깨진다

**[SQL 결과]**
```
commerce_product_listings.thumbnail_url  NOT NULL : 10행
commerce_product_listings.image_urls     NOT NULL :  2행
tenants.stamp_image_url                  NOT NULL :  0행

실제 저장값:
"https://cqiwcyuclpuarynrreat.supabase.co/storage/v1/object/public/commerce-images/admin/1781612059731_....jpg"
                ↑ 프로젝트 ref 가 데이터 값 안에 들어 있다
```
**[코드 근거]** `realmyos/src/actions/settings.ts:233`
```ts
const { data: pub } = admin.storage.from('tenant-assets').getPublicUrl(data.path)
const url = pub.publicUrl                      // 절대 URL
await updateStatementProfile({ stamp_image_url: url })   // 그대로 DB 저장
```
같은 패턴이 `admin/commerce.ts:1655,1672`(리스팅 이미지), `sales_lead_notes.photo_urls`, `field_observations.photo_urls`에도 있다.

**위험**: 사업 양도로 새 Supabase 프로젝트를 파거나 조직을 이관하면 프로젝트 ref가 바뀐다 → **DB에 박힌 URL 전부 404.** 경로만 저장했다면 앱 설정 한 줄로 끝날 일이다.
**현재 규모는 작다**(12행). 지금이 고치기 가장 싼 시점이다.

---

## R-07 🟠 단일 Supabase 프로젝트 + service role 크로스 tenant 접근 — DB를 쪼갤 수 없다

**[코드 근거]** `docs/CONTEXT.md [ARCH-01] 1`: 「단일 Supabase DB — 두 앱이 동일한 DB 프로젝트 사용」

**restaurant-os가 service role(RLS 우회)로 접근하는 지점 전수**
| 위치 | 대상 | tenant 경계 넘음 |
|---|---|---|
| `src/actions/buy.ts:108` `enrichProductNamesFromProductsTable` | `products(id,name)` | ✅ 넘음 (플랫폼 상품) |
| `src/actions/buy.ts:275` `getListings` 검색 | `products(id)` | ✅ 넘음 |
| **`src/actions/buy.ts:1494→1514` `calcCartDiscount`** | **`product_costs(product_id,cost_price)`** | ✅ **넘음 — 플랫폼 원가** |
| `src/actions/signup.ts:137` | auth·tenants | 가입 처리 |
| `src/actions/subscribe.ts:53` `redeemCoupon` | `coupons`, `coupon_uses`, `tenants` | ✅ 넘음 (자기 tenant 갱신) |
| `src/app/api/push/*`, `src/app/api/toss/*` | 구독·푸시 | — |

**왜 구조 변경을 막는가**
- 식당OS를 별도 DB/회사로 분리하려면 위 6개 지점이 전부 **네트워크 API 호출로 바뀌어야 한다.** 지금은 같은 DB라 그냥 읽는다.
- 특히 `calcCartDiscount`는 **다른 tenant(플랫폼)의 원가를 읽어 자기 tenant 사용자에게 보여줄 숫자를 만든다.** 분리 시 이 계산을 어느 쪽이 할지부터 정해야 한다.
- `docs/CONTEXT.md`의 「OS 간 직접 API 호출 금지. 상태 변경 기반 이벤트로만 연결」 원칙과 실제 코드가 어긋나 있다 — DB를 공유해서 API 호출을 안 하는 것뿐이다.

> 이 경로의 정보 유출 측면은 어제 별도 보고서에서 다뤘다. 여기서는 **구조 이동 가능성**만 기록한다.

---

## R-08 🟠 `users.tenant_id`가 1:1 — 한 사람이 두 tenant에 속할 수 없다

**[SQL 결과]**
```
users 컬럼: auth_uid, created_at, email, id, role, tenant_id, user_type
users 6명 — tenant_id 단일 값, 다대다 연결 테이블 없음
users.auth_uid : 6/6 NULL  ← 선언만 되고 안 쓰임
```
**[코드 근거]** `realmyos/src/lib/supabase-server.ts:71` / `restaurant-os/src/lib/supabase-server.ts:53`
```ts
const { data: userRow } = await supabase.from('users').select('tenant_id, role').eq('id', user.id).maybeSingle()
```
RLS의 `get_my_tenant_id()`도 동일하게 단일 값을 반환한다.

**막히는 것**
- 사업 양도 중 **양도인·인수인이 일정 기간 함께 보는** 인계 기간을 만들 수 없다.
- 한 사람이 여러 사업장(법인)을 운영하는 경우 계정을 따로 만들어야 하고, 그러면 `orders`/`payments`의 `created_by`가 갈라진다.
- 대행사·회계사에게 읽기 권한만 주는 것도 불가능하다.

---

## R-09 🟡 소프트삭제 정책이 테이블마다 다르다

**[SQL 결과]** `deleted_at` 보유 여부
```
있음 : customers, products, orders, tenants, commerce_product_listings
없음 : quotes(코드는 있다고 가정 → M-01), contact_logs(코드는 is_active 가정 → M-05),
       order_lines, payments, product_costs, quote_items(is_active 로 대체), commerce_orders
```
**결과**: "이 tenant의 살아있는 데이터가 무엇인가"를 판정하는 기준이 테이블마다 다르다. 양도·아카이빙·정산 마감 시 **어느 행을 넘길지 일관된 필터를 쓸 수 없다.**
`products` 19행이 이미 `deleted_at` 상태인데, 그 상품의 `product_costs`·`order_lines`는 그대로 살아 있다.

---

## R-10 🟡 감사 로그에 원가 스냅샷이 통째로 들어간다

**[코드 근거]** `realmyos/src/actions/admin/commerce.ts:2177` (`listing_created_full`), `:1289`·`:1350` (`listing_updated_full`)
```ts
new_value: { listing_id, product_id, product_name, brand_name, spec,
             commerce_price: price, cost_price,        // ← 매입가가 로그에 그대로
             status, description, image_urls, badge_labels, shipping_group_id }
```
**[SQL 결과]** `admin_logs` 454행, 마지막 2026-09-08. RLS는 admin 전용으로 동작 확인(§`migration-drift-report.md` 4-1).

**딜레마**: 사업 양도 시
- 로그를 넘기면 → 과거 매입가 이력이 통째로 인계된다(R-02와 동일 문제)
- 로그를 안 넘기면 → 감사 추적이 끊긴다 (`docs/CONTEXT.md`의 「모든 행동 → admin_logs 기록 필수」 위반)
- 로그의 일부만 지우면 → append-only 원칙 위반

현재 스키마에는 이 셋 중 어느 것도 안전하게 하는 수단이 없다.

---

## R-11 🟠 RLS 정책이 git 밖에 있다 — 신규 환경에서 보안 경계를 재현할 수 없다

`migration-drift-report.md` DR-05 / DR-06 / DR-08과 동일 사실이나, **이관 관점에서는 별개의 위험**이다.

- 운영 테이블 **96개 중 56개(58%)에 CREATE TABLE 파일이 없다** — `orders`, `payments`, `products`, `product_costs`, `customers`, `tenants`, `users` 포함
- `product_costs`의 tenant 격리 정책은 **동작은 하는데 어느 파일에도 없다**
- `ingredient_master`/`ingredient_mappings`는 **파일엔 RLS가 없는데 DB엔 걸려 있다**
- `sales_scripts`는 **파일에도 DB에도 tenant 격리가 없어 비로그인 anon에게 전체 공개된다** (다른 공급자가 쓴 스크립트 포함)

**결론**: 새 Supabase 프로젝트를 만들어 마이그레이션을 전부 돌려도 **지금과 같은 보안 경계가 나오지 않는다.** 사업 양도든 스테이징 구축이든 "현재 상태 복제"가 불가능하다.

---

## R-12 🟡 스냅샷/실시간계산 원칙이 테이블마다 불일치

`docs/CONTEXT.md [ARCH-01] 5`: 「계산값 DB 저장 금지 — 잔액·결제상태 등 실시간 계산」

**그런데 실제로는 섞여 있다**
| 얼려 있음(스냅샷) | 실시간 재계산 |
|---|---|
| `order_lines.cost_price`, `unit_price`, `supply_price`, `vat_amount` | 미수금·잔액 (`lib/ledger-calc.ts`) |
| `commerce_order_items.applied_policy_snapshot`, `applied_policy_id`, `base_price` | 거래명세서 사업자 정보 (R-05) |
| `commerce_order_allocations.platform_fee_rate` (0.0300 저장됨) | `orders.final_amount` — **generated 컬럼** (`20260719100000`) |

**위험**
- `orders.final_amount`가 `GENERATED ALWAYS AS (total_amount - discount_amount - point_used)` 라서, **과거 주문의 할인 규칙이 바뀌면 과거 값이 자동으로 변한다.** 재무 마감 후에도 변한다.
- 반대로 `platform_fee_rate`는 얼려 있어 수수료율 변경이 과거에 영향 없다.
- **같은 시스템 안에서 두 원칙이 공존하니, 사업자·세율·수수료 변경 시 "무엇이 소급되고 무엇이 안 되는지"를 예측할 수 없다.**

---

## R-13 🟡 `commerce_orders`에 주문자(사람) 기록이 없다

**[SQL 결과]**
```
commerce_orders 컬럼:
  checkout_submission_id, created_at, delivery_memo, discount_amount, id, idempotency_key,
  order_number, payment_method, payment_status, refund_pending_at, refund_required,
  rfq_request_id, shipping_address, shipping_name, shipping_phone, source, status,
  tenant_id, total_amount, updated_at
                                    ↑ user_id / created_by 없음
```
대비: `orders.created_by` 있음, `payments.created_by` 있음, `quotes.created_by` 있음.

**막히는 것**: 개인정보 삭제·이관 요청이 오면 "이 사람이 넣은 주문"을 특정할 수 없다. `shipping_name`/`shipping_phone`은 수령인이지 주문자가 아니다. tenant 단위로만 지울 수 있는데 그러면 매출 원장이 사라진다.

---

## 부록 · 소유 축이 없는 테이블

**[SQL 결과]** `tenant_id` / `product_id` 등 소유 판정 컬럼이 아예 없는 테이블
```
product_stats        → product_id 로만 간접 판정 (products.tenant_id)
product_costs        → product_id 로만 간접 판정 (R-02)
field_observations   → 소유 컬럼 없음 (created_by 만). 플랫폼 전용 전제
ingredient_master    → 소유 컬럼 없음. 전역 마스터 전제 (의도된 설계)
coupons              → 소유 컬럼 없음 (created_by, lead_id 만)
pricing_policies     → 소유 컬럼 없음 (created_by 만). 타깃은 pricing_policy_targets 로 분리
```
이 중 `product_costs`(R-02)와 `product_stats`가 이관 시 문제가 된다. 나머지는 플랫폼 전용이라 의도된 설계로 보이나, **양도 시 "플랫폼 전용 = 인수자에게 전부 넘어감"이라는 뜻**이 된다는 점은 기록해둔다.
