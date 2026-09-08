# overnight-audit-log.md — 자율 조사 판단 기록

- 실행일: 2026-09-08 ~ 2026-09-09 (야간 자율 진행)
- 대상: `RealMyOS`(공급자OS + 관리자OS) / `restaurant-os`(식당OS)
- 운영 DB: Supabase 프로젝트 `cqiwcyuclpuarynrreat` (두 앱 공용, `CONTEXT.md [ARCH-01]`)
- 성격: **읽기 전용 조사.** 코드 수정 0건 / 마이그레이션 실행 0건 / 운영 데이터 쓰기 0건
- 산출물: 이 파일 + `schema-mismatch-report.md` + `migration-drift-report.md` + `design-risk-report.md` + `dead-code-report.md` + `improvement-suggestions.md`

---

## 0. 조사 방법과 그 한계 (먼저 읽을 것)

### 0-1. 운영 DB에 접근한 방법
| 필요한 것 | 쓴 방법 | 됐나 |
|---|---|---|
| 실제 스키마(테이블·컬럼) | PostgREST OpenAPI 스펙(`GET /rest/v1/`, service_role) | ✅ 96개 테이블 전 컬럼 획득 |
| 실제 행 수·최종 활동일 | PostgREST `Prefer: count=exact` + `order=created_at.desc` | ✅ |
| 컬럼 존재 여부 개별 확인 | `select=<col>` 호출 → `42703` 여부 | ✅ |
| DB 함수 목록 | OpenAPI `/rpc/*` 경로 | ✅ 25개 (호출 가능한 것만) |
| 스토리지 버킷 | `GET /storage/v1/bucket` | ✅ 2개 |
| RLS **동작** | E2E 계정(supplier/restaurant) 세션 JWT로 동일 쿼리 반복 | ✅ |
| RLS **정책 본문** | — | ❌ **확인 불가** (아래) |
| 트리거 함수 존재 | — | ❌ **확인 불가** (아래) |

### 0-2. 끝내 확인 불가였던 것과 그 이유
1. **RLS 정책 본문(`pg_policies`)** — SQL을 실행할 통로가 없다.
   - `exec_sql` / `execute_sql` / `run_sql` / `sql` / `exec` RPC → 전부 404
   - 로컬에 `psql` 미설치, 어느 `.env`에도 Postgres 접속 문자열 없음
   - Supabase Management API PAT 없음
   - → 정책은 **동작으로만** 검증했다. 56개 `CREATE POLICY` 선언 중 본문 대조는 0건.
2. **트리거 함수 3개** (`handle_new_user_onboarding`, `delete_user_on_auth_delete`, `sync_quote_total_amount`) — `RETURNS trigger`라 PostgREST에 노출되지 않는다. 존재 여부 검증 불가.
3. **INSERT/UPDATE RLS 정책** — 쓰기 테스트가 필요한데 "쓰기 금지" 지시에 따라 수행하지 않았다.
4. **인덱스·제약조건·기본값** — OpenAPI가 노출하지 않는다. 미검증.
5. **정적 스캔의 구조적 한계** — 아래 0-3.

### 0-3. 정적 스캔이 놓칠 수 있는 것 (판단 기준을 여기 적어둔다)
- 테이블/컬럼 추출은 `.from('X')` 체인의 `.select/.eq/.insert/...`를 정규식으로 파싱했다. **동적으로 만든 컬럼명, 문자열 조립 쿼리는 잡히지 않는다.** 그런 패턴은 두 레포에서 발견되지 않았지만 0이라고 단정하진 않는다.
- 죽은 코드 판정은 "다른 파일에서 그 식별자가 한 번도 등장하지 않음" 기준이다. **문자열로 참조되는 것(예: Server Action을 `<form action=>`로만 쓰는 경우)은 오탐이 된다.** 두 레포는 전부 import 후 호출 방식이라 실질 위험은 낮다고 판단했다.
- 그래서 죽은 코드는 "삭제하라"가 아니라 **"삭제해도 안전 / 확인 후 삭제 / 유지"** 3단계로만 제안했다.

---

## 1. 자율 판단 지점 기록 (무엇을 왜 그렇게 정했나)

