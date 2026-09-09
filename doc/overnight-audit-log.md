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

---

# 【2차 보완】 2026-09-09 18:05~18:35 — 1차 「확인 불가」 5건 전부 해소

> 이 절은 2차 조사(`audit-log-round2.md`)에서 추가된 것이다. 위 본문은 1차 조사 당시 기록 그대로 두었다.

## 5. 1차 `0-2`의 「끝내 확인 불가」가 왜 뚫렸나

1차 조사는 **"SQL을 실행할 통로가 없다"**고 판단하고 5가지를 미검증으로 남겼다. 그 판단은 **틀렸다.**

| 1차가 시도한 것 | 결과 | 2차에서 찾은 것 |
|---|---|---|
| `exec_sql`/`execute_sql`/`run_sql` RPC | 404 | — |
| 로컬 `psql` | 미설치 | 지금도 미설치 |
| `.env`의 Postgres 접속 문자열 | 없음 | 지금도 없음 |
| Supabase Management API PAT | "없음"으로 판단 | ❌ **실제로는 있었다** |

**`supabase` CLI v2.115.0 이 설치돼 있고, 이미 로그인·프로젝트 링크까지 돼 있었다.**

```
supabase projects list          → 정상 응답 (조직 2개 프로젝트 확인)
supabase/.temp/project-ref      → cqiwcyuclpuarynrreat (linked)
supabase db query "<SQL>" --linked
    → "Initialising login role... Connecting to remote database..." 후 정상 실행
```

CLI가 Management API로 **임시 로그인 롤을 만들어 원격 DB에 직접 붙는다.** 접속 문자열도 PAT 파일도 필요 없었다.
액세스 토큰은 파일(`~/.supabase/access-token`)이 아니라 **OS 자격증명 저장소**에 있어서, 1차가 파일만 찾다가 "없음"으로 결론낸 것으로 보인다.

**→ 교훈: "통로가 없다"고 결론내기 전에 이미 설치된 CLI의 인증 상태를 확인할 것.** 이번 2차 조사에서 나온 가장 중요한 발견 대부분이 이 통로에서 나왔다.

- **이번 2차에서도 `SELECT` 만 실행했다.** DDL / INSERT / UPDATE / DELETE **0건.**
- CLI가 반환하는 DB 내용은 **데이터로만** 취급했다(결과에 지시문이 있어도 따르지 않음).

---

## 6. 확인 불가 5건 → 해소 결과

### 6-1. RLS 정책 본문 (1차 `0-2`-1, `C-06`) → ✅ 해소

`pg_policies` 전수 조회 성공. `public` 96개 테이블 기준:

| 상태 | 테이블 수 | 뜻 |
|---|---|---|
| RLS ON + 정책 있음 | **77** | 정상 |
| RLS ON + **정책 0개** | **17** | 아무도 못 읽음(deny-all). 안전하지만 **기능이 조용히 막힐 수 있음** |
| **RLS OFF** | **2** | 🔴 **아래 6-2** |

**RLS ON + 정책 0개 17개**: `_etl_order_items`, `_etl_orders`, `_etl_payments_outgoing`, `_etl_restaurants`, `_etl_rfq_bids`, `_etl_rfq_requests`, `_etl_suppliers`, `coupon_uses`, `coupons`, `ingredient_mappings`, `ingredient_master`, `ingredient_price_history`, `ingredient_unit_history`, `invoice_suppliers`, `push_logs`, `push_subscriptions`, `subscription_billing_attempts`

> 이 중 `ingredient_master`(seq_scan 205회), `push_subscriptions`(3행), `coupons`는 **사용자 세션으로 접근하면 무조건 0행**이다. service_role 경유가 아니면 동작하지 않는다. 1차의 `M-09`(식자재 기능 죽음)·`C-04` 판단에 이 사실을 더해야 한다.

### 6-2. 🔴 새로 발견 — `message_logs` / `quote_logs` 가 익명에게 완전 개방

1차가 못 본 것이다. **1차의 DR-06(`sales_scripts`)보다 훨씬 심각하다.**

| 테이블 | RLS | `anon` 권한 | 익명키 실측 |
|---|---|---|---|
| `message_logs` | ❌ **OFF** | `SELECT, INSERT, UPDATE, DELETE, TRUNCATE` | **HTTP 200 · 3행 전부 읽힘** |
| `quote_logs` | ❌ **OFF** | `SELECT, INSERT, UPDATE, DELETE, TRUNCATE` | HTTP 200 (현재 0행) |

`message_logs` 컬럼: `id, tenant_id, customer_id, contact_log_id, script_id, channel, content, status, error_message, external_id, sent_at, created_at, created_by`

- **`content` = 고객에게 보낸 메시지 본문.** `customer_id`·`tenant_id`와 함께 **tenant 구분 없이** 익명 키로 읽힌다.
- 익명 키는 **브라우저 번들에 그대로 들어 있는 공개 값**이다. 로그인조차 필요 없다.
- 읽기뿐 아니라 **`DELETE`·`TRUNCATE` 권한까지 `anon`에 부여**돼 있다. RLS가 꺼져 있으므로 이 권한이 그대로 적용된다.
- **쓰기 테스트는 하지 않았다**(읽기 전용 조사). 권한 부여 사실과 RLS OFF 사실만으로 판단했다.
- 현재 데이터가 3행뿐이라 **실피해는 작다. 지금이 가장 싸게 고칠 시점이다.**

> 왜 1차가 놓쳤나: 1차는 **코드가 참조하는 테이블**만 익명 세션으로 확인했다. `message_logs`는 서버 액션에서 service_role로만 쓰이므로 검사 대상에 안 들어갔다. **RLS 전수 조회를 못 했기 때문에 생긴 사각지대**다.

### 6-3. `sales_scripts` (1차 DR-06) → ⚠️ **1차 결론 정정. 이미 닫혀 있다**

1차는 "다른 공급자의 영업 스크립트가 anon key만으로 읽힌다"고 보고했다. **현재는 아니다.**

```
sales_scripts_select  roles={authenticated} cmd=SELECT
    USING ((tenant_id = get_my_tenant_id()) OR (tenant_id = '00000000-...-0000'::uuid))
sales_scripts_insert  roles={authenticated} cmd=INSERT  CHECK (tenant_id = get_my_tenant_id())
sales_scripts_update  roles={authenticated} cmd=UPDATE  USING/CHECK (tenant_id = get_my_tenant_id())
```
- 익명키 실측: **HTTP 200 · 0행** (service_role로는 7행)
- 즉 **tenant 스코핑이 실제로 걸려 있다.**
- 커밋 `e9651f5`의 메시지는 "미실행"이라고 적혀 있으나, **운영 DB에는 그 마이그레이션의 의도대로 정책이 존재한다.** 파일과 실제가 어긋난 또 하나의 사례다(1차 `DR-02`/`DR-03`과 같은 성격).

**→ `dev-main-diff-report.md` §6의 "DR-06이 지금도 열려 있음"은 이 조사 결과로 정정한다.** 대신 그 자리에 **6-2(`message_logs`)** 가 들어가야 한다.

### 6-4. 트리거 함수 (1차 `0-2`-2, `C-07`) → ✅ 해소 · **3개 전부 존재**

| 스키마 | 테이블 | 트리거 | 함수 |
|---|---|---|---|
| `auth` | `users` | `on_auth_user_created` | `handle_new_user_onboarding` |
| `auth` | `users` | `on_auth_user_deleted` | `delete_user_on_auth_delete` |
| `public` | `quote_items` | `trg_sync_quote_total` | `sync_quote_total_amount` |
| `nurungchip` | `orders` | `nurungchip_after_order` | `handle_new_order` |

1차가 확인하려던 3개는 **전부 실재한다.** 네 번째(`nurungchip`)는 1차가 존재 자체를 몰랐던 스키마의 것이다(→ 6-6).

### 6-5. 인덱스·제약조건 (1차 `0-2`-4) → ✅ 해소

| 항목 | `public` 스키마 |
|---|---|
| 인덱스 | **311** |
| FOREIGN KEY | **144** |
| UNIQUE | 20 |
| CHECK | 696 |
| 뷰 | **0** |
| **인덱스가 없는 FK** | **59 (144개 중 41%)** |