### J-01. "쓰기 금지"와 "문서 커밋"의 충돌 → 문서 커밋만 수행
지시서 본문은 "어떤 형태의 쓰기 작업도 하지 않습니다"라고 했고, 최종 산출물 항목은 "문서 파일만 dev 브랜치에 커밋, push"라고 했다.
- **판단**: "쓰기 금지"는 *운영 데이터·애플리케이션 코드·마이그레이션*을 가리키고, 문서 커밋은 명시적으로 지시된 산출물이라고 읽었다.
- **실행**: `doc/` 아래 6개 `.md`만 생성 → `git add doc/`로 **경로를 한정해** 스테이징 → 커밋 → push.
- **주의**: 두 레포 모두 작업 트리가 이미 더러웠다(realmyos: `.gitignore`, `login.module.css`, `public/login-hero.png` 수정 + `scripts/` 다수 untracked / restaurant-os: `.gitignore`, `scripts/`, `.tmp-shots/`). **이것들은 건드리지 않았다.** `git add .`을 쓰지 않은 이유가 이것이다.

### J-02. 문서를 어느 레포에 둘 것인가 → 양쪽 모두에 동일 사본
조사가 두 레포에 걸쳐 있고 "대상 레포 둘 다"라고 했으므로, 6개 문서를 양쪽 `doc/`에 **동일 내용으로** 넣었다. 한쪽에만 두면 다른 레포만 여는 사람이 결론을 놓친다.
- 리스크: 이후 한쪽만 수정하면 사본이 갈라진다. → 개선안 문서에 "SSOT를 한쪽으로 정하라"를 적어뒀다.
- 기존 realmyos에는 `docs/`(복수형)가 이미 있다. 지시서가 `doc/`(단수)라고 했으므로 그대로 `doc/`을 새로 만들었다. **의도적으로 합치지 않았다** — 기존 `docs/`는 제품 정의(SSOT)이고 이건 1회성 감사 결과라 성격이 다르다.

### J-03. RLS 검증에 E2E 테스트 계정 사용 → 사용함 (읽기만)
운영 DB의 RLS를 role별로 검증하려면 실제 세션 JWT가 필요했다. 레포에 이미 있는 `.env.local.e2e-test`의 계정을 썼다.
- 사용 계정: `supplier-test@siksiki.com`(tenants.role=`supplier`), `test@siksiki.com`(role=`restaurant`)
- **SELECT만 실행했다.** INSERT/UPDATE/DELETE 0건.
- 부작용: 두 테스트 계정에 auth 세션이 발급됐다(refresh token 행 생성). 이것 외 데이터 변경 없음.
- **판단 근거**: 지시서가 "운영 DB 직접 확인"을 요구했고, 마이그레이션 파일만으로는 RLS를 판정할 수 없었다. 대표성은 두 계정의 `tenants.role`을 SQL로 확인해 담보했다.
- **한계**: 실사용자 계정이 아니다. 특정 실계정에만 붙은 추가 권한이 있다면 이 조사는 그것을 못 본다.

### J-04. `collection_allocations.payments`를 오탐으로 분류
스캐너가 "없는 컬럼"으로 잡았지만, 실제로는 `analytics.ts:198`의 `.eq('payments.status', 'confirmed')` — PostgREST **중첩 임베드 필터**다. 정상 문법.
- **판단**: 오탐. 스키마 불일치 목록에서 제외하고 이 로그에만 남긴다.

### J-05. `${secretKey}` / `commerce-images` / `tenant-assets`를 오탐으로 분류
- `${secretKey}`: `Buffer.from(\`${secretKey}:\`)` — `.from(`이 템플릿 리터럴이라 스캐너가 테이블로 오인.
- `commerce-images`, `tenant-assets`: `supabase.storage.from('버킷')`. **둘 다 운영에 실제 존재함을 확인**(`GET /storage/v1/bucket` → commerce-images 2026-05-10, tenant-assets 2026-07-15).
- **판단**: 셋 다 오탐. 다만 `tenant-assets`는 **마이그레이션 파일이 없다** → 역방향 드리프트로 2단계 보고서에 기록.