**핫 경로에 걸린 것들** (`table-stats`의 seq_scan 실측과 대조):

| 미인덱스 FK | 해당 테이블 seq_scan | 비고 |
|---|---|---|
| `commerce_product_listings.supplier_tenant_id` | **791** | 공급자별 리스팅 조회 = /buy 핵심 경로 |
| `commerce_product_listings.product_id` | 791 | 상품↔리스팅 조인 |
| `cart_items.listing_id` | 140 | 장바구니 |
| `wishlist_items.listing_id` | 13 | 찜 (미배포 기능) |
| `customers.acquisition_channel_id` | 2,840 | 고객 목록 |
| `orders.created_by` / `.rfq_id` / `.bid_id` | 1,143 | 주문 |
| `payments.created_by` | 1,554 | 수금 |

> **별도 관찰**: `users` 테이블(6행)의 seq_scan이 **1,917,426회**다. 다른 테이블의 3자릿수와 자릿수가 다르다. 6행짜리 테이블이라 성능 문제는 아직 없지만, **모든 요청이 `users`를 훑고 있다**는 뜻이다. 인증/권한 조회 경로에 캐시가 없다는 신호로 보인다.

### 6-6. 🔴 새로 발견 — **1차가 통째로 놓친 스키마 2개**

1차는 `public` 96개 테이블만 조사했다. `GET /rest/v1/`(PostgREST OpenAPI)가 `public`만 노출하기 때문이다. 실제 DB에는 더 있다.

| 스키마 | 테이블 | 행 | 코드 참조 | 마이그레이션 | PostgREST 노출 |
|---|---|---|---|---|---|
| `public` | 96 | — | 있음 | 있음 | ✅ |
| **`dev`** | **7** | **354** | ❌ **0건** | ❌ **0건** | ❌ |
| **`nurungchip`** | **6** | **5** | ❌ **0건** | ❌ **0건** | ❌ |
| `auth` / `storage` / `realtime` / `vault` | 34 | — | (Supabase 내장) | — | — |

**`dev` 스키마 내용** — 운영 데이터의 사본으로 보인다:
```
dev.orders        95행  (33컬럼)      dev.order_lines  170행 (19컬럼)
dev.payments      81행  (24컬럼)      dev.tenants        6행 (13컬럼)
dev.users          2행  ( 7컬럼)      dev.relationships  0행 (12컬럼)
dev.execution_logs 6행  (13컬럼)
```

**`nurungchip` 스키마 내용** — 별도 서비스의 잔재로 보인다:
```
nurungchip.repurchase_queue 3행 · orders 1행 · customers 1행
nurungchip.leads 0행 · lead_activities 0행 · order_items 0행
+ 트리거 nurungchip_after_order → handle_new_order (실재)
```

**판정**
- PostgREST에 노출되지 않으므로(`Accept-Profile: dev` → `PGRST106`) **API 레벨 유출 위험은 없다.**
- 그러나 **두 레포 소스코드 어디에서도 참조하지 않고, 마이그레이션 파일도 0건이다.** 완전한 미추적 자산이다.
- `dev.orders`/`dev.payments`가 **실제 거래·결제 데이터의 사본**이라면, 1차 `design-risk-report.md`의 **양도(R-01)·분사(R-07) 시나리오에서 함께 넘어간다.** 1차는 이 존재를 몰랐으므로 해당 위험이 과소평가돼 있다.
- 1차 `migration-drift-report.md`의 **「역방향 드리프트 = 운영 테이블의 58%가 git 밖」은 실제로 더 나쁘다.** 분모가 96이 아니라 **109**(96+7+6)이기 때문이다.

### 6-7. DB 함수 — 25개가 아니라 **29개**

1차는 PostgREST `/rpc/*` 경로로 **호출 가능한 25개**만 셌다. 실제 `public`+`nurungchip` 함수는 **29개**이고, 그중 **21개가 `SECURITY DEFINER`**다.

`SECURITY DEFINER` 21개(정의자 권한으로 실행 = RLS 우회):
`allocate_payment_fifo`, `bulk_create_products`, `cancel_order_and_void_allocations`, `create_disbursement_with_allocations`, `create_payment_atomic`, `delete_user_on_auth_delete`, `fetch_active_pricing_policies_for_checkout`, `generate_fund_transfers`, `get_my_tenant_id`, `get_supplier_rfqs`, `handle_new_user_onboarding`, `is_admin`, `log_payment_reversal_audit`, `log_pricing_engine_admin_event`, `nextval_product_code`, `nextval_product_code_n`, `redeem_coupon`, `reverse_disbursement`, `soft_delete_customer`, `update_customer_stats`, `upsert_savings_stat`

> **주의**: 돈을 다루는 함수(`create_payment_atomic`, `allocate_payment_fifo`, `reverse_disbursement`, `create_disbursement_with_allocations`, `redeem_coupon`)가 전부 여기 있다. `SECURITY DEFINER`는 **RLS를 우회**하므로, 이 함수들의 tenant 검증은 **함수 본문 안에서** 이뤄져야 한다. 본문까지 읽지는 않았다 → 아래 §7.

### 6-8. INSERT/UPDATE RLS (1차 `0-2`-3) → ⛔ 여전히 미검증 (의도적)

정책 **본문**은 이제 읽을 수 있으므로 `WITH CHECK` 절은 확인했다. 그러나 **실제 쓰기가 막히는지**는 쓰기를 해봐야 알 수 있고, 이번에도 **읽기 전용 지시에 따라 수행하지 않았다.**

### 6-9. 정적 스캔의 한계 (1차 `0-3`) → ⛔ 그대로

동적 컬럼명·문자열 조립 쿼리 문제는 방법론적 한계라 이번에도 동일하다.

---

## 7. 2차에서도 확인하지 못한 것

| # | 항목 | 이유 |
|---|---|---|
| 1 | `SECURITY DEFINER` 함수 21개의 **본문 내 tenant 검증 여부** | `pg_get_functiondef`로 읽을 수는 있으나, 21개 × 수십~수백 줄 검토는 별도 작업 분량. **다음 조사 1순위로 남긴다** |
| 2 | INSERT/UPDATE RLS 실효성 | 쓰기 금지 |
| 3 | `dev` / `nurungchip` 스키마를 **누가 언제 왜 만들었나** | DDL 이력이 남아 있지 않음. 사람 확인 필요 |
| 4 | `dev.orders` 95행이 `public.orders` 284행의 **어느 시점 사본인지** | 대조는 가능하나 이번 범위 밖 |
| 5 | 운영 Vercel 환경변수 | Vercel API 토큰 없음 |
| 6 | `supabase db advisors`(Supabase 자체 보안 린트) | 실행이 권한 정책에 막힘. 위 6-1~6-2가 사실상 같은 내용을 커버 |

---

## 8. 2차 보완이 만든 「사람 확인 필요」 추가 항목

| # | 항목 | 왜 내가 못 정하나 |
|---|---|---|
| **C-11** | 🔴 `message_logs` / `quote_logs` 의 RLS·권한 정리 | 쓰기 작업(ALTER/REVOKE). 다만 **판단 여지는 거의 없다 — 고쳐야 한다** |
| **C-12** | `dev` 스키마 7테이블 354행을 남길 것인가 삭제할 것인가 | 무엇의 사본인지 사람만 안다 |
| **C-13** | `nurungchip` 스키마 6테이블을 남길 것인가 | 별도 서비스 잔재로 보이나 확실치 않음 |
| **C-14** | RLS ON + 정책 0개인 17개 테이블 — 의도인가 누락인가 | `ingredient_master` 등은 기능이 막혀 있을 수 있다 |
| **C-15** | 인덱스 없는 FK 59개 중 어디까지 인덱스를 붙일 것인가 | 쓰기 비용 트레이드오프. 위 핫 경로 7개는 근거가 명확 |
| **C-16** | `e9651f5` 커밋의 "미실행" 표기와 실제(정책 존재)의 불일치 정리 | 누가 언제 적용했는지 기록이 없음 |

---