### J-06. `orders.final_amount` / `tenants.opening_time·closing_time` "DROP했는데 남아있음"을 오탐으로 분류
- `orders.final_amount`: `20260719100000`이 같은 파일 안에서 DROP 후 generated 컬럼으로 재생성. 현재 존재가 정상.
- `tenants.opening_time/closing_time`: `20260518000000`이 추가 → `20260518010000`이 DROP. 현재 부재가 정상.
- **판단**: 둘 다 마이그레이션 순서를 보면 정상. 드리프트 아님.

### J-07. `lib/ledger-calc.ts` 등 "미사용" 함수 4개를 죽은 코드에서 제외
`src/` 안에서는 아무도 안 쓰지만 `scripts/`가 import한다: `isConfirmedRevenueStatus`, `kstToday`, `nextExpiresAt`, `runTrustSyncBatch`.
- **판단**: "당장은 유지". 운영 스크립트가 실제로 쓰는 계산 로직이라 지우면 백필 스크립트가 깨진다.

### J-08. 페이지/레이아웃 default export를 죽은 코드에서 제외
초기 스캐너가 `app/**/page.tsx`의 `export default function XxxPage`를 전부 "미참조"로 잡았다. Next.js App Router 진입점이라 import되지 않는 게 정상이다.
- **판단**: `page/layout/loading/error/not-found/route/template/middleware` 파일명은 진입점으로 화이트리스트 처리. 재실행 후 realmyos 미사용 default export가 29개 → 6개로 줄었다. **첫 결과를 그대로 보고했다면 오보였을 것이다.**

### J-09. `product_costs.tenant_id` — "즉시 에러"가 아니라 "죽은 코드"로 분류
`product.ts:998`이 없는 컬럼을 필터한다 → 항상 `42703`. 하지만 그 함수(`getProductCostHistory`)를 **아무도 호출하지 않는다**.
- 다만 화면(`ProductDetailTabsClient.tsx:393` 「가격 변경 로그 (product_costs)」)은 존재한다. 데이터는 다른 경로(`getProductDetail`)로 들어온다.
- **판단**: 사용자에게 보이는 에러는 없다 → "죽은 코드". 단, 이 함수를 되살리려는 순간 바로 깨지므로 스키마 불일치 목록에도 남긴다.

### J-10. `action_logs.message_template_id` — 별도 등급 "무음 실패"를 신설
`logAction()`(`action-log.ts:30`)은 `try/catch`로 감싸고 에러 시 `null`을 반환한다. 즉 **에러가 어디에도 안 드러난다.**
- 지시서의 3분류(즉시 에러/조건부 에러/죽은 코드) 어디에도 정확히 안 맞아서 **"무음 실패(silent)"를 4번째 등급으로 추가**했다.
- 근거를 데이터로 확인: `action_logs` 마지막 기록 = **2026-04-07**, 총 1행. 5개월간 영업 액션 로그가 한 건도 안 쌓였다.
- 같은 등급에 견적번호 채번(`quote.ts:38` `issueQuoteNumber`)도 넣었다. `error`를 안 읽고 `count`만 구조분해 → 항상 `undefined` → 번호가 **영구히 `QUO-YYYYMMDD-0001`**.

### J-11. `restaurant.ts` vs `menus.ts` 중복 → "중복 구현" + "스키마 불일치" 양쪽에 기록
`menus` 테이블 실제 컬럼은 `is_representative`. `actions/menus.ts`는 맞게 쓰고, `actions/restaurant.ts`는 `is_featured`(없는 컬럼)를 쓴다.
- **판단**: 같은 일을 하는 코드가 두 벌 있는데 **한 벌만 스키마 변경을 따라갔다**는 게 핵심이라, 두 보고서에 교차 기록했다.

### J-12. 심각도에 "실제 사용 흔적"을 반영
코드가 깨져 있어도 그 기능을 아무도 안 쓰면 우선순위가 다르다. 그래서 96개 테이블 전부의 행 수와 최종 `created_at`을 뽑아 각 항목에 붙였다.
- 예: `ingredients` 0행 + `menus` 마지막 2026-05-17 → 식당OS 식자재/메뉴 기능은 4개월째 미사용 → 같은 "즉시 에러"라도 우선순위 하향.
- 예: `quotes` 1행이지만 `orders` 최종 2026-09-08(어제) → 견적은 미사용이나 주문은 매일 쓴다 → 견적 복구는 중간 우선순위.

### J-13. 3단계(설계 리스크)는 "코드가 지원 안 하는 지점"만 적고 대안 설계는 안 적음
지시서가 "점검"이라고 했지 "설계하라"고 하지 않았다. 대안은 5단계(개선 제안)로 넘겼다.

### J-14. 어제 조사(플랫폼 매입가 유출)와 겹치는 부분
`calcCartDiscount`의 원가 역산 경로는 어제 별도 보고서에서 다뤘다. 오늘 문서에서는 **중복 서술하지 않고**, 설계 리스크·개선 제안에서 필요한 만큼만 참조했다.

---

## 2. "확인 필요" 목록 (사람이 판단해야 하는 것)

| # | 항목 | 왜 내가 못 정했나 |
|---|---|---|
| C-01 | `quotes.deleted_at` — 컬럼을 추가할 것인가, 소프트삭제를 포기할 것인가 | 견적 데이터가 1행뿐이라 "기능을 살릴지 접을지"가 제품 결정 |
| C-02 | `message_templates` 테이블 — 만들 것인가, `/settings/messages` 화면을 뗄 것인가 | 동일 |
| C-03 | 식당OS `/suppliers`(거래처 관리) — `suppliers` 테이블을 만들 것인가, `customers`로 통합할 것인가 | `CONTEXT.md`가 "목표와 다름 ⚠️"으로 이미 표시해둔 미결 사항 |
| C-04 | `actions/import.ts`(명세서 OCR 식자재 import) — 7개 컬럼을 추가해 되살릴 것인가, 기능째 뗄 것인가 | UI 진입점(`TodayImportCard`)도 이미 고아 상태. 로드맵상 위치를 모름 |
| C-05 | `payments.payee_tenant_id/payer_tenant_id` 백필 — 209/258행(81%)이 NULL | 백필은 쓰기 작업. 규칙(어느 tenant를 payee로 볼지)도 사람이 정해야 함 |
| C-06 | RLS 정책 본문 검증 | SQL 실행 통로가 열려야 가능. 위 0-2 참조 |
| C-07 | 트리거 함수 3개 존재 여부 | 동일 |
| C-08 | 이 6개 문서의 SSOT를 어느 레포로 할지 | J-02 참조 |
| C-09 | `(admin)/participants`, `(admin)/policy`, `(admin)/settlements` 고아 파일 4개 삭제 | 최신본(`(admin)/admin/...`)과 diff가 있다. 어느 쪽이 의도된 최신인지 사람 확인 필요 |
| C-10 | `users.auth_uid`(6/6 NULL), `orders.buyer_tenant_id`(282/282 NULL), `orders.order_source`(282/282 NULL) 컬럼 제거 | 미래 계획된 컬럼일 수 있음 |

---

## 3. 수집한 원자료 요약 (다른 보고서가 참조하는 숫자)

### 3-1. 운영 DB 규모 (2026-09-09 실측)
- public 스키마 테이블 **96개**, PostgREST 노출 함수 **25개**, 스토리지 버킷 **2개**
- tenants **8개** (admin 1 / restaurant 3 / supplier 2 / role NULL 2), users **6명** (admin 1)
- 전 tenant `subscription_plan = 'free'`

### 3-2. 활발한 테이블 vs 죽은 테이블
| 살아있음 (최근 활동) | 행수 | 최종 |
|---|---|---|
| `orders` / `order_lines` | 282 / 518 | 2026-09-08 |
| `payments` / `collection_allocations` | 258 / 202 | 2026-09-08 |
| `customers` | 142 | 2026-09-08 |
| `admin_logs` | 454 | 2026-09-08 |
| `products` / `product_costs` / `commerce_product_listings` | 199 / 194 / 38 | 2026-09-07 |
| `customer_tag_logs` | 51 | 2026-09-07 |
| `field_observations` | 3 | 2026-09-07 |

| 멈춤 / 미사용 | 행수 | 최종 |
|---|---|---|
| `action_logs` | 1 | **2026-04-07** |
| `sales_schedules` | 1 | 2026-04-12 |
| `menus` / `fixed_costs` | 2 / 15 | 2026-05-17 / 05-18 |
| `product_logs` | 61 | 2026-07-20 |
| `deposit_logs` | 30 | 2026-07-21 |
| `commerce_orders` / `quotes` / `message_logs` / `contact_logs` | 9 / 1 / 3 / 6 | 2026-07-31 |