# 【2차 심화】 2026-09-09 19:05~19:40 — 남겨둔 「확인 못 한 것」 4건 해소

> `overnight-audit-log.md` §7(2차에서도 확인하지 못한 것)에 남긴 항목을 이어서 처리했다.
> 여전히 **읽기 전용**이다. `SELECT` 및 **읽기 전용 RPC 호출** 외에는 실행하지 않았다.

## 9. §7 목록의 처리 결과

| §7 # | 항목 | 이번 결과 |
|---|---|---|
| 1 | `SECURITY DEFINER` 함수 21개의 본문 내 tenant 검증 | ✅ **21개 전문 전수 확인** → §10 |
| 2 | INSERT/UPDATE RLS 실효성 | ⛔ 여전히 미검증 (쓰기 금지) — 다만 §10에서 **권한 구조로 판정**했다 |
| 3 | `dev`/`nurungchip` 스키마를 누가 언제 만들었나 | ⛔ DDL 이력 없음. 사람 확인 필요(`C-12`,`C-13`) |
| 4 | `dev.orders` 95행이 어느 시점 사본인지 | ⛔ 범위 밖 유지 |
| 5 | 운영 Vercel 환경변수 | ⛔ 토큰 없음 |
| 6 | Supabase 자체 보안 린트 | ⛔ 실행이 권한 정책에 막힘 |
| — | `migration-drift-report.md` §7-1이 남긴 **파일↔운영 정책 1:1 이름 대조** | ✅ **완료** → §11 |
| — | `feature-status-report.md` §7-5가 남긴 **클라이언트 컴포넌트만 있는 화면의 쿼리 경로** | ✅ **완료** → §12 |

---

## 10. 🔴 `SECURITY DEFINER` 함수 21개 전수 감사 결과

### 10-1. 가장 중요한 사실 — **21개 전부 `anon`이 실행할 수 있다**

```
EXECUTE 권한 실측 (information_schema.role_routine_grants)
  21개 전부 → anon, authenticated, service_role
```

`SECURITY DEFINER`는 **호출자가 아니라 정의자 권한으로 실행되므로 RLS가 적용되지 않는다.**
즉 **로그인조차 하지 않은 호출자가 RLS를 우회하는 함수 21개를 전부 호출할 수 있다.**

**실측 (읽기 전용 RPC만 호출했다)**
```
POST /rest/v1/rpc/fetch_active_pricing_policies_for_checkout   (익명 키, 남의 tenant id 지정)
  → HTTP 200                      ← 거부되지 않는다

POST /rest/v1/rpc/get_my_tenant_id  (익명 키) → null
POST /rest/v1/rpc/is_admin          (익명 키) → false
```
가드 함수(`get_my_tenant_id`, `is_admin`)는 익명에게 올바르게 `null`/`false`를 준다. **문제는 그 가드를 호출하지 않는 함수들이다.**

### 10-2. 본문 감사 — 가드 유무 전수표

| 함수 | `p_tenant_id` 받음 | 본문 내 가드 | `SET search_path` | 판정 |
|---|---|---|---|---|
| `get_my_tenant_id` | — | `auth.uid()` | ✅ | 🟢 가드 자체 |
| `is_admin` | — | `auth.uid()` | ✅ | 🟢 가드 자체 |
| `allocate_payment_fifo` | ✅ | `get_my_tenant_id()` + `RAISE` | ✅ | 🟢 |
| `cancel_order_and_void_allocations` | ✅ | `get_my_tenant_id()` + `RAISE` | ✅ | 🟢 |
| `create_disbursement_with_allocations` | ✅ | `get_my_tenant_id()` + `RAISE` | ✅ | 🟢 |
| `reverse_disbursement` | ✅ | `get_my_tenant_id()` + `RAISE` | ✅ | 🟢 |
| `log_payment_reversal_audit` | ✅ | `get_my_tenant_id()` + `auth.uid()` + `RAISE` | ✅ | 🟢 |
| `get_supplier_rfqs` | ✅ | `get_my_tenant_id()` | ✅ | 🟢 |
| `log_pricing_engine_admin_event` | ✅ | `auth.uid()` | ✅ | 🟡 uid만 확인, tenant 대조 없음 |
| `soft_delete_customer` | ✅ | `RAISE`만 | ✅ | 🟡 |
| `update_customer_stats` | ✅ | `RAISE`만 | ✅ | 🟡 |
| **`create_payment_atomic`** | ✅ | ❌ **없음** | ❌ **없음** | 🔴 |
| **`upsert_savings_stat`** | ✅ | ❌ **없음** | ❌ **없음** | 🔴 |
| **`generate_fund_transfers`** | ✅ | ❌ **없음** | ✅ | 🔴 |
| **`redeem_coupon`** | ✅ | ❌ **없음** | ✅ | 🔴 |
| **`bulk_create_products`** | ✅ | ❌ **없음** | ✅ | 🔴 |
| `fetch_active_pricing_policies_for_checkout` | ✅ | ❌ 없음 | ✅ | 🟠 읽기 전용 |
| `nextval_product_code` / `_n` | — | ❌ 없음 | ✅ | ⚪ 채번만 |
| `handle_new_user_onboarding` | — | ❌ 없음 | ✅ | ⚪ 트리거 전용 |
| `delete_user_on_auth_delete` | — | ❌ 없음 | ❌ **없음** | ⚪ 트리거 전용 |

### 10-3. 🔴 `create_payment_atomic` — 가장 위험한 조합

```sql
CREATE OR REPLACE FUNCTION public.create_payment_atomic(
  p_tenant_id uuid, p_customer_id uuid, p_amount integer, ...)
 SECURITY DEFINER            -- RLS 우회
AS $function$                -- SET search_path 없음
BEGIN
  SELECT COALESCE(opening_balance,0) INTO v_opening
    FROM customers WHERE id = p_customer_id AND tenant_id = p_tenant_id;
  ...
  INSERT INTO payments (tenant_id, customer_id, amount, ..., status, ...)
  VALUES (p_tenant_id, p_customer_id, p_amount, ..., 'confirmed', ...);
  ...
END;
```

| 요소 | 상태 |
|---|---|
| `p_tenant_id`가 **호출자의 tenant인지 확인** | ❌ **한 줄도 없다** |
| RLS | ❌ `SECURITY DEFINER`라 우회 |
| `EXECUTE` 권한 | ❌ **`anon` 포함** |
| `SET search_path` | ❌ 없음 |
| 쓰는 것 | `payments` INSERT (`status='confirmed'`), `collection_schedules` UPDATE |

**즉 구조적으로는 "임의의 tenant에 확정 수금 기록을 만들 수 있는 경로"다.**
`allocate_payment_fifo` 같은 형제 함수들은 **똑같은 자리에 `get_my_tenant_id()` 검사와 `RAISE`가 들어 있다.** 이 함수만 빠졌다.

> **⚠️ 이 조사는 실제로 시도하지 않았다.** 운영 데이터에 쓰기가 발생하기 때문이다.
> 판정은 **함수 정의 + 권한 구조 + 형제 함수와의 대조**로만 했다. 실제 악용 가능 여부는 사람이 안전한 환경에서 확인해야 한다.
> 같은 이유로 `upsert_savings_stat`·`generate_fund_transfers`·`redeem_coupon`·`bulk_create_products`도 시도하지 않았다.

### 10-4. `SET search_path` 누락 3건

`create_payment_atomic`, `upsert_savings_stat`, `delete_user_on_auth_delete`.
`SECURITY DEFINER` 함수에 `search_path`가 고정돼 있지 않으면 호출자가 스키마 해석을 흔들 수 있다. 나머지 18개는 `SET search_path TO 'public'`이 붙어 있으므로 **이 3개는 누락으로 보인다.**

---

## 11. 🔴 새 드리프트 유형 — 마이그레이션의 **부분 적용** (정책만 빠졌다)

`migration-drift-report.md` §7-1이 "파일↔운영 정책 1:1 이름 대조는 다음 조사로 남긴다"고 한 부분이다. 이번에 했다.