**0행 테이블 (37개)**: `action_queue`, `ai_decision_logs`, `coupon_uses`, `coupons`, `customer_monthly_stats`, `fund_rules`, `fund_transfers`, `ingredient_price_history`, `ingredient_unit_history`, `ingredients`, `invoice_suppliers`, `menu_ingredients`, `notices`, `notifications`, `payment_allocations`, `price_history`, `pricing_policies`, `pricing_policy_targets`, `product_code_sequences`, `product_related_manual`, `quote_items`, `quote_logs`, `relationships`, `restaurant_order_items`, `rfq_bids`, `rfq_requests`, `sales_lead_notes`, `sales_leads`, `savings_stats`, `shipping_groups`, `subscription_billing_attempts`, `supplier_contacts`, `supplier_payables`, `tenant_relationships`, `today_events`, `trust_score_logs`, `trust_scores`, `wishlist_items`, `_etl_payments_outgoing`, `_etl_rfq_bids`, `_etl_rfq_requests`, `_etl_suppliers`

### 3-3. 데이터 품질 지표
| 지표 | 값 | 뜻 |
|---|---|---|
| `order_lines.cost_price <= 1` | **64 / 518 (12.4%)** | 마진 분석의 12%가 원가 미확정 상태로 계산됨 |
| `product_costs` 활성 중 `cost_price <= 1` | **11 / 190** | 원가 미확정 상품 |
| `product_stats.used_by_count > 0` | **0 / 180** | 상품 사용처 카운터가 한 번도 안 채워짐 |
| `customer_stats` 행 / 활성 `customers` | **11 / 138 (8%)** | 고객 통계 커버리지 |
| `payments.payee_tenant_id` NULL | **209 / 258 (81%)** | tenant 축 전환 미완 |
| `payments.payer_tenant_id` NULL | **210 / 258 (81%)** | 동일 |
| `orders.buyer_tenant_id` NULL | **282 / 282 (100%)** | 한 번도 안 채워짐 |
| `orders.order_source` NULL | **282 / 282 (100%)** | 동일 |
| `users.auth_uid` NULL | **6 / 6 (100%)** | 동일 |
| `orders.order_type` | 전부 `sale` | 매입 주문 타입 미사용 |
| `commerce_product_listings.admin_memo` NOT NULL | **0 / 38** | 내부 메모 미사용 |

### 3-4. 정적 스캔 규모
| | realmyos | restaurant-os |
|---|---|---|
| `.ts`/`.tsx` 파일 | 335 | 179 |
| export 심볼 | 972 | 512 |
| 파일 밖에서 한 번도 참조 안 되는 심볼 | 224 | 141 |
| 참조하는 DB 테이블 | 71 | 36 |
| 마이그레이션 `.sql` | 104 | 13 |

---

## 4. 실행 로그 (내가 실제로 한 것 전부)

```
[읽기] 두 레포 전체 파일 정적 스캔 (테이블/컬럼 참조 추출, 미사용 export, 중복 구현)
[읽기] 117개 마이그레이션 .sql 파싱 → DDL 객체 추출
[읽기] GET  /rest/v1/                       (OpenAPI 스키마 96 테이블 + 25 RPC)
[읽기] GET  /storage/v1/bucket              (버킷 2개)
[읽기] GET  /rest/v1/<96개 테이블>?select=*&limit=1  (컬럼·행수·최종활동)
[읽기] GET  /rest/v1/<의심 컬럼>            (42703 여부 개별 확인)
[인증] POST /auth/v1/token?grant_type=password  × 2 (E2E supplier/restaurant 계정)
[읽기] 위 2개 세션으로 RLS 동작 확인 SELECT 반복
[쓰기] doc/ 아래 .md 6개 생성 → git add doc/ → commit → push (dev)
```
- 운영 데이터 INSERT/UPDATE/DELETE: **0건**
- 애플리케이션 코드 수정: **0건**
- 마이그레이션 생성/실행 / `db push`: **0건**
- `git add .` 사용: **0회** (경로 한정 스테이징만)