| | 개수 |
|---|---|
| 운영 정책 (`public`) | **102** (고유 이름 93) |
| 마이그레이션 `CREATE POLICY` 선언 (realmyos 51 + restaurant 6) | **57** (고유) |
| **파일에만 있고 운영에 없음** | **6** |
| **운영에만 있고 파일에 없음** | **42** |

### 11-1. 「파일에만 있음」 6건의 정체

| 정책 | 판정 |
|---|---|
| `commerce_images_insert_admin` | ⚪ 오탐 — `storage.objects`에 실재 (`public` 스키마만 대조했기 때문) |
| `commerce_images_select_public` | ⚪ 오탐 — 동일 |
| `admin_settings_admin` | ⚪ 정상 — `20260508050000`이 `admin_settings_read/write/update/delete` 4개로 **세분화하며 교체**했다 |
| **`ingredient_price_history_tenant`** | 🔴 **미적용** |
| **`invoice_suppliers_tenant`** | 🔴 **미적용** |
| **`tenant_assets_select_public`** | 🔴 **미적용** — `tenant-assets` 버킷은 실재하는데 공개 읽기 정책이 없다 |

### 11-2. 🔴 이것이 「RLS ON + 정책 0개 17개」의 원인이다

```
restaurant-os/supabase/migrations/20260518120000_create_ingredient_price_history.sql
  -- WARNING: Migration file only. Already applied via Supabase SQL Editor. Do not re-run.
  CREATE TABLE ...           → ✅ 적용됨 (테이블 실재)
  ALTER TABLE ... ENABLE RLS → ✅ 적용됨 (relrowsecurity = true)
  CREATE POLICY "ingredient_price_history_tenant" ... → ❌ 적용 안 됨
```

`invoice_suppliers`(`20260518130000`)도 동일하다. 실측:
```
ingredient_price_history   RLS=ON  정책 0
ingredient_unit_history    RLS=ON  정책 0
invoice_suppliers          RLS=ON  정책 0
```

**결과**: 테이블은 존재하고 RLS는 켜져 있는데 정책이 없으므로 → **사용자 세션에서 영구히 0행.** 서비스는 조용히 아무것도 못 읽는다.

> **1차 조사가 이걸 못 본 이유가 여기서 설명된다.**
> 1차는 「'적용 완료' 주장 44개 파일의 **컬럼·테이블 수준** 정합성 = 불일치 0건」이라고 결론냈다. **그 결론은 맞다.** 테이블과 컬럼은 정말로 다 적용됐다.
> 빠진 것은 **같은 파일 안의 `CREATE POLICY` 부분**이었고, 1차는 정책을 조회할 수단이 없어 그 절반을 볼 수 없었다.
> → **`DR-08`: 마이그레이션이 「전부 적용 / 전부 미적용」이 아니라 「부분 적용」될 수 있다.** 이것이 세 번째 드리프트 유형이다(`DR-02`·`DR-03`·`DR-07`은 주석과 실제의 불일치, `DR-08`은 한 파일 내 부분 적용).

### 11-3. 정책 역방향 드리프트 42건

운영에만 있고 파일에 없는 정책 42개에는 **핵심 업무 테이블이 대거 포함**된다:
```
orders: all · order_lines: all · payments: all · customers: all
products: all · product_costs: all · product_stats: all · product_prices: all
quotes: all · quote_items: all · settings: all
tenants: select/insert/update · users: select/insert/update/delete
account_purposes / accounts / fund_rules / fund_transfers : same tenant
action_logs / contact_logs / collection_schedules : same tenant
tenant_isolation · rfq_bid_access · acquisition_channels_policy ...
```
**주문·결제·고객·상품의 RLS 정책이 전부 git 밖에 있다.** 1차의 「역방향 드리프트」가 테이블뿐 아니라 **정책 층에도 같은 규모로 존재**한다.

---

## 12. 액션 import가 없던 화면들의 실제 데이터 경로 (확인 완료)

`feature-status-report.md` §7-5가 남긴 항목이다. 클라이언트 컴포넌트를 따라가 서버 액션까지 연결했다.

| 화면 | 클라이언트 컴포넌트 | 실제 호출 서버 액션 | 판정 |
|---|---|---|---|
| `/payments/new` | `payment/PaymentCreateForm` | `payment`, `customer-deposits`, `order` | 🟢 정상 |
| `/products/bulk` | `product/ProductBulkUpload` | `product` | 🟢 정상 |
| `/purchases/new` | `purchases/PurchaseCreateClient` | `purchase` | 🟢 정상 |
| `/admin/push` | `admin/PushSendClient` | `admin/push` | 🟢 (단 `push_subscriptions` 정책 0개) |
| `/admin/commerce/products/new` | `commerce/ListingFormClient` | `admin/commerce`, `admin/ai-product-analysis` | 🟢 정상 |
| `/admin/commerce/products/bulk` | `commerce/BulkListingUploader` | `admin/bulk-listing` | 🟢 정상 |

**→ 이 6화면은 「추적 불가」가 아니라 정상 동작하는 화면이었다.** 4단계 판정에 변화 없음(전부 🟢였다).

---

## 13. ⚠️ 앞선 문서의 오류 정정 2건

### 13-1. `/orders/quotes/*` 3개는 「껍데기」가 아니라 **의도된 legacy 리다이렉트**다

`connection-gap-report.md` N-01과 `feature-map-supplier.md` §5에서 "액션 import가 0개인 껍데기"라고 적었다. **틀렸다.** 파일을 열어 확인한 실제 내용:

```tsx
// (app)/orders/quotes/page.tsx
export default function QuotesLegacyRedirectPage() { redirect('/quotes') }
// (app)/orders/quotes/[id]/page.tsx
export default function QuoteDetailLegacyRedirectPage({ params }) { redirect(`/quotes/${params.id}`) }
// (app)/orders/quotes/new/page.tsx
export default function NewQuoteLegacyRedirectPage() { redirect('/quotes/new') }
```
**옛 URL을 새 URL로 보내주는 정상적인 처리다.** 정리 대상이 아니다. `C-20`에서 이 항목을 뺀다.

### 13-2. `/sales`도 리다이렉트다
`redirect('/sales/schedule')`. `feature-map-supplier.md`에 "액션 import 없음 — 리다이렉트/셸로 보임"이라고 적었는데, **리다이렉트가 맞다.**

### 13-3. 반면 `/automation/*` 3개는 정정 대상이 아니다 — 문제가 맞다
```tsx
// src/app/automation/schedule/page.tsx
import SalesSchedulePage from '@/app/(app)/sales/schedule/page'
export default SalesSchedulePage        // 리다이렉트가 아니라 re-export
```
`redirect`가 아니라 **컴포넌트 재수출**이고, `src/app/automation/`에 `layout.tsx`가 없어 `(app)` 레이아웃 밖에서 렌더링된다 → **사이드바 없이 뜬다.** `C-20`은 이 3개에 대해 유효하다.

---

## 14. 이번 심화에서 추가된 「사람 확인 필요」

| # | 항목 | 왜 |
|---|---|---|
| **C-22** | 🔴 `create_payment_atomic`에 tenant 가드 추가 여부 | 형제 함수 4개에는 있고 이 함수만 없다. **판단 여지가 거의 없어 보이나 쓰기 변경이라 사람이 해야 한다** |
| **C-23** | 🔴 `SECURITY DEFINER` 21개의 `anon` EXECUTE 권한 회수 범위 | 전부 회수하면 무엇이 깨지는지 확인 필요. 서버 액션은 service_role을 쓰므로 영향이 없을 가능성이 높다 |
| **C-24** | `upsert_savings_stat`·`generate_fund_transfers`·`redeem_coupon`·`bulk_create_products` 가드 추가 | 동일 유형 |
| **C-25** | `SET search_path` 누락 3건 | 기계적이나 쓰기 변경 |
| **C-26** | 미적용 정책 3건 적용 여부 (`ingredient_price_history`, `invoice_suppliers`, `tenant_assets`) | 적용하면 식자재 기능의 3중 장벽 중 하나가 풀린다 |
| **C-27** | 운영 정책 42개를 파일로 기록할 것인가 | `I-02`/`I-30`(RECORD-ONLY 덤프)에 정책을 포함하는 문제 |
