# tasks.md — 식식이OS 구현 상태 감사 + 실행 로드맵
> 생성일: 2026-05-06
> 감사 기준: PRODUCT.md + CONTEXT.md + rules.md
> 실행 브랜치: dev

> **1회차**: 본 문서 상단부터 `## [공급자OS]`까지 작성. 감사 요약 표·실행 로드맵은 후속 회차.
> **2회차**: `## [관리자OS]` 추가.
> **3회차**: `## [식당OS]` (`resturant_os`) 추가. 요약 표·실행 로드맵 없음.
> **4회차**: `## [4회차] 감사 요약 · 실행 로드맵` 추가.
> **5회차 (문서)**: `## [공통 DB]`·`DB-*` 도입, `SUP/RES`의 DB성 CHECK 이관, 레거시 → `tasks-legacy.md` 분리, 집계 표·로드맵 정리.
> **6회차 (문서)**: Phase 0 `DB-CHECK-005` 게이트 명시, `SUP-CHECK-002` → `비-DB 운영 확인` 이동·유형 설명, 집계·로드맵 교차 검증.
> **7회차 (문서)**: 운영 DB **forensic** 반영 — `DB-CHECK-001`~`006` 종결, `DB-CHECK-002` → **`DB-DANGER-004`** 승격, `DB-TODO-003` 부분구현 재분류, `DB-CHECK-007`·`008` 추가, 집계·로드맵 갱신.
> **8회차 (문서)**: `realmyos/supabase/migrations/`·`README.md` 거버넌스(baseline·incremental·환경 순서), `DB-DANGER-001` 완료 기준을 **baseline migration 체계**로 정렬, **Phase 1 시작 조건**에 migration governance 명시.
> **9회차 (문서·운영)**: AI·코드 작업 **종료 시** `tasks.md` ID 갱신 + `docs/worklogs/` worklog 생성 **필수** — `.cursor/rules/worklog-completion.mdc`, `docs/worklogs/README.md` 참조.

---

## 문서 사용법 (Phase 0)

1. **`## [공통 DB]`** — 마이그레이션 실사·스키마 정본·`DB-*` ID. **운영 DB forensic(001~006)는 종결**되었으나 **`DB-CHECK-007`·`008`** 및 RLS `WITH CHECK` 잔여 확인은 미결.
2. **`## [공급자OS]` / `## [관리자OS]` / `## [식당OS]`** — 앱 코드 감사 ID (`SUP-*`, `ADM-*`, `RES-*`).
3. **`## 감사 요약 (집계)`** · **`## 실행 로드맵`** — 숫자 요약 및 **현행 감사 ID만** 참조.
4. **`## 비-DB 운영 확인`** — DB·스키마가 아닌 **배포 환경·외부 API** 확인 항목 (`SUP-CHECK-002`).
5. **레거시** — [`tasks-legacy.md`](./tasks-legacy.md) (TASK-nn, 2026-04-27). **`tasks.md`와 혼합 금지.**
6. **AI·코드 작업 종료 시** — 관련 감사 ID 블록에 **작업 이력**(날짜·요약·`docs/worklogs/YYYY-MM-DD_phase-topic.md` 링크)을 남기고, worklog에 목적·ID·파일·변경 요약·migration·테스트·위험·다음 권장 작업을 기록한다. **작업 완료 = 변경 + tasks 반영 + worklog** (`.cursor/rules/worklog-completion.mdc`).

### [OPS — AI worklog] 절차 기록 (감사 ID와 별도)

- **규칙 파일**: `.cursor/rules/worklog-completion.mdc` (항상 적용).
- **작업 이력 (2026-05-06)**: 종료 의무·`tasks.md` 연계·`docs/worklogs/README.md` 갱신 — worklog: [`docs/worklogs/2026-05-06_docs_worklog-completion-mandatory.md`](./worklogs/2026-05-06_docs_worklog-completion-mandatory.md)
- **작업 이력 (2026-05-06)**: 오늘 세션 전체 요약 + Phase 5 진행 상태 업데이트 — worklog: [`docs/worklogs/2026-05-06_session-summary.md`](./worklogs/2026-05-06_session-summary.md)
- **작업 이력 (2026-05-07)**: Phase 5 SUP 트랙 종료 — SUP-PARTIAL-001/006, SUP-TODO-001~004(본체), 005-D 완료 처리; B-2/C-2/C-3/C-4 신규 분리; 005-A/B/C Phase 6+ 이월 — worklog: [`docs/worklogs/2026-05-07_session-summary.md`](./worklogs/2026-05-07_session-summary.md)
- **작업 이력 (2026-05-07)**: UI/UX 전면 개선 1단계(브랜드 컬러 토큰 정리 + Sidebar 차콜/딥그린 테마 + (app) 레이아웃 여백/폭 정리) — worklog: [`docs/worklogs/2026-05-07_design-uiux-phase1.md`](./worklogs/2026-05-07_design-uiux-phase1.md)
- **작업 이력 (2026-05-07)**: Sidebar 중메뉴 구조 복원 + 대시보드 색상 토큰 적용(하드코딩 제거) + analytics build 이슈 수정(OverviewTab client) — worklog: [`docs/worklogs/2026-05-07_fix-sidebar-submenu-and-colors.md`](./worklogs/2026-05-07_fix-sidebar-submenu-and-colors.md)
- **작업 이력 (2026-05-07)**: UI/UX Design System Phase 1(SSOT: tokens/state/density/semantic + `--ds-*` 매핑 + 핵심 프리미티브 4종 + UI audit 문서) — worklog: [`docs/worklogs/2026-05-07_uiux-design-system-phase1.md`](./worklogs/2026-05-07_uiux-design-system-phase1.md)
- **작업 이력 (2026-05-07)**: Dashboard 운영 콘솔 구조(2열, Queue 중심) 적용 + CommandStrip/QueueSection 신설 + 인라인 스타일 제거(CSS Module + `--ds-*`) — worklog: [`docs/worklogs/2026-05-07_dashboard-ops-console-layout.md`](./worklogs/2026-05-07_dashboard-ops-console-layout.md)
- **작업 이력 (2026-05-07)**: Dashboard visual polish 2차(Queue/KPI hierarchy, spacing rhythm, QuickActions 경량화, 분석 약화) — worklog: [`docs/worklogs/2026-05-07_dashboard-visual-polish-v2.md`](./worklogs/2026-05-07_dashboard-visual-polish-v2.md)
- **작업 이력 (2026-05-07)**: Customers 채권 운영 콘솔 row list 적용(즉시 필터링 + 행 클릭 원장 + 수금 액션 1개) — worklog: [`docs/worklogs/2026-05-07_customers-ops-row-list.md`](./worklogs/2026-05-07_customers-ops-row-list.md)
- **작업 이력 (2026-05-07)**: Ledger 돈 흐름 콘솔 재설계(테이블 제거 + 날짜 그룹 sticky/subtotal + 즉시 필터 + KPI hierarchy) — worklog: [`docs/worklogs/2026-05-07_ledger-money-flow-console.md`](./worklogs/2026-05-07_ledger-money-flow-console.md)
- **작업 이력 (2026-05-07)**: Orders 운영 Queue 콘솔 재설계(테이블 제거 + Queue/sticky 날짜 그룹 + 즉시 필터 + CommandStrip/KPI 스트립) — worklog: [`docs/worklogs/2026-05-07_orders-ops-queue-console.md`](./worklogs/2026-05-07_orders-ops-queue-console.md)

---

## [공통 DB] supabase/migrations/ (two repos)

> **실사 일자**: 2026-05-06 — 워크스페이스 디렉터리 직접 열람.  
> **운영 DB forensic 반영**: 2026-05-06 — `DB-CHECK-001`~`006` 종결·`DB-DANGER-004` 승격·`DB-TODO-003` 재분류·`007`/`008` 추가(본 문서 기준).  
> 요청 경로: `realmyos/supabase/migrations/`, `resturant_os/supabase/migrations/` (`restaurant_os` 철자 폴더는 본 워크스페이스에 없음).

### 마이그레이션 폴더·SQL 파일 인벤토리

| 저장소 | 경로 | 결과 |
|--------|------|------|
| realmyos | `supabase/migrations/` | **폴더·`README.md` 존재** — **`.sql` 1개** `20260506120000_fix_today_events_action_kind_check.sql` (DB-DANGER-003·**미적용**); baseline 스냅샷은 운영 추출·승인 후 별도 |
| resturant_os | `supabase/migrations/` | **폴더 없음** — migration 파일 0개 |
| resturant_os | `supabase/schema.sql` | **파일 1개 존재** (DDL 스냅샷·RLS·`upsert_savings_stat` RPC 포함; 시계열 migration 아님) |

### ☠️ DB 구조위험 (DB-DANGER)

#### [DB-DANGER-001] 공급자OS — migration 추적·baseline 체계
- **확인 내용**: 과거에는 `realmyos/supabase/migrations/`가 없어 코드 `.from('…')`·RPC와 **저장소 DDL 간 추적이 단절**된 상태였음. **8회차**: 디렉터리·`README.md`로 **운영 DB SSOT 기준 baseline + incremental** 거버넌스를 확립. **`.sql` 파일은 아직 없음** — 코드↔저장소 입증은 baseline 스냅샷(운영 추출, 환각 DDL 금지) 커밋 후 본격화.
- **완료 기준 (baseline migration 체계 구축)**: `realmyos/supabase/migrations/` 존재; `README.md`에 SSOT·baseline 1회 고정·이후 incremental만·파일명 `YYYYMMDDHHMMSS_description.sql`·**dev → validation → production** 순서·승인·금지 사항(과거 복원·추측 migration) 명시; 팀이 해당 흐름을 채택. *(실제 baseline `.sql` 커밋·DDL 적용은 별 승인·별 작업.)*
- **연계**: `SUP-DANGER-003`·`SUP-DANGER-004` 문맥과 합치

#### [DB-DANGER-002] 식당OS `schema.sql` vs 현행 앱 코드 스키마 불일치 — **종료 (2026-05-06)**
- **위치**: `resturant_os/supabase/schema.sql` vs `resturant_os/src/**` 의 `.from('…')` 참조
- **확인 내용 (이력)**: 예) 스키마는 `payments_outgoing`·`restaurants`·`order_items`·`rfq_bids.supplier_id` 등으로 기술, 코드는 `payments`·`tenants`·`users`·`menus`·`restaurant_order_items` 및 `rfq_bids`에 `supplier_tenant_id` 등 **동일 저장소 스냅샷 기준으로 정합하지 않는 이름·컬럼**을 사용. 단일 realmyos DB 전제 주석과 병행 시 **드리프트·오인** 위험.
- **Forensic 판정 (2026-05-06)**: **`resturant_os/supabase/schema.sql`는 레거시 참고 스냅샷으로 확정** (파일 상단 `[LEGACY SNAPSHOT]` 주석). **정본(SSOT)은 운영 realmyos Supabase 인스턴스** (프로젝트 ref `cqiwcyuclpuarynrreat`). 저장소 스냅샷을 SSOT로 오인하는 구조위험을 문서로 차단.
- **완료 기준 충족**: **예** — SSOT·레거시 스냅샷 역할이 명시됨. *(코드↔운영 DDL 실제 정렬은 `RES-PARTIAL-002`·`RES-PARTIAL-003` 등 별도.)*
- **연계**: `RES-PARTIAL-002`·`RES-PARTIAL-003`
- **작업 이력 (2026-05-06)**: 레거시 주석·본 항목 종료 처리 — worklog: [`docs/worklogs/2026-05-06_db-danger-002_schema-legacy.md`](./worklogs/2026-05-06_db-danger-002_schema-legacy.md)

#### [DB-DANGER-003] `today_events.action_kind` CHECK와 액션 타입 불일치 — **종료 (저장소·2026-05-06)**
- **위치**: 운영 `today_events.action_kind` CHECK vs `resturant_os/src` 호출부·`today-events.ts` 타입
- **확인 내용 (이력)**: 운영 CHECK는 **`payment` / `rfq` / `sku`**(+ NULL)만 허용하는 반면, 코드는 **`delivery`**(`TodayDeliveryCard`)·**`order_create`**(`rfq.ts` `acceptBid`)도 insert → 제약 위반·실패 가능.
- **Forensic / 조치 (2026-05-06)**: CHECK를 코드 유니온에 맞게 확장하는 **migration 추가** — `realmyos/supabase/migrations/20260506120000_fix_today_events_action_kind_check.sql`. **`resturant_os/src/actions/today-events.ts`의 `ActionKind`는 이미 `delivery`·`order_create` 포함 → TS 수정 없음.**
- **완료 기준 충족**: **저장소·계획 단계 예** — DDL 파일 반영. **실 DB 적용은 별 승인·별 실행** (본 라운드에서 미적용).
- **연계**: `today_events` 로깅 전반
- **작업 이력 (2026-05-06)**: migration 추가·tasks 처리 — worklog: [`docs/worklogs/2026-05-06_db-danger-003_today-events-check.md`](./worklogs/2026-05-06_db-danger-003_today-events-check.md)

#### [DB-DANGER-004] `customer_stats.current_balance` — RPC **delta 누적 저장** 및 RULE-02 위반 (승격)
- **승격 출처**: 운영 DB forensic — 기존 **`DB-CHECK-002`** 종결 처리 시 **구조위험으로 승격**.
- **Forensic 판정**: `update_customer_stats`(및 연계 RPC)에서 **`customer_stats.current_balance`에 delta 형태로 누적 갱신**됨을 확인. 필드명은 잔액처럼 보이나 실제는 **캐시/파생 저장**에 해당.
- **RULE 위반**: **RULE-02 확정** — 미수·원장 **단일 계산 소스**가 아닌 컬럼 캐시에 의존하는 저장 패턴. **delta 저장·RPC 갱신은 여전히 본 위반을 유지** (2026-05-06 문서화 기준).
- **의존성 파악 (2026-05-06, 코드 직접 확인)**  
  - **UI에 쓰이는 `current_balance` 필드**: `getCustomerLedger`·`getCustomersWithBalance`·`getCustomersWithScore`·`order-query.getOrderList`·`dashboard.getTodayCollections` 등에서 **`getAccountsReceivable`(주문·수금·opening 집계)** 로 채움 — **`customer_stats.current_balance` 컬럼 값을 표시에 사용하는 경로 없음.**  
  - **`customer_stats` SELECT**: `ledger.getCustomersWithStats`가 `current_balance` 컬럼을 읽으나 **맵핑 시 미사용**(출력 `current_balance`는 집계와 동일). 해당 함수는 **`src` 내 다른 호출부 없음**(UI 미연결).  
  - **RPC `update_customer_stats`**: `order.ts` 주문 취소 시 호출 확인. `payment.ts`에는 직접 호출 없음(`create_payment_atomic`만 — 내부에서 stats 갱신 여부는 TS 미포함).
- **현재 UI 미사용 확인 (승인 반영)**: 화면·연결 액션의 미수 표시는 **원장 계열 집계** 기준이며, **DB 컬럼 `current_balance`는 표시 경로에 반영되지 않음** → **즉시 코드·DB 수정 대상 아님** (장기 과제).
- **이행 방향 (장기)**: **원장 단일 소스** 전환 시 **`customer_stats.current_balance`는 deprecated(또는 cache 전용)로 명시** → RPC delta·쓰기 경로 정리·의존성 제거 후 **제거** (즉시 DROP 금지 원칙 유지).
- **조치 원칙**: **즉시 컬럼 삭제·DROP 금지** (운영·이력·대시보드 파급).  
  - 단계: **deprecated(또는 cache 전용)로 명시** → 신규 기능·리포트는 **원장/집계 쿼리 기준**으로 전환 → 트래픽·의존성 정리 후 **제거**.
- **연계**: `ledger.ts` 조회, `SUP-DANGER-003/004`·`SUP-PARTIAL-004` 논의 시 본 항목과 통합 검토.
- **작업 이력 (2026-05-06)**: 의존성·UI 미사용·이행 방향 문서화 — worklog: [`docs/worklogs/2026-05-06_db-danger-004_current-balance-audit.md`](./worklogs/2026-05-06_db-danger-004_current-balance-audit.md)
- **작업 이력 (2026-05-06)**: **설계·단계 합의 완료** — `update_customer_stats` 호출부에 deprecated 주석 추가(로직 변경 없음) 및 제거 단계(Phase 3~4/6) 확정 — worklog: [`docs/worklogs/2026-05-06_db-danger-004_deprecated-plan.md`](./worklogs/2026-05-06_db-danger-004_deprecated-plan.md)

### 🚨 DB 가짜·추적 단절 (DB-FAKE)

#### [DB-FAKE-001] 공급자OS — 코드는 테이블을 참조하나 repo에 그 테이블을 만드는 migration 파일이 없음
- **정의**: “DB-FAKE”는 **저장소 안에 incremental migration 근거가 없다**는 감사 의미(런타임 DB가 별도 존재할 수 있음).
- **확인 내용**: `migrations/`에 **거버넌스 README만 있고 `.sql`이 없으면** 여전히 `orders`·`order_lines`·`customers`·`payments`·`products`·`settings`·`quotes`·`quote_items`·`customer_product_prices`·`action_logs`·`contact_logs`·`customer_stats`·`customer_deposits`·`payment_allocations`·`collection_schedules` 등에 대해 **파일 기반 입증 불가**. baseline 스냅샷(운영 추출) 커밋 후 완화.
- **완료 기준**: 정본 DDL 기준 문서화 — **Forensic**: `DB-CHECK-005` 종결로 SSOT 규약 반영 가능.

#### [DB-FAKE-002] 식당OS — 코드 기대 테이블/컬럼과 `schema.sql` 스냅샷 불일치
- **확인 내용**: `DB-DANGER-002`와 동일 축 — 코드가 가정하는 `payments`·`tenants`·`restaurant_order_items` 등이 **동 프로젝트 SQL 스냅샷에 없음**; migration 폴더도 없음.
- **완료 기준**: 운영 인스턴스 대비 단일 기준 — **Forensic**: `DB-CHECK-006` 종결로 drift 허용 범위 기록.

### ❌ DB 미구현·미입증 (PRODUCT 대비, DB-TODO)

#### [DB-TODO-001] `settings_logs` (PRODUCT 6-14, 설정 변경 감사)
- **확인 내용**: `SUP-PARTIAL-003`에서 앱 기록 부재. 워크스페이스 `realmyos`에 해당 테이블을 정의하는 migration 파일 **없음**.
- **Forensic (운영 DB)**: **`settings_logs` 테이블 없음** 확정.
- **완료 기준**: 테이블·앱 기록 또는 PRODUCT에서 제외 명시
- **작업 이력 (2026-05-06)**: 테이블·RLS 포함 migration 파일 추가(미적용) — `supabase/migrations/20260506130000_create_settings_logs.sql` — worklog: [`docs/worklogs/2026-05-06_phase1_db-todo-001-002_migration-files.md`](./worklogs/2026-05-06_phase1_db-todo-001-002_migration-files.md)

#### [DB-TODO-002] `admin_logs` (관리자 활동 감사, `ADM-CHECK-001` 맥락)
- **확인 내용**: 관리자OS 라우트 부재 + migration 부재로 **스키마·기록 강제 미입증**.
- **Forensic (운영 DB)**: **`admin_logs` 테이블 없음** 확정.
- **완료 기준**: PRODUCT §10·CONTEXT와 일치하는 테이블·정책
- **작업 이력 (2026-05-06)**: 테이블·RLS 포함 migration 파일 추가(미적용) — `supabase/migrations/20260506130001_create_admin_logs.sql` — worklog: [`docs/worklogs/2026-05-06_phase1_db-todo-001-002_migration-files.md`](./worklogs/2026-05-06_phase1_db-todo-001-002_migration-files.md)

### ⚠️ DB 부분구현 (재분류)

#### [DB-TODO-003] `tenant_relationships` (PRODUCT §8-6 맥락 — **⚠️ 부분구현으로 재분류**)
- **재분류 사유**: 운영 DB forensic에서 **`tenant_relationships` 테이블 실존** 확인. 과거 “미확인·미구현 ❌” 가정 철회.
- **현재 상태 (⚠️ 부분구현)**: 테이블·기본 연결 데이터 축은 있으나, PRODUCT가 기대하는 **`trust_score`·`signal`(또는 동등 신호 구조)** 는 **스키마·코드 모두 미확인/미구현**.
- **완료 기준**: PRODUCT §8-6 수준의 신뢰도·시그널·앱 연동까지 정합
- **Phase 1 결론 (2026-05-06)**: **방향 B(별도 테이블 신설) 확정**  
  - `tenant_relationships`: **현행 유지** — 관계 요청/연결 “이력” 테이블로 취급  
  - `relationships`: **PRODUCT §8-6의 최종 통합 정의(restaurant↔supplier, rating/memo/signal/trust_score/cooldown 등)** 기준으로 **신설**  
  - `trust_scores`: **CONTEXT `trust_scores` 테이블 정의(tenant 단위 score/level/rates/violation/cooldown)** 기준으로 **신설**  
  - **근거**: PRODUCT는 `relationships`를 별도 테이블로 필드까지 고정 정의하고, CONTEXT는 `trust_scores`를 관리자 레이어의 별도 테이블로 정의함. `tenant_relationships`는 현행 컬럼 축(요청/연결 이력)과 성격이 달라 확장 혼재 위험이 커서 분리 신설이 더 정합적.
- **migration 생성 시점**: **Phase 6(관리자OS, `ADM-TODO-001`) 진입 시** `relationships` + `trust_scores` migration 파일 생성(이번 Phase 1에서는 금지)
- **작업 이력 (2026-05-06)**: GAP 정리 및 방향 B 확정(문서) — worklog: [`docs/worklogs/2026-05-06_phase1_db-todo-003_relationships-direction.md`](./worklogs/2026-05-06_phase1_db-todo-003_relationships-direction.md)
- **작업 이력 (2026-05-07)**: Phase 6에서 `relationships`/`trust_scores` migration 생성 + **운영 DB 적용 완료**(relationships ✅, trust_scores ✅) — worklog: `docs/worklogs/2026-05-07_db-todo-003_relationships-trust-scores.md`

### 🔍 DB 확인 필요 (DB-CHECK)

#### [DB-CHECK-001] `create_payment_atomic` 및 `update_customer_stats` RPC 실제 정의
- **위치**: 코드 참조 `realmyos/src/actions/payment.ts`:68-78, `realmyos/src/actions/order.ts`:431-437
- **확인하지 못한 이유 (과거)**: 저장소 내 `supabase/migrations` 없음.
- **Forensic 상태**: **닫힘** — 운영 DB에서 RPC 객체 존재·본문 확인 완료. `create_payment_atomic`·`update_customer_stats` 정의가 코드 호출과 대응함을 기록.
- **잔여**: RPC **내부 비즈니스 규칙**·fallback 경로(`SUP-DANGER-004`)는 앱 감사 ID에서 계속 추적.
- **이관 출처**: 기존 **[SUP-CHECK-001]** 본문

#### [DB-CHECK-002] (승격 — 구조위험)
- **승격**: 운영 DB forensic 결과 **`[DB-DANGER-004]`**로 이관·**CHECK 종결**. (감사 ID 유지, 의미는 승격 스텁만)
- **이관 출처**: 기존 **[SUP-CHECK-003]**·구 **`DB-CHECK-002`** 본문 → **`DB-DANGER-004`**

#### [DB-CHECK-003] `payments` 테이블 실컬럼(`supplier_name`/`counterparty_name`/§9 `status` 값)과 식당OS 기록값 정합
- **Forensic 상태**: **닫힘** — 정본 DDL 대비 `resturant_os` `rfq.ts`·`money.ts` insert 컬럼 대조 완료. 앱측 혼용(`supplier_name` vs `counterparty_name`) 이슈는 **`RES-PARTIAL-003`**에서 계속.
- **이관 출처**: 기존 **[RES-CHECK-001]** 본문

#### [DB-CHECK-004] `orders`·`payments`·`rfq_requests` RLS — `USING`·테넌트 격리
- **Forensic 상태**: **닫힘 (부분)** — `orders`, `payments`, `rfq_requests` 정책의 **`USING` qual** 기준 **테넌트 격리 실동작** 확인·기록.
- **잔여 (미결)**: 동일 정책들의 **`WITH CHECK`** 가 **NULL**(미설정)인 경우가 있어, INSERT/UPDATE 경로에서의 격리 보장은 **추가 확인 필요** — 별도 스테이징·정책 DDL 재검 필요 시 본 항목에 후속 기록.
- **이관 출처**: 기존 **[RES-CHECK-002]** 본문

#### [DB-CHECK-005] realmyos 운영 DB 스키마의 정본(SSOT)
- **Forensic 상태**: **닫힘** — Supabase 대시보드·프로젝트 기준 **정본(SSOT)** 및 담당 확인 절차 기록 완료.
- **확인 방법 (참고)**: 팀 규약·프로젝트 export·배포 파이프라인

#### [DB-CHECK-006] `resturant_os/supabase/schema.sql`과 실제 연결 인스턴스 동일 여부
- **Forensic 상태**: **닫힘** — 단일 인스턴스 기준 diff 검토 완료, 허용·차이 목록 문서화(로컬 `schema.sql`은 참고 스냅샷으로 유지).

#### [DB-CHECK-007] `etl*` 명명 테이블 7개 — 애플리케이션 코드 참조 여부
- **Forensic 상태**: **닫힘** — 코드베이스에서 아래 7개 테이블명 문자열 참조를 검색했으나(`realmyos/src`, `resturant_os/src`), **참조 0건** 확인.
  - `_etl_order_items`
  - `_etl_orders`
  - `_etl_payments_outgoing`
  - `_etl_restaurants`
  - `_etl_rfq_bids`
  - `_etl_rfq_requests`
  - `_etl_suppliers`
- **판정**: **코드 참조 없음** (현행 앱 코드에서 직접 `.from('…')`로 연결되지 않음)
- **작업 이력 (2026-05-06)**: ETL 테이블 7개 코드 참조 검색 결과 “참조 없음”으로 종결 — worklog: [`docs/worklogs/2026-05-06_phase1_db-check-007-008_code-ref-audit.md`](./worklogs/2026-05-06_phase1_db-check-007-008_code-ref-audit.md)

#### [DB-CHECK-008] `accounts` / `account_purposes` — 코드 연결 여부
- **Forensic 상태**: **닫힘** — `realmyos/src/actions/fund.ts`에서 `accounts`, `account_purposes`를 **직접 조회/쓰기**하는 코드 경로 확인.
  - `account_purposes`: `getAccountPurposes`, `createAccountPurpose` 등에서 `.from('account_purposes')` 사용
  - `accounts`: `getAccounts`, `createAccount` 등에서 `.from('accounts')` 사용
  - 공통: **`tenant_id` 조건 포함** (`.eq('tenant_id', ctx.tenant_id)` / insert 시 `tenant_id` 포함)
- **식당OS(`resturant_os/src`)**: `accounts`, `account_purposes` 문자열/테이블 참조 **0건**
- **PRODUCT §9(자금관리) 정합 메모 (코드 기반)**: PRODUCT `6-12. 자금관리`의 **계좌관리(accounts)** 입력(은행명/계좌번호/별칭/용도/현재 잔액)과 대응되는 필드(`bank_name`, `account_number`, `account_name`, `purpose_id`, `current_balance`)가 `fund.ts`의 `accounts` 조회/생성 경로에서 사용됨.
- **작업 이력 (2026-05-06)**: `accounts`/`account_purposes` 코드 연결 및 PRODUCT 자금관리 정의 대응 확인 — worklog: [`docs/worklogs/2026-05-06_phase1_db-check-007-008_code-ref-audit.md`](./worklogs/2026-05-06_phase1_db-check-007-008_code-ref-audit.md)

---

## [공급자OS] realmyos/src/app/(app)/

### ☠️ 구조위험

#### [SUP-DANGER-001] 주문 생성 시 거래처별 단가 캐시를 라인마다 DB 조회·갱신 (N+1) — **종료 (2026-05-06)**
- **위치**: `realmyos/src/actions/order.ts`:200-243 (`createOrder` 내 `for ... lineRows.entries()`)
- **확인 내용**: 각 주문 라인마다 `customer_product_prices`에 대해 `maybeSingle` 조회 후 `update` 또는 `insert`를 순차 실행함.
- **RULE 위반**: RULE-05 (N+1 쿼리 금지)
- **완료 기준**: 라인 단가 캐시 갱신이 배치 upsert·단일 RPC 등으로 1회(또는 고정 횟수) DB 왕복으로 끝나도록 변경
- **migration 필요**: NO (로직/RPC 우선, 필요 시 RPC만)
- **작업 이력 (2026-05-06)**: `customer_product_prices` 갱신을 라인별 maybeSingle+update/insert(N+1)에서 배치 `upsert(..., { onConflict: 'customer_id,product_id' })` 1회 호출로 교체 — worklog: `docs/worklogs/2026-05-06_sup-danger-001_n1-fix-cache-upsert.md`

#### [SUP-DANGER-002] 주문 라인 RPC 이후 주문 헤더를 별도 `update`로 갱신 — **종료 (2026-05-06)**
- **위치**: `realmyos/src/actions/order.ts`:352-375 (`updateOrder`)
- **확인 내용**: `update_order_lines` RPC 호출 뒤 `orders` 테이블에 대해 별도 `.update(updatePayload)` 실행. 중간 실패 시 헤더·라인 불일치 가능.
- **RULE 위반**: RULE-19 (복수 write 원자성 — 단일 트랜잭션/RPC로 묶이지 않은 순차 write)
- **완료 기준**: 라인+헤더 갱신이 하나의 RPC/트랜잭션으로 원자화되거나, 실패 시 보상 트랜잭션 정의
- **migration 필요**: NO (RPC 설계)
- **작업 이력 (2026-05-06)**: `update_order_lines` RPC에서 라인+헤더 합계 갱신까지 원자화하는 migration 초안 추가(미적용) + `updateOrder`에서 헤더 별도 update 제거 — worklog: [`docs/worklogs/2026-05-06_sup-danger-002_order-lines-atomic.md`](./worklogs/2026-05-06_sup-danger-002_order-lines-atomic.md)
- **작업 이력 (2026-05-06)**: 운영 DB에 5파라미터 버전만 존재 확인 + 3파라미터 구버전 RPC DROP 완료 + migration 파일에 DROP 문 반영 — worklog: `docs/worklogs/2026-05-06_hotfix_sup-danger-002_db-apply.md`

#### [SUP-DANGER-003] 연체금 산식이 PRODUCT·CONTEXT의 연체 정의와 불일치 (회계·대시보드 오류 가능)
- **위치**: `realmyos/src/lib/ledger-calc.ts`:67-82 (`getOverdueReceivable`) 및 호출부 `realmyos/src/actions/ledger.ts`:363 등
- **확인 내용**: `order_date + payment_terms_days`만으로 연체 분을 합산한 뒤, 거래처 전체 입금 합(`totalInboundPaidConfirmed`)을 한 번에 차감함. PRODUCT 6-1·4절의 `due_date`/약속일(`promised_date`)/유예일(`overdue_due_date_grace_days`) 기반 연체금(미수금의 부분집합) 정의와 다름. 연체 집계가 대시보드·수금 우선순위·고객 상태에 사용됨.
- **RULE 위반**: RULE-24 (연체금을 미수금과 동일하게 취급·혼용에 준하는 단순화로 판단; 단일 함수 사용은 하나 정의 자체가 PRODUCT와 GAP)
- **완료 기준**: PRODUCT 정의와 동일한 입력(주문별 미수 잔액, due/promised, settings)으로 연체금만 합산하는 로직으로 교체
- **migration 필요**: 🔍 확인 필요 (주문·수금별 `due_date`/`promised_date` 컬럼·스케줄 테이블 존재 여부는 **`DB-CHECK-005`**·원격 DDL로 확인)
- **메모**: Phase 7으로 이동 — 회계 모델 변경 범위가 크므로 상태 모델 정리(Phase 4) 완료 후 별도 설계 진행 (임의 착수 금지)

#### [SUP-DANGER-004] 수금 저장 RPC 실패 시 fallback 단일 insert로 예치·배분 생략 — **종료 (2026-05-06)**
- **위치**: `realmyos/src/actions/payment.ts`:116-176 (`createPayment` fallback 분기)
- **확인 내용**: 주석에 "deposit 계산 생략, 정합성은 ledger에서"라고 되어 있으나, `deposit_amount: 0` 고정 insert. RPC 경로와 데이터 의미가 달라질 수 있음.
- **RULE 위반**: RULE-25 / RULE-24 (예치금·미수 분리 처리 경로 불일치 가능)
- **완료 기준**: RPC 미구축 환경에서는 수금 등록 자체를 막거나, fallback에서도 `payment_allocations`·`customer_deposits`와 동일한 규칙 적용
- **migration 필요**: NO (코드 fallback 제거, RPC 실패 시 에러 반환)
- **작업 이력 (2026-05-06)**: 운영 DB에 `create_payment_atomic` RPC 실존·본문 확인 후, `createPayment`의 fallback insert를 제거하고 RPC 실패 시 즉시 에러 반환으로 변경 — worklog: `docs/worklogs/2026-05-06_sup-danger-004_payment-fallback-remove.md`
- **작업 이력 (2026-05-06)**: `OrderCreateForm`의 `mode === 'fallback'` dead code(메시지 분기)를 제거해 항상 “수금 완료” 메시지로 단순화 — worklog: `docs/worklogs/2026-05-06_sup-danger-004_payment-fallback-remove.md`

#### [SUP-DANGER-005] 페이지 서버 컴포넌트에서 `customers` 조회 시 `tenant_id` 조건 누락 — **종료 (2026-05-06)**
- **위치**: `realmyos/src/app/(app)/orders/page.tsx`:27-29, `realmyos/src/app/(app)/payments/page.tsx`:25-27
- **확인 내용**: `createSupabaseServer()`로 `.from('customers').select(...).eq('is_buyer', true)...` 만 사용. 코드 상 `tenant_id` 필터 없음.
- **RULE 위반**: RULE-01 (tenant_id 필수)
- **완료 기준**: `getAuthCtx` 기반 `tenant_id`와 일치하도록 쿼리 수정 또는 전용 Server Action으로 일원화
- **migration 필요**: NO
- **작업 이력 (2026-05-06)**: `/orders`, `/payments` 페이지의 `customers` 조회에 `tenant_id` 필터 추가 — worklog: [`docs/worklogs/2026-05-06_sup-danger-005_customers-tenant-fix.md`](./worklogs/2026-05-06_sup-danger-005_customers-tenant-fix.md)

#### [SUP-DANGER-006] 거래처 원장 페이지에서 `action_logs` 조회 시 테넌트 격리 필드 없음 — **종료 (2026-05-06)**
- **위치**: `realmyos/src/app/(app)/customers/[id]/ledger/page.tsx`:32-37
- **확인 내용**: `customer_id`·기간만으로 `action_logs` 조회. `tenant_id` 조건 없음.
- **RULE 위반**: RULE-01
- **완료 기준**: `tenant_id` 또는 서버 액션에서 권한 검증된 조회로 대체
- **migration 필요**: NO
- **작업 이력 (2026-05-06)**: 거래처 원장 페이지의 `action_logs` 조회에 `tenant_id` 필터 추가 — worklog: [`docs/worklogs/2026-05-06_sup-danger-006_action-logs-tenant-fix.md`](./worklogs/2026-05-06_sup-danger-006_action-logs-tenant-fix.md)

### 🚨 가짜구현

#### [SUP-FAKE-001] `getCustomersWithStats` 예외 시 빈 목록을 성공으로 반환 — **종료 (2026-05-06)**
- **위치**: `realmyos/src/actions/ledger.ts`:665-668
- **확인 내용**: `catch`에서 `console.error` 후 `return { success: true, data: [] }` — 호출자는 오류와 빈 거래처를 구분하기 어려움.
- **완료 기준**: 예외 시 `success: false` 또는 명시적 오류 플래그; 로깅만 하고 성공 처리 금지
- **migration 필요**: NO
- **작업 이력 (2026-05-06)**: 예외 시 `success: false`로 실패 반환하도록 수정(성공 위장 제거) — worklog: `docs/worklogs/2026-05-06_phase4_fake-001-fix-silent-fail.md`

_(코드에서 “항상 빈 배열” 고정 반환이 아니라, 오류 시에 한해 성공 위장이므로 가짜구현 기준에 부합한다고 판단.)_

### ⚠️ 부분구현

#### [SUP-PARTIAL-001] 대시보드가 PRODUCT 6-1 레이아웃·블록과 부분 일치
- **위치**: `realmyos/src/app/(app)/dashboard/page.tsx`, `realmyos/src/actions/dashboard.ts`
- **현재 동작 (코드 기준, 2026-05-07)**:
  - 상단: AI 인사이트(`getAiInsight`, context=`d.ai_context`)
  - 별도 박스: “오늘 수금할 거래처” (`getTodayCollections`) — /payments/new 및 /customers/[id]/ledger 링크
  - KPI 4종: 총 미수금/이번달 매출/총 연체금/총 예치금 (카드 클릭 → `/customers`)
  - 2열 섹션: 수금 우선순위 TOP 5(점수 배지), 오늘 할 일(연체 거래처/14일 이상 미연락/미처리 주문), 거래처 매출 TOP5, 상품 매출 TOP5(수량 컬럼 없음), 오늘 자금 계획(계획/이행/미이행 건수 요약)
- **PRODUCT 정의**: 블록 순서·“오늘 행동/알림” 문구, 수금 TOP 지연일·우선순위 점수 컬럼, KPI의 `delivered` 포함 여부, 블록7 `fund_rules` 기반 분배 항목(매입비/부가세 등) 상세, RFQ 미응답 등.
- **GAP (PRODUCT §6-1 대비)**:
  - 블록1 “오늘 행동/알림”(최상단 full width) 부재 — AI 인사이트가 상단을 차지
  - 블록2 TOP5 표 컬럼 불일치(미수금/지연일/우선순위 점수) 및 TOP1~3 “오늘 수금 대상” 강조 UX 없음
  - 블록3 KPI는 PRODUCT의 목적지(`/ledger`, `/analytics`)와 다름 — 현행은 `/customers`로 연결(MVP)
  - 블록4 “오늘 할 일 상세”는 일부만 존재(RFQ 미응답 open+24h 미포함 등)
  - 블록6 상품 매출 TOP5에 **판매 수량 컬럼 없음**
  - 블록7 “오늘 자금 배치 제안”이 fund_rules 분배 제안이 아니라 계획/이행 요약 수준
- **완료 기준**: PRODUCT 6-1 각 블록의 데이터 정의·UX·네비게이션과 일치
- **migration 필요**: 🔍 (RFQ·fund_rules 세부에 따라)
- **세부 항목 분해 (Phase 5)**:
  - **[SUP-PARTIAL-001-A] 블록1 “오늘 행동/알림” 복원** — **종료 (2026-05-07)**
    - 최상단 full width 블록으로 “미수금 총액 알림 + 긴급 액션 메시지” 구성
    - 클릭 이동: `/customers` *(현행 페이지 링크 정책에 맞춰 우선 적용; `/ledger`는 후속 정합에서 조정 가능)*
    - Empty State: 미수금 0이면 “오늘 처리할 수금이 없습니다”
    - migration: 없음
    - **작업 이력 (2026-05-07)**: `fallbackMessage(d.ai_context)` + `total_receivable` 기반 블록1을 대시보드 최상단에 추가 — worklog: `docs/worklogs/2026-05-07_sup-partial-001a_dashboard-block1.md`
  - **[SUP-PARTIAL-001-B] 블록3 KPI 카드 링크 정합** — **종료 (2026-05-07)**
    - KPI 카드 클릭 이동(`/customers`)을 카드 단위로 제공 (MVP)
    - migration: 없음
    - **작업 이력 (2026-05-07)**: KPI 4종을 링크형 카드로 변경 — worklog: `docs/worklogs/2026-05-07_sup-partial-001b_dashboard-kpi-links.md`

  - **[SUP-PARTIAL-001-C] 블록2 TOP5 표 컬럼/강조 UX 정합** — **종료 (2026-05-07, MVP)**
    - 컬럼(미수금/지연일/우선순위 점수) 및 TOP1~3 강조 표시
    - 정렬 기준(우선순위 점수) 고정
    - 버튼: [수금하기]/[원장]
    - migration: 🔍 (지연일/점수 집계가 DB/RPC에 의존할 수 있음)
    - **작업 이력 (2026-05-07)**: TOP5에 근사치 지연일(D+N) 표시 추가 (`days_since_order - payment_terms_days`, \(>0\)만 표시) — worklog: `docs/worklogs/2026-05-07_sup-partial-001c_dashboard-delay-days.md`
  - **[SUP-PARTIAL-001-D] 블록4 “오늘 할 일 상세” 항목 확장**
    - RFQ 미응답(open+24h) 등 PRODUCT 기준 항목 추가 및 UX 정합
    - migration: 없음
    - **작업 이력 (2026-05-07)**: 대시보드 “오늘 할 일”에 RFQ 미응답(24h 초과, status=open) 카운트/링크(`/rfq`) 추가 — worklog: `docs/worklogs/2026-05-07_sup-partial-001d_dashboard-rfq.md`
  - **[SUP-PARTIAL-001-E] 블록7 “오늘 자금 배치 제안” 정합**
    - 총 가용 자금(잔액+TOP3 수금예정) 및 `fund_rules` 기반 분배 항목 노출
    - 잔액 업데이트 상태/버튼 UX 포함
    - migration: 없음
    - **작업 이력 (2026-05-07)**: 대시보드 “오늘 자금 계획”에 fund_transfers(규칙 rule_name 조인) 기반 항목 상세(최대 5개) 표시 추가 — worklog: `docs/worklogs/2026-05-07_sup-partial-001e_dashboard-fund.md`
  - **[SUP-PARTIAL-001-F] 블록6 상품 TOP5 판매수량 컬럼 추가**
    - 거래처 매출 TOP5에 “판매 수량” 컬럼을 포함해 PRODUCT 정의와 정합
    - migration: 없음
    - **작업 이력 (2026-05-07)**: 대시보드 “거래처 매출 TOP 5”에 매출금액 + 판매수량(주문 라인 quantity 합산, RULE-02 런타임 집계) 표시 추가 — worklog: `docs/worklogs/2026-05-07_sup-partial-001f_dashboard-customer-sales-qty.md`
- **산출물 (대조표 캔버스)**: `phase5-sup-partial-001-002-006-gap.canvas.tsx`
- **작업 이력 (2026-05-06)**: PRODUCT 6-1 정독 + 현행 대시보드 블록 대조표 작성 + 공백 항목 분해 등록 — worklog: `docs/worklogs/2026-05-06_phase5_sup-partial-001-002-006-gap.md`
- **작업 이력 (2026-05-07)**: PRODUCT 6-1 재정독 + `dashboard/page.tsx` 블록 매핑(현행 구현/누락) 갱신 — worklog: `docs/worklogs/2026-05-07_sup-partial-001_dashboard-gap-audit.md`

#### [SUP-PARTIAL-002] 견적이 독립 메뉴가 아니라 주문 하위 경로에 존재
- **위치**: `realmyos/src/app/(app)/orders/quotes/` (목록·상세·생성)
- **현재 동작**: `/orders/quotes` 하위에서 견적 CRUD·화면 존재 (코드 목록 확인).
- **PRODUCT 정의**: 6-5 견적관리 — 독립 메뉴(견적목록/등록/견적현황).
- **GAP**: IA(정보 구조) 및 탭(전환 필요/만료 등)이 PRODUCT와 다를 수 있음 — 본 회차에서 `quote` action 전부 미정독.
- **완료 기준**: 메뉴·URL·탭이 PRODUCT 6-5와 일치
- **migration 필요**: NO
- **세부 항목 분해 (Phase 5)**:
  - **[SUP-PARTIAL-002-A] 견적 IA를 독립 메뉴/URL로 승격**
    - `/orders/quotes` → `/quotes`로 이동(라우트/네비게이션)
    - `/quotes`, `/quotes/new`, `/quotes/[id]` 구조로 정렬
    - migration: 없음
  - **[SUP-PARTIAL-002-B] “견적현황” 화면(탭/필터) 구현**
    - 탭: 전체/전환 필요/유효기간 임박/부분 전환/만료
    - 리스트 컬럼/정렬(만료임박순 등) 정합
    - migration: 파일 추가(미적용) — `supabase/migrations/20260507230000_add_quotes_fields.sql`
  - **[SUP-PARTIAL-002-C] 견적 전달(다운로드/공유) + 전송 이력**
    - PDF/JPG 다운로드 및 링크 공유 UX
    - 전송 이력 기록(방식/담당자/시간)
    - migration: 없음 (기존 `quote_logs` 사용)
  - **[SUP-PARTIAL-002-D] 견적→주문 전환 UX 및 상태 전이 정합**
    - 부분 전환(converted_quantity), quote/quote_items 상태 전이
    - 전환율 계산/표시 정합
    - migration: 파일 추가(미적용) — `supabase/migrations/20260507230000_add_quotes_fields.sql`
- **산출물 (대조표 캔버스)**: `phase5-sup-partial-001-002-006-gap.canvas.tsx`
- **작업 이력 (2026-05-06)**: PRODUCT 6-5 정독 + 현행 `/orders/quotes` 구조 대조 + 공백 항목 분해 등록 — worklog: `docs/worklogs/2026-05-06_phase5_sup-partial-001-002-006-gap.md`
- **작업 이력 (2026-05-06)**: `/quotes/*` 독립 라우트 신설 + 구경로(`/orders/quotes/*`) redirect 유지 + 사이드바 독립 메뉴 이동 + revalidatePath 호환 처리 — worklog: `docs/worklogs/2026-05-06_sup-partial-002_quotes-ia.md`
- **작업 이력 (2026-05-08)**: SUP-PARTIAL-002-B/C/D 구현(견적현황 5탭 + 전달/전송이력 + 견적→주문 전환 UX) — worklog: `docs/worklogs/2026-05-07_sup-partial-002bcd_quotes.md`

#### [SUP-PARTIAL-003] 설정 저장 시 `settings_logs` 미연동 (PRODUCT 6-14) — **종료 (2026-05-06)**
- **위치**: `realmyos/src/actions/settings.ts`:55-99 (`saveSettings`)
- **현재 동작**: `settings` upsert만 수행.
- **PRODUCT 정의**: 설정 변경은 `settings_logs` 필수 기록.
- **GAP**: 로그 테이블 기록 코드 없음.
- **완료 기준**: 변경 키별 old/new, 변경자, 시각 기록
- **migration 필요**: YES — `supabase/migrations/20260506130000_create_settings_logs.sql` (운영 DB 적용 완료)
- **작업 이력 (2026-05-06)**: `saveSettings`에서 기존 값 조회 후 upsert, 이후 `settings_logs`에 key별 old/new + changed_by 기록(best-effort) 추가 — worklog: `docs/worklogs/2026-05-06_sup-partial-003_settings-logs.md`

#### [SUP-PARTIAL-004] 결제·수금 상태 명명이 PRODUCT 통합 모델과 불일치 — **종료 (2026-05-06)**
- **위치**: `realmyos/src/actions/payment.ts` (`cancelPayment`), `resturant_os/src/actions/money.ts`, `resturant_os/src/actions/today.ts`
- **현재 동작 (정리 후)**:
  - outbound(식당 지급예정): `pending` → 지급 완료 시 `confirmed`
  - inbound(공급자 수금): `confirmed`, 취소는 `reversed`
- **PRODUCT 정의**: §9 `payments.status` — `pending` / `confirmed` / `reversed`.
- **완료 기준 충족**: 코드·DB status 명칭을 PRODUCT 정의로 통일.
- **migration 필요**: YES — `supabase/migrations/20260506160000_payments_status_add_pending.sql` (CHECK에 `pending` 추가)
- **작업 이력 (2026-05-06)**: `planned/paid/cancelled` 용어를 `pending/confirmed/reversed`로 통일(코드) + 운영 DB CHECK에 `pending` 추가 — worklog: `docs/worklogs/2026-05-06_sup-partial-004_payments-status-unify.md`

#### [SUP-PARTIAL-005] 주문 상태 모델이 PRODUCT 이중 구조와 불일치
- **위치**: `realmyos/src/actions/order.ts` 등 (`draft` / `confirmed` / `cancelled` 중심)
- **현재 동작**: 단일 `status` 컬럼 기반.
- **PRODUCT 정의**: 6-4 주문상태(운영) vs 거래상태(원장) 분리.
- **GAP**: `trade_status`·`order_status` 분리 없음 — 부분 구현.
- **완료 기준**: PRODUCT 6-4와 스키마·화면 정합
- **migration 필요**: 🔍 확인 필요
- **메모**: Phase 7으로 이동 — 주문상태(운영 흐름) 컬럼 추가는 연체 시스템(SUP-DANGER-003)과 함께 설계 필요. 현재 거래상태(draft/confirmed/cancelled)는 DB CHECK와 코드 일치 확인. 임의 착수 금지.

#### [SUP-PARTIAL-006] 자동화영업·매출 화면은 일부만 존재 — **부분완료 (006-A, 006-C 완료 / 006-B, 006-D 미완료)**
- **위치**: `realmyos/src/app/(app)/sales/` — `schedule`, `history`, `scripts`; `sales/page.tsx`는 `/sales/schedule`로 redirect
- **현재 동작 (코드 확인 완료, 2026-05-07)**:
  - 라우트: `/sales/schedule`, `/sales/history`, `/sales/scripts` 존재 (`/sales`는 schedule로 redirect)
  - 스케줄: 캘린더 기반 날짜 선택 + 예약 추가 + 내일로(snooze) + 완료 처리 + 수정/삭제 (client에서 수행)
  - 영업 실행: `QuickActionButton` 모달에서 `contact_logs` 기록 생성 (`createContactLog`) 후 스케줄 done 처리
  - 스크립트: `sales_scripts` 기반 CRUD(기본 스크립트 보호, 타입 필터)
  - 영업이력: `contact_logs` 기반 조회/필터/수정/삭제
  - 대시보드 연결: `TodaySalesWidget`가 `/sales/schedule`로 유도(“오늘 해야 할 영업”)
- **PRODUCT 정의**: 6-13 자동화영업(실행센터·알리고 등).
- **GAP (PRODUCT 대비)**:
  - 메뉴 구조의 4번째 항목인 **실행센터 라우트/UX 부재**
  - 스케줄 화면의 **요약(오늘 해야 할 수/완료/미처리)** 및 **달력↔리스트 뷰 전환** 미구현
  - 메시지 발송은 `message_logs`에 **simulated** 기록만 존재 (알리고 API 연동/성공·실패/재시도/승인 UX 미검증)
  - “어디서든 실행 가능”(거래처목록/주문목록/거래처 상세/실행센터) 요구 중 일부만 구현/연결(대시보드 위젯/거래처 상세는 존재)
  - 영업 성과 연결(영업→주문 전환) 로직/표시가 부분 구현(전환율 계산 함수는 있으나 UX/정의 정합 검증 필요)
- **완료 기준**: PRODUCT 6-13 필수 화면·연동 충족 여부 점검 후 항목 분해
- **migration 필요**: 없음(문서/점검만) — 단, 향후 구현 시 `sales_*`/`message_logs`/`contact_logs` 스키마·RLS 실존 여부는 `DB-*` 절차로 재확인 필요
- **세부 항목 분해 (Phase 5)**:
  - **[SUP-PARTIAL-006-A] 메뉴 구조 4번째 “실행센터” 화면 추가**
    - `/sales` 하위에 실행센터 라우트 신설(예: `/sales/exec`)
    - “지금 연락해야 할 고객 TOP3 + 추천 행동 + 바로 실행 버튼” MVP 구성
    - migration: 🔍 (추천 대상/점수/스케줄 데이터 소스에 따라)
  - **[SUP-PARTIAL-006-B] 영업스케줄 UX(달력/리스트, snooze, 제약) 정합 점검**
    - 달력↔리스트 뷰 전환 미구현
    - snooze(내일로) 삭제 금지 검증 필요
    - 중복 방지(customer_id+date unique) 검증 필요
    - migration: 🔍
    - **작업 이력 (2026-05-07)**: 영업스케줄 상단 요약(오늘할일/완료/미처리) 추가 + 달력↔리스트 뷰 토글 + 리스트 컬럼/즉시 실행/내일로 구현 + 스케줄 취소는 cancelled 처리(물리 삭제 금지) + unique index 소급 migration 추가 — worklog: `docs/worklogs/2026-05-07_sup-partial-006b_schedule-ux.md`
  - **[SUP-PARTIAL-006-C] 메시지 발송(알리고) 경로/로그 정합 점검**
    - message_logs 생성 → API 호출 → sent/failed → contact_logs 자동 기록
    - 사용자 승인 없는 자동 발송 금지 준수
    - migration: 🔍 (로그 테이블/필드 필요 가능)
    - **작업 이력 (2026-05-07)**: 알리고 실제 연동 구현(`sendAligo` Server Action) + SMS/LMS 자동 분기(90바이트) + 설정 화면 알리고 설정/테스트 발송 + 실행센터 실제 발송(확인 모달)로 교체 + D-015 결정 추가 — worklog: `docs/worklogs/2026-05-07_sup-partial-006c_aligo-api.md`
  - **[SUP-PARTIAL-006-D] 영업이력 컬럼/필터/성과 연결 검증**
    - converted_order_id 기반 “영업→주문 전환” 표시/링크
    - outcome_type 기반 next_action_date 자동 계산(서버에서 저장)
    - 주문 confirmed 시 최근 contact_log(7일, 미전환)에 converted_order_id 자동 연결
    - 결과코드/기간/거래처/주문발생 여부 필터 정합
    - migration: YES (소급)
    - **작업 이력 (2026-05-07)**: 영업이력 테이블 컬럼 정합 + 필터(결과/기간/거래처/주문발생) + converted_order_id 링크(/orders/[id]) + next_action_date 서버 자동 계산 + 주문 confirmed 시 영업이력 자동 연결 + converted_order_id 소급 migration 추가 — worklog: `docs/worklogs/2026-05-07_sup-partial-006d_sales-history.md`
- **산출물 (대조표 캔버스)**: `phase5-sup-partial-001-002-006-gap.canvas.tsx`
- **작업 이력 (2026-05-06)**: PRODUCT 6-13 정독 + `sales/` 라우트 확인 + 공백 항목 분해 등록 — worklog: `docs/worklogs/2026-05-06_phase5_sup-partial-001-002-006-gap.md`
- **작업 이력 (2026-05-07)**: PRODUCT 6-13 정독 + `sales/` 라우트·`actions/sales.ts`·대시보드/거래처 연결 확인 + GAP 갱신(분해 유지) — worklog: `docs/worklogs/2026-05-07_sup-partial-006_sales-automation-audit.md`
- **작업 이력 (2026-05-07)**: **[SUP-PARTIAL-006-A]** 실행센터(`/sales/exec`) 구현 + TOP3 점수 기반 추천/실행(스크립트 선택→contact_logs 기록→schedule done) + 사이드바/대시보드 진입점 연결 — worklog: `docs/worklogs/2026-05-07_sup-partial-006a_exec-center.md`

#### [SUP-PARTIAL-007] `console.error` / `console.warn` 및 TODO 주석 잔존 (rules.md RULE-13) — **종료 (2026-05-06)**
- **위치**: 예) `realmyos/src/actions/order.ts`:167,212,235,241,515; `realmyos/src/actions/order.ts`:174 (`// TODO: buyer_tenant_id...`); `realmyos/src/actions/dashboard.ts`:267; `realmyos/src/actions/payment.ts`:83,117,139; `realmyos/src/actions/ledger.ts`:262,529,539,662,667; `realmyos/src/app/(app)/orders/page.tsx`:33; `realmyos/src/app/(app)/payments/page.tsx`:31; `realmyos/src/components/order/OrderCreateForm.tsx`:78
- **현재 동작**: 디버그·성능 로그 및 미연동 안내 TODO가 그대로 포함.
- **PRODUCT 정의**: (직접 정의는 없으나) 저장소 `rules.md` [RULE-13] 완성된 코드만 납품.
- **GAP**: RULE-13과 불일치.
- **완료 기준**: 금지 패턴 제거 또는 프로젝트 허용 정책으로 rules 갱신(승인 필요)
- **migration 필요**: NO
- **작업 이력 (2026-05-06)**: 지정 파일들의 `console.*` 로그를 제거하고, `buyer_tenant_id` TODO는 `SUP-TODO-001`로 이관 — worklog: `docs/worklogs/2026-05-06_sup-partial-007_console-todo-cleanup.md`

### ❌ 미구현

#### [SUP-TODO-001] 발주요청(RFQ) 공급자OS 핵심 흐름 — **완료 (Phase 5 분해 A~E, 2026-05-07)**
- **PRODUCT 정의 위치**: PRODUCT.md §6-2 발주요청 (상태 흐름, 노출 단계, 입찰, 알림)
- **Phase 5 달성 범위**: 공급자OS `/rfq`·노출 RPC·입찰·낙찰/탈락 알림 MVP·계약/후속 **최소 정의 문서화**(001-E). §6-2 **전체** 상태머신(`contract_pending`~`completed`)·양측 동의 UI·주소 공개 게이트·알림 전부·`supplier_bid_viewed` 등은 **미구현 → 후속 페이즈/별 감사 ID**.
- **완료 기준 (원문, 장기)**: 공급자OS에서 RFQ 수신·입찰·상태 전이·알림이 PRODUCT 정의와 동작 → **Phase 5에서는 분해 항목 기준으로 종료**, 장기 기준은 위 잔여에 따름.
- **선행 조건**: CONTEXT Phase 0 — 공통 `orders`/`rfq_*` 테이블·컬럼 실제 상태 확인 (**`DB-CHECK-005`**·**`DB-FAKE-001`** 정리 후)
- **migration 필요**: 🔍 (세부는 A~E 각 항목 참고)
- buyer_tenant_id 미입력 상태 (order.ts 기존 TODO 이관): restaurant-os 연동 확정 후 입력 필요
- **분해 (Phase 5, 문서화)**:
  - **[SUP-TODO-001-A] RFQ 공급자OS 라우트/IA 신설** — **완료 (2026-05-07)**
    - PRODUCT 6-2 “발주요청 목록/상세/내 입찰 상태/입찰하기” 화면을 공급자OS IA로 설계
    - **완료 내용**: `/rfq` 라우트 + 발주요청(오픈 RFQ)·내 입찰 탭 목록, `getSupplierRfqs`·`getMyBids`, Sidebar `발주요청` 메뉴 (상세·입찰 UI는 SUP-TODO-001-C 등 후속)
    - migration: 없음 (운영 `rfq_*`·RLS 확인 후 앱만 반영)
    - **작업 이력 (2026-05-07)**: RFQ 허브 페이지·액션·사이드바 — worklog: `docs/worklogs/2026-05-07_sup-todo-001a_rfq-route.md`
  - **[SUP-TODO-001-B] RFQ 노출 로직(1~3단계) 구현** — **완료 (2026-05-07)**
    - “기존 거래처 → 지역 확장 → 전체 공개” 단계 노출 및 시간 규칙(MVP 고정값)
    - **완료 내용**: 운영 `get_supplier_rfqs` RPC + `getSupplierRfqs()` 연동, `/rfq` 목록에 `expose_level` 배지. 2단계 지역 필터는 미포함(MVP: T2 이후 비거래처 동일 풀).
    - **작업 이력 (2026-05-07)**: RPC migration 초안 — worklog: `docs/worklogs/2026-05-07_sup-todo-001b_rfq-expose-rpc.md`
    - **작업 이력 (2026-05-07)**: 앱 RPC 연동·노출 배지 — worklog: `docs/worklogs/2026-05-07_sup-todo-001b_rfq-expose-logic.md`
    - migration: `20260507010000_create_get_supplier_rfqs.sql` (저장소 기록; 운영 적용은 별도 확인)
  - **[SUP-TODO-001-C] 입찰(공급자 액션) 기본 기능** — **완료 (2026-05-07)**
    - 입력: 가격/납품 가능일(+선택 메모/대체상품)
    - **완료 내용**: `/rfq/[id]` 상세·입찰 폼, `getRfqDetail`·`submitRfqBid`·`getMyBidForRfq`, `tenants.name`→`supplier_name`, RPC로 open·노출 검증, 재입찰 방지(선조회+UNIQUE migration 파일). counter_offer 등 상태 전이는 후속.
    - **작업 이력 (2026-05-07)**: 입찰 UI·액션·제약 migration — worklog: `docs/worklogs/2026-05-07_sup-todo-001c_rfq-bid.md`
    - **작업 이력 (2026-05-07)**: `rfq_bids_rfq_supplier_unique` 운영 DB 적용 완료 — worklog: `docs/worklogs/2026-05-07_sup-todo-001c_rfq-bid.md`
    - migration: `20260507020000_rfq_bids_unique_supplier.sql` (**운영 적용 완료** — `rfq_bids_rfq_supplier_unique`)
  - **[SUP-TODO-001-D] 알림/이벤트(상태 변화 기반) 최소 구현** — **완료 (Phase 5 MVP, 2026-05-07)**
    - 신규/마감임박/낙찰/탈락/계약/결제/주소공개/납품/정산 알림
    - **Phase 5 범위**: 입찰 **낙찰/탈락** 시 `notifications` INSERT(식당OS 발주 확정 후), 공급자OS `/rfq` **목록·미읽음 배지·읽음 처리**. 그 외 알림·이벤트는 후속.
    - supplier_bid_viewed 이벤트 정의 및 기록
    - **작업 이력 (2026-05-07)**: RFQ 입찰 결과 알림 + 목록 UI — worklog: `docs/worklogs/2026-05-07_sup-todo-001d_rfq-notifications.md`
    - migration: 없음 (기존 `notifications` 스키마 사용)
  - **[SUP-TODO-001-E] 계약(contract_pending) 및 후속 흐름 분리** — **완료 (2026-05-07, 문서만)**
    - 계약서 자동 생성/양측 동의/paid 이후 주소 공개 등 후속 단계는 별 분리(Phase 5에서 최소 기능 정의)
    - **완료 내용**: PRODUCT §6-2 **계약 생성 흐름(MVP)**·상태 흐름(`selected`→`contract_pending`→양측 동의→`paid`→`address_revealed`…)·알림 표와 대조하여 **현재 구현 가능한 것 / 별도 설계·스키마·RPC 필요한 것**을 `tasks.md`·worklog에 정리. 코드·migration 없음.
    - **작업 이력 (2026-05-07)**: 계약·후속 최소 정의 문서화 — worklog: `docs/worklogs/2026-05-07_sup-todo-001e_rfq-contract.md`
    - migration: 없음 (이번 턴). 후속 구현 시 `contracts`·RFQ 상태 확장·결제/주소 게이트 RPC 등 검토
- **작업 이력 (2026-05-06)**: PRODUCT 6-2 정독 + 공급자OS 라우트 부재 확인 + RFQ 핵심 흐름 분해 등록 — worklog: `docs/worklogs/2026-05-06_phase5_sup-todo-001-005-gap.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-001-A 구현(`/rfq`, 액션, Sidebar) — worklog: `docs/worklogs/2026-05-07_sup-todo-001a_rfq-route.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-001-B RPC migration 초안(`get_supplier_rfqs`) — worklog: `docs/worklogs/2026-05-07_sup-todo-001b_rfq-expose-rpc.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-001-B 앱 연동·노출 배지 — worklog: `docs/worklogs/2026-05-07_sup-todo-001b_rfq-expose-logic.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-001-C RFQ 입찰·상세·UNIQUE migration — worklog: `docs/worklogs/2026-05-07_sup-todo-001c_rfq-bid.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-001-C `rfq_bids_rfq_supplier_unique` 운영 적용 — worklog: `docs/worklogs/2026-05-07_sup-todo-001c_rfq-bid.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-001-D RFQ 낙찰/탈락 알림(MVP) — worklog: `docs/worklogs/2026-05-07_sup-todo-001d_rfq-notifications.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-001-E 계약·후속 흐름 문서화 — worklog: `docs/worklogs/2026-05-07_sup-todo-001e_rfq-contract.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-001 Phase 5 분해(A~E) 종료 — worklog: `docs/worklogs/2026-05-07_sup-todo-001e_rfq-contract.md`

#### [SUP-TODO-002] 지급관리(매입처 지급)
- **PRODUCT 정의 위치**: PRODUCT.md §6-9 지급관리
- **완료 기준**: `direction=outbound` 지급 목록·등록·분배·상세
- **선행 조건**: payments 모델 정렬(CONTEXT Phase 1~3)
- **migration 필요**: `purchases`·`payment_allocations` **운영 적용 완료 (2026-05-07)** — 저장소 SQL은 FK·RLS `WITH CHECK`까지 반영
- **분해 (Phase 5, 문서화)**:
  - **[SUP-TODO-002-A] 지급 IA/라우트 신설** — **완료 (2026-05-07)**
    - PRODUCT 6-9: 지급목록/지급등록/지급상세(`/disbursements/[id]`) 화면 구조 반영
    - `/disbursements` 목록 + `getDisbursementList`(outbound, `payer_tenant_id` 또는 레거시 `tenant_id`, RULE-01) + Sidebar 지급관리
    - 지급 상세·취소(002-D) 잔여; 등록·분배(002-C) MVP 완료 (002-B는 SSOT 확인만)
    - migration: 없음 (조회만)
  - **[SUP-TODO-002-B] 지급 데이터 모델 정합(SSOT payments)** — **완료 (2026-05-07, 문서만)**
    - PRODUCT §9 status(`pending`/`confirmed`/`reversed`)와 **운영 DB `payments_status_check` 일치** 확인
    - 운영 `pg_get_constraintdef`: `deposit_amount >= 0`, `payment_method` enum, `status IN (pending, confirmed, reversed)`
    - 샘플 분포: inbound `confirmed`만 관측, **outbound 행 없음** → status 백필·migration **불필요**(본 작업 범위)
    - `payment_allocations`·`reference_id`·§9 컬럼명(`buyer_tenant_id` 등) 전면 정합은 SUP-TODO-005·후속 과제
    - migration: 없음 (본 ID)
  - **[SUP-TODO-002-C] 지급 분배(allocations) UX/로직** — **완료 (2026-05-07, Phase 5 MVP)**
    - “미지급 매입 목록 표시 → 분배 저장” 흐름
    - 미지급금=총매입-총지급(계산) 원칙 준수(집계·상세 원장은 002-D·003-D)
    - `/disbursements/new` + `createDisbursement` → `create_disbursement_with_allocations` RPC(RULE-19)
    - **migration·RPC 운영 적용 완료 (2026-05-07)**: `20260507050000_create_disbursement_with_allocations.sql` — `create_disbursement_with_allocations`(SECURITY DEFINER, `purchases`/`payments` FK 연동 `payment_allocations`, RLS·WITH CHECK는 기존 테이블 정책과 동일 축)
  - **[SUP-TODO-002-D] 지급 취소(reversed) 및 이력** — **완료 (2026-05-07)**
    - 물리 삭제 금지(RULE-10): `payments.status='reversed'`만, `payment_allocations` 보존
    - `purchases.status` 자동 재계산(`paid`/`partial`/`unpaid`) — `pending`/`confirmed` 분배만 합산
    - `cancelDisbursement` 액션 + `/disbursements` 목록 “취소” 버튼; 별도 이력 테이블 없음
    - migration: **운영 적용 완료** — `20260507060000_create_reverse_disbursement.sql` (RULE-19 RPC)
- **작업 이력 (2026-05-06)**: PRODUCT 6-9 정독 + 지급 라우트 부재 확인 + 세부 분해 등록 — worklog: `docs/worklogs/2026-05-06_phase5_sup-todo-001-005-gap.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-002-A `/disbursements` 목록·액션·Sidebar — worklog: `docs/worklogs/2026-05-07_sup-todo-002a_disbursements-route.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-002-B payments 모델·CHECK·데이터 분포 확인(문서) — worklog: `docs/worklogs/2026-05-07_sup-todo-002b_payments-model-check.md`
- **작업 이력 (2026-05-07)**: `purchases`·`payment_allocations` migration 운영 적용 + 저장소 DDL 정합(FK·`WITH CHECK`) — worklog: `docs/worklogs/2026-05-07_sup-todo-002c-003_purchases-migration.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-002-C·003-A 매입/지급분배 UI + `create_disbursement_with_allocations` migration 초안 — worklog: `docs/worklogs/2026-05-07_sup-todo-002c-003a_purchases-disburse-ui.md`
- **작업 이력 (2026-05-07)**: `create_disbursement_with_allocations` RPC **운영 DB 적용 완료**(`pg_get_function_arguments` 확인) — worklog: `docs/worklogs/2026-05-07_sup-todo-002c-003a_purchases-disburse-ui.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-002-D `reverse_disbursement` RPC + `cancelDisbursement`·취소 UI — worklog: `docs/worklogs/2026-05-07_sup-todo-002d_disbursement-cancel.md`

#### [SUP-TODO-003] 매입관리 메뉴·흐름
- **PRODUCT 정의 위치**: PRODUCT.md §6-7 매입관리
- **완료 기준**: 매입 내역·등록·원장 연동
- **선행 조건**: `fulfillment_type`·재고·자동 매입 로직과 스키마 정합 · **`public.purchases` 테이블 생성(운영 적용 2026-05-07)으로 원장 스키마 선행 충족** — UI·로직은 A~D 잔여
- **migration 필요**: `purchases` **적용됨**; 세부 컬럼·트리거는 🔍
- **분해 (Phase 5, 문서화)**:
  - **[SUP-TODO-003-A] 매입 IA/라우트 신설** — **완료 (2026-05-07)**
    - PRODUCT 6-7: 매입내역(메인)/매입등록 화면 및 상세 이동
    - `/purchases`·`/purchases/new` + `getPurchaseList`·`createPurchase`·`getUnpaidPurchases` + Sidebar 매입관리
    - **DB 적용**: `purchases`·`payment_allocations` DDL **적용됨** (`20260507030000`, `20260507040000`); 지급 분배와의 연동 RPC **`create_disbursement_with_allocations` 운영 적용 완료** (`20260507050000`)
  - **[SUP-TODO-003-B] 상품↔매입처 매핑(default_supplier_id) 정합** — **완료 (2026-05-07, 문서만)**
    - **운영 DB 확인**: `products.default_supplier_id` **존재** ✅ — migration **불필요**
    - 구현 방향(잔여 작업): 매입 등록 시 상품 선택 → `default_supplier_id`로 `customers` 조회해 `counterparty_name`(필요 시 `supplier_tenant_id`) **자동 채움**, 텍스트 직접 입력 금지(PRODUCT 6-7)
    - migration: 없음 (UI/액션 후속 ID에서 처리)
  - **[SUP-TODO-003-C] 자동 매입 생성(재고/위탁) 로직 분리** — **완료 (2026-05-07, 문서만 — Phase 7 이후로 보류)**
    - **SSOT 확정**: `products.procurement_type` (`stock` / `consignment`) 가 **운영 SSOT**; `products.fulfillment_type` 없음 → `fulfillment_type`은 `order_lines` 측 컬럼만 유지(앱은 `defaultFulfillment(procurement_type)` 매핑)
    - **재고 컬럼 부재**: `products.stock_qty` **없음** → 현재 자동 매입 생성 **불가**(재고 차감/임계치 트리거 불가)
    - 결정: **수동 매입 등록만 지원**(현재 `/purchases/new`)으로 두고, **자동 매입 생성·재고는 Phase 7 이후**(별도 ID로 분리, 재고 모델 설계 동반)
    - migration: 없음 (Phase 7 설계 시 재검토)
  - **[SUP-TODO-003-D] 매입 원장(매입+지급) 연동** — **완료 (2026-05-07, 문서만)**
    - 매입 원장 = `purchases` + `payment_allocations` 집계 — 미지급금 = `total_amount − Σ allocated_amount`(부모 `payments.status IN ('pending','confirmed')`만), `purchases.status`는 002-D RPC가 `paid`/`partial`/`unpaid` 자동 반영
    - 잔여 작업: `getPurchaseList`(또는 별도 액션)에 **지급 합계·잔액 컬럼** 추가, `/ledger`에서 매입원장 진입(SUP-TODO-004와 정합)
    - migration: 없음 (조회·집계만)
- **작업 이력 (2026-05-06)**: PRODUCT 6-7 정독 + 매입 라우트 부재 확인 + 세부 분해 등록 — worklog: `docs/worklogs/2026-05-06_phase5_sup-todo-001-005-gap.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-003-A `/purchases`·매입 액션·Sidebar — worklog: `docs/worklogs/2026-05-07_sup-todo-002c-003a_purchases-disburse-ui.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-003-A 연동 — `create_disbursement_with_allocations` RPC 운영 적용 완료 — worklog: `docs/worklogs/2026-05-07_sup-todo-002c-003a_purchases-disburse-ui.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-003-B/C/D 매입관리 감사 — `default_supplier_id` 존재·`procurement_type` SSOT·`stock_qty` 부재·자동 매입 Phase 7+ — worklog: `docs/worklogs/2026-05-07_sup-todo-003b-c-d_purchase-audit.md`

#### [SUP-TODO-004] 원장관리 단독 `/ledger`·매출분석 `/analytics` (이전 tasks에도 미완)
- **PRODUCT 정의 위치**: §6-10 원장관리, §6-11 매출분석
- **완료 기준**: 거래처 원장은 `/customers/[id]/ledger` 수준을 넘어 플랫폼 정의 전체 충족(기간·세금계산서 기준 등); 매출분석 탭·차트
- **선행 조건**: 집계 쿼리·`order_lines` 스냅샷 기준 통일
- **migration 필요**: NO (우선 화면·쿼리)
- **분해 (Phase 5, 문서화)**:
  - **[SUP-TODO-004-A] `/ledger` 진입점(원장관리 메뉴) 신설** — **완료 (2026-05-07)**
    - `/ledger` 신설: 매출원장·매입원장 탭, 기간 필터(URL `from`/`to`), 거래처 선택 → `/customers/[id]/ledger` 이동, 매입처 셀렉트(`purchases.counterparty_name DISTINCT`)
    - Sidebar 원장관리 링크 `/sales/history` → `/ledger` 교체
    - 매입원장 상세 표·세금/누적 로직은 SUP-TODO-004-B
    - migration: NO (조회/화면만)
  - **[SUP-TODO-004-B] 원장 컬럼/색상/기초잔액/세금 로직 정합** — **완료 (2026-05-07, B-1 범위)**
    - 컬럼 정합: `날짜 / 유형 / 상품명 / 공급가 / 부가세 / 합계 / 결제수단 / 잔액` — 기존 `주문금액`·`수금액` 분리 → `합계` 단일 컬럼으로 통합(수금은 음수 표기, 결제수단은 별도 컬럼)
    - **기초잔액 항상 표시**(0원 포함) — `summary.opening_balance !== 0` 조건 제거
    - **기간 필터** 추가: URL `from`/`to` 파라미터(기본: 이번달 1일 ~ 오늘) — `getCustomerLedger(customer_id, { from, to, payment_method })` 시그니처 확장으로 `orders.order_date`·`payments.payment_date`에 `gte`/`lte` 적용
    - **결제수단 필터** 추가: URL `payment_method`(transfer/cash/card/platform) — `payments` 단계에 `eq` 적용(orders는 미적용)
    - 호출부 점검: 호출처 1곳(`/customers/[id]/ledger/page.tsx`)뿐, 옵셔널 인자라 타입 호환 — `npx tsc --noEmit` 통과
    - **B-2 별도 분리**(아래 [SUP-TODO-004-B-2]): 카드 제외/혼합 결제 분리 세금계산서 로직, 세금 요약 영역, 매입원장 별도 페이지
    - migration: NO (조회·UI만)
  - **[SUP-TODO-004-B-2] 세금계산서/세금 요약/매입원장 별도 페이지** — **부분완료 (2026-05-07, MVP)**
    - MVP(수금 기준) 세금계산서 요약 추가:
      - 과세 대상: `cash` + `transfer`
      - 제외: `card`
      - `tax_summary`: `taxable_paid` / `card_paid` / `invoice_amount(=taxable_paid)` (RULE-02: 런타임 계산만)
    - 매입원장 전용 페이지는 후속(별도 라우트/상세 표)로 유지
    - migration: NO
    - **작업 이력 (2026-05-07)**: 원장 세금계산서 요약(MVP, 수금 기준) 추가 — worklog: `docs/worklogs/2026-05-07_sup-todo-004b2_tax-invoice.md`
  - **[SUP-TODO-004-C] `/analytics`(매출분석) 라우트 신설** — **완료 (2026-05-07)**
    - `/analytics` 라우트 신설: 4개 탭(매출현황·마진분석·거래처분석·위험신호) + 공통 기간 필터(URL `from`/`to`/`preset`) + 정렬(URL `sort`)
    - **데이터 SSOT**: `order_lines` 스냅샷만 사용(`product` 테이블 미참조) — `lineMargin`·`aggregateByDate/Product/Customer` 메모리 집계(RULE-02·RULE-03)
    - **탭 1 매출현황**: 총매출/원가/마진/마진율 + 전기간(동일 길이) 대비 변화율 + 일자별 표·CSS 막대(Recharts 미도입)
    - **탭 2 마진분석**: 상품별 매출/원가/마진/마진율/**마진 기여도(=상품마진/전체마진)** + 정렬(마진/기여도/수량) + 상위 5개 매출 비중
    - **탭 3 거래처분석**: 거래처별 매출/원가/마진/마진율/비중/순위/**성장률(전기간 대비)** + 정렬(매출/마진/성장률) + KPI 4종(상위3 비중·평균결제기간 근사·미수금 비율·반복구매율)
    - **탭 4 위험신호**: 5종 — ① 매출 감소(-20%↑) ② 낮은 마진(`< settings.margin_warning_threshold`) ③ 손해 상품(<0) ④ 매출 TOP10 ∩ 마진율 하위 50% ⑤ 반품/매출 ≥ 5%
    - **사이드바**: `매출분석` 링크 `/sales` → `/analytics`
    - 차트 라이브러리/출력/평균결제기간 정확 정의는 아래 분리 ID
    - migration: NO
  - **[SUP-TODO-004-C-2] 차트 라이브러리(라인차트) 도입** — **완료 (2026-05-07)**
    - PRODUCT §6-11 라인차트 요구에 맞춰 `recharts` 도입
    - `OverviewTab`의 “일자별 매출/원가/마진”을 `LineChart`(3개 라인)로 교체하고, 기존 CSS 막대 시각화는 제거
    - migration: NO
    - **작업 이력 (2026-05-07)**: `recharts` 설치 + `OverviewTab` 라인차트 적용 — worklog: `docs/worklogs/2026-05-07_sup-todo-004c2_recharts.md`
  - **[SUP-TODO-004-C-3] 분석 결과 출력(엑셀/PDF/JPG)** — **완료 (2026-05-07, 엑셀만)**
    - analytics 화면 상단에 “엑셀 다운로드” 버튼 추가(클라이언트 다운로드)
    - 탭별 Server Action 재조회 후, 탭별 시트 구성으로 `.xlsx` 생성
    - 범위 제외: PDF/JPG (복잡도 높아 후속 분리)
    - migration: NO
    - **작업 이력 (2026-05-07)**: `xlsx` 도입 + 탭별 엑셀 다운로드 구현 — worklog: `docs/worklogs/2026-05-07_sup-todo-004c3_excel-export.md`
  - **[SUP-TODO-004-C-4] 평균 결제기간 정확 정의** — **완료 (2026-05-07)**
    - `collection_allocations`(inbound payment ↔ orders 매핑) 기반으로 평균결제기간을 계산하도록 교체
    - 데이터가 없으면 기존 근사치(마지막 수금일 - 마지막 주문일)로 fallback 유지
    - migration: NO (DB 적용은 운영에서 완료됨)
    - **작업 이력 (2026-05-07)**: FIFO 수금 배분 자동화 + 평균결제기간 정확 계산 연동 — worklog: `docs/worklogs/2026-05-07_collection-allocations-fifo.md`
- **작업 이력 (2026-05-06)**: PRODUCT 6-10/6-11 정독 + `/ledger`/`/analytics` 라우트 부재 확인 + 세부 분해 등록 — worklog: `docs/worklogs/2026-05-06_phase5_sup-todo-001-005-gap.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-004-A `/ledger` 진입점·매출/매입 탭·기간 필터·Sidebar 교체 — worklog: `docs/worklogs/2026-05-07_sup-todo-004a_ledger-hub.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-004-B(B-1) 컬럼 정합·기초잔액 항상 표시·기간/결제수단 필터; B-2 신규 분리 — worklog: `docs/worklogs/2026-05-07_sup-todo-004b_ledger-columns.md`
- **작업 이력 (2026-05-07)**: 거래처 원장(`/customers/[id]/ledger`)을 돈 흐름 콘솔로 재설계(테이블 제거, 날짜 그룹 sticky/subtotal, URL 즉시 필터, KPI hierarchy) — worklog: `docs/worklogs/2026-05-07_ledger-money-flow-console.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-004-C `/analytics` 4탭 신설(`order_lines` 스냅샷 SSOT, RULE-02·03 준수); 차트(C-2)·출력(C-3)·평균결제기간 정확 정의(C-4) 신규 분리 — worklog: `docs/worklogs/2026-05-07_sup-todo-004c_analytics.md`

### [CONVENTION] 반품(환불) 처리 규약 — **확정 (2026-05-07)**
- **운영 DB 사실**: `orders.order_type`는 `sale` / `purchase`만 존재 (`refund` 없음, 타입은 USER-DEFINED)
- **확정 규약**: **반품/환불은 `order_type`이 아니라 `order_lines.line_total < 0`(음수 금액)로 표현**한다. (`order_type`은 `sale`/NULL 유지)
- **영향 범위**: 매출분석 위험신호의 “반품/매출 비율” 계산은 `order_type='refund'` 가정 금지
- **작업 이력 (2026-05-07)**: `analytics.ts`의 반품 집계를 음수 `line_total` 기반으로 교체 — worklog: `docs/worklogs/2026-05-07_refund-convention-fix.md`

### [OPS] 주문 취소 시 수금 배분 void 처리 — **완료 (2026-05-07)**
- **요약**: 취소된 주문에 배분된 수금(`collection_allocations`)을 물리 삭제하지 않고 `voided`로 전환해, 평균결제기간/원장 계산에서 제외한다.
- **DB 적용 완료 (2026-05-07)**:
  - `collection_allocations`에 `status(active/voided)`, `voided_at`, `voided_reason` 추가 ✅
  - `cancel_order_and_void_allocations(p_tenant_id, p_order_id)` RPC 생성 ✅
- **앱 반영 (2026-05-07)**:
  - `cancelOrder`는 단일 RPC로 “주문 취소 + 배분 void” 처리 (RULE-19)
  - 평균결제기간 계산은 `collection_allocations.status='active'`만 집계
- **worklog**: `docs/worklogs/2026-05-07_order-cancel-void-allocations.md`

#### [SUP-TODO-005] 플랫폼 결제·정산(식당↔공급자 단일 payments) 완성
- **PRODUCT 정의 위치**: §3 돈 흐름, §9 payments
- **완료 기준**: restaurant-os·공급자OS·관리자OS 간 결제 상태·정산 정의와 코드 일치(CONTEXT 로드맵)
- **선행 조건**: CONTEXT [ARCH-08] Phase 0~5
- **migration 필요**: YES
- **분해 (Phase 5, 문서화)**:
  - **[SUP-TODO-005-A] SSOT payments 모델(§9) 기준 재정렬** — **Phase 6+ 보류 (선행 조건 미충족)**
    - 필드: buyer_tenant_id/seller_tenant_id/direction/status/type/payment_method/due_date/reference_id 등
    - 상태: pending/confirmed/reversed, 물리 삭제 금지 원칙
    - **착수 금지 사유**: CONTEXT [ARCH-08] Phase 0~5 완료(특히 관리자OS·트러스트 모델 정합) 전에는 SSOT 재정렬 시도가 양 OS에 호환 깨짐 위험
    - migration: 🔍 (현 운영 DDL/제약과의 diff 필요)
  - **[SUP-TODO-005-B] 플랫폼 정산(settlement) 타입 정의 및 흐름** — **Phase 6+ 보류 (선행 조건 미충족)**
    - payments.type='settlement'을 포함한 정산 흐름(식당↔공급자↔플랫폼) 정의를 CONTEXT와 함께 구체화
    - **착수 금지 사유**: 관리자OS(`ADM-TODO-001`)·`relationships`/`trust_scores`(Phase 6 migration) 미존재 상태에서는 정산 주체/대상 정의가 불완전
    - migration: 🔍
  - **[SUP-TODO-005-C] 시스템간 상태 이벤트 전달(트랜잭션 결과 기반)** — **Phase 6+ 보류 (선행 조건 미충족)**
    - 상태 변화(pending→confirmed, confirmed→reversed)가 “이벤트의 원인”이 되도록 정렬
    - 식당OS(outbound) ↔ 공급자OS(inbound) 관점 일치
    - **착수 금지 사유**: trigger/webhook/realtime 설계는 SSOT(005-A) 완료 후 진행. 현재 두 OS는 `or(seller_tenant_id, tenant_id)`·`or(payee_tenant_id, tenant_id)` 병행 패턴으로 단방향 동작 중
    - migration: 🔍 (trigger/webhook/realtime 설계 필요)
  - **[SUP-TODO-005-D] 선행 조건 명시(구현 착수 금지)** — **완료 (2026-05-07, 문서)**
    - CONTEXT [ARCH-08] Phase 0~5 완료 전에는 구현 착수 금지 — **재확인**
    - Phase 5에서는 문서/분해까지만 유지 — **본 항목으로 005 분해 종료, A/B/C는 Phase 6+로 이월**
    - 진입 게이트 명시 (Phase 6 시작 전 재검):
      1) 관리자OS(`ADM-TODO-001`) 라우트·접근 제어 존재
      2) `relationships`·`trust_scores` migration 적용
      3) 운영 `payments` DDL과 PRODUCT §9 SSOT diff 결과 정리(`SUP-TODO-005-A` 사전 산출)
    - migration: 없음
- **작업 이력 (2026-05-06)**: PRODUCT §9 SSOT payments 정의 확인 + 현행 라우트/모델 단편화 전제 정리 + 세부 분해 등록 — worklog: `docs/worklogs/2026-05-06_phase5_sup-todo-001-005-gap.md`
- **작업 이력 (2026-05-07)**: SUP-TODO-005-D 선행 조건 게이트 명시 + A/B/C Phase 6+ 보류 처리 — worklog: `docs/worklogs/2026-05-07_session-summary.md`

---

### ❌ PRODUCT 정의 대비 미반영 (SUP-MISSING)

#### [SUP-MISSING-001] 거래처 분류 시스템 미구현
- **PRODUCT 정의 위치**: PRODUCT §6-3 거래처관리 — **분류 시스템**
- **요구사항(요약)**:
  - Category/Value 구조의 분류 시스템
  - 기본 분류 예시:
    - 고객유형 / 식식이회원여부 / 식식이OS / 관리등급 / 유입경로 / 업종 / 역할
  - 분류는 **자동화영업 트리거 조건**으로 연결됨  
    (예: 관리등급=정기관리 → 7일마다 메시지 등)
  - **분류 변경 이력 기록 필수**
  - **물리 삭제 금지**: `is_active=false` 등 소프트 비활성화
- **현행 상태(코드 기준)**: 거래처 분류 Category/Value 구조 및 변경 이력 시스템이 앱/DB에 명시적으로 구현되어 있지 않음
- **migration 필요**: YES  
  - `customers` 테이블에 분류 관련 컬럼 추가 **또는**
  - `customer_tags`(또는 동등) 테이블 신설 + 이력 테이블/로그 연동
- **migration**: `customer_tags`/`customer_tag_logs` 테이블 신설 (**적용 완료** ✅)
- **작업 이력 (2026-05-07)**: 분류 CRUD 액션 + 거래처 상세 “분류” 섹션 연결(물리 삭제 금지, 변경 이력 기록) — worklog: `docs/worklogs/2026-05-07_sup-missing-001_customer-tags.md`
- **작업 이력 (2026-05-07)**: `customer_tag_options` 기반 동적 분류(하드코딩 제거) + 분류 관리 화면(`/settings/tags`) + 등록 폼에서 분류 필드 제거(PRODUCT §6-3 정합) — worklog: `docs/worklogs/2026-05-07_customer-form-tags-refactor.md`

#### [SUP-MISSING-002] 거래처 등록 필드 누락 (PRODUCT §6-3 확정 필드)
- **PRODUCT 정의 위치**: PRODUCT §6-3 거래처등록 — 확정 필드
- **누락/불충분 가능성이 있는 필드(요약)**:
  - 고객유형(사업자/개인/예비)
  - 최초미수금 `opening_balance` + 기준일
  - 결제조건(즉시/말일/매월N일/N일후)
  - 목표월매출 / 목표 객단가
  - 역할(매출처/매입처/둘다)
  - 업종 / 관리등급 / 유입경로
  - `contact_status` (예: `unknown/safe_number/connected/converte...` — 원문 요구사항에 따라 상태 정의 확정 필요)
- **현행 상태(코드 기준)**: `createCustomer`/거래처 입력 UI가 PRODUCT §6-3 확정 필드를 전부 강제/수집/저장/표시하는 구조로 정리되어 있지 않음
- **migration 필요**: YES — `customers` 누락 컬럼 추가 (**적용 완료** ✅)
- **작업 이력 (2026-05-07)**: `payment_terms`/`role`/`contact_status` 컬럼 추가 + 거래처 등록 폼 “거래 설정” 섹션에 선택 입력 연결 — worklog: `docs/worklogs/2026-05-07_sup-missing-002_customer-fields.md`

#### [SUP-MISSING-003] 상품 등록 필드 누락 (PRODUCT §6-6 확정 필드)
- **PRODUCT 정의 위치**: PRODUCT §6-6 상품관리 — 확정 필드
- **현재 누락(요약)**:
  - 원재료명 및 함량 (선택 입력)
  - 품목보고번호 (선택 입력)
- **중요성**: 상품 인텔리전스 기반 학습(제품 속성/규제/원재료) 데이터로 필요
- **migration 필요**: YES — `products` 테이블 컬럼 추가 (**적용 완료** ✅)
- **작업 이력 (2026-05-07)**: `ingredients`/`item_report_number` 컬럼 추가 + 상품 등록 폼 선택 입력 섹션 연결 — worklog: `docs/worklogs/2026-05-07_sup-missing-003_product-fields.md`

#### [SUP-MISSING-004] 자동화영업 분류 기반 트리거 미구현 (PRODUCT §6-13)
- **PRODUCT 정의 위치**: PRODUCT §6-13 자동화영업
- **요구사항(요약)**: 분류 기반 자동 트리거(예시)
  - 관리등급=정기관리 → 7일마다 메시지
  - 관리등급=방치 → 30일마다 메시지
  - 유입경로=쿠팡 + `contact_status=safe_number` → 24시간 내 응답 유도
- **선행 조건**: **`SUP-MISSING-001` 완료 후**(분류 시스템 SSOT 확정/저장 가능해야 함)
- **현행 상태(코드 기준)**: 분류 기반 자동 트리거/스케줄러가 시스템적으로 구현되어 있지 않음
- **migration 필요**: 🔍 (트리거 로그/스케줄/템플릿/발송 이력 테이블 필요 가능)
- **작업 이력 (2026-05-07)**: 분류 기반 트리거 체크 액션 추가 + 영업스케줄(sales_schedules) 자동 생성(중복 방지) + /sales/schedule에서 트리거 사유 표시 및 수동 실행 버튼 제공(자동 발송 금지) — worklog: `docs/worklogs/2026-05-07_sup-missing-004_sales-trigger.md`

#### [SUP-MISSING-005] `getCustomersWithScore`에 `last_payment_date` 누락 (우선순위 높음)
- **문제**: Customers 운영 row list에서 “마지막 수금 D+N” 표시 불가 (현재는 대체값으로 표시 중)
- **요구사항**: `getCustomersWithScore` 반환에 아래 중 하나 추가
  - `last_payment_date` **또는**
  - `days_since_payment`
- **migration 필요**: NO — 쿼리/집계 수정으로 해결 가능

#### [SUP-MISSING-006] 수금 주문 분배 UI 미구현 (PRODUCT §6-8)
- **PRODUCT 정의 위치**: PRODUCT §6-8 수금관리
- **GAP(요약)**:
  - 수금 등록 후 **[주문에 분배]** 버튼/흐름 부재
  - `payment_allocations` 수동 분배 UI 없음
  - `collection_allocations`(FIFO/RPC) 구현은 있으나 **UI 연결 없음**
- **migration 필요**: NO (UI 구현만)
- **작업 이력 (2026-05-07)**: 수금 상세(`/payments/[id]`) 신설 + FIFO 배분 버튼 + 주문별 수동 “추가 배분” UI + 배분 내역/미배분 표시 + `collection_allocations`(active/voided) 연동 — worklog: `docs/worklogs/2026-05-07_sup-missing-006_payment-allocation-ui.md`

#### [SUP-MISSING-007] 예치금 시스템 미구현 (PRODUCT §6-8)
- **PRODUCT 정의 위치**: PRODUCT §6-8 수금관리
- **GAP(요약)**:
  - `customer_deposits` 테이블 없음
  - 수금 초과분 예치금 처리 없음
  - `deposit_logs` 없음
  - 예치금은 **부채(회계) 개념**으로 필수
- **migration 필요**: YES
  - `customer_deposits` 테이블 신설
  - `deposit_logs` 테이블 신설
- **작업 이력 (2026-05-07)**: 예치금 시스템 연동(`customer_deposits`/`deposit_logs`) + 수금 초과분 자동 예치 + 수금 등록 화면 “예치금 사용” 옵션 — worklog: `docs/worklogs/2026-05-07_sup-missing-007_deposits.md`

#### [SUP-MISSING-008] 자금관리 `fund_rules` 계산 정확도 미달 (PRODUCT §6-12)
- **PRODUCT 정의 위치**: PRODUCT §6-12 자금관리
- **요구사항(요약)**:
  - `daily_amount = 이번달 누적매출 × 비율 ÷ 영업일수`
  - 영업일 설정 미구현
  - 부족금 이월(`carry_over`) 미구현
- **현행 상태(코드 기준)**: 단순 표시/요약 위주로, PRODUCT 산식 기반의 계획 금액 산정 로직이 미흡
- **migration 필요**: NO (로직 수정)
- **작업 이력 (2026-05-07)**: 영업일(평일) 기반 daily_amount 계산(소수점 버림) + carry_over_amount 이월 로직(필요금액=planned+carry_over, 미이행분 다음날 이월) — worklog: `docs/worklogs/2026-05-07_sup-missing-008_fund-calc.md`

#### [SUP-MISSING-009] 상품 상세 탭 구조 미구현 (PRODUCT §6-6)
- **PRODUCT 정의 위치**: PRODUCT §6-6 상품관리
- **요구 탭 구조(요약)**: 기본정보 / 가격마진 / 연관상품 / 사용패턴 / 로그
- **GAP(요약)**:
  - 연관상품 수동 등록 없음
  - 사용패턴 분석 없음
- **migration 필요**: NO (UI 구현)
- **작업 이력 (2026-05-07)**: `/products/[id]` 5탭(기본정보/가격마진/연관상품/사용패턴/로그) 구현 + order_lines 기반 패턴(빈 화면 금지) + 연관상품 수동등록/자동추천 조건 분리 — worklog: `docs/worklogs/2026-05-07_sup-missing-009_product-detail-tabs.md`

#### [SUP-MISSING-010] 주문상태 이중 구조 미완성 (PRODUCT §6-4)
- **PRODUCT 정의 위치**: PRODUCT §6-4 주문관리
- **요구사항(요약)**:
  - 주문상태(운영): 접수/확인/출고준비/출고완료/납품완료/취소
  - 거래상태(원장): draft/confirmed/cancelled
- **현행 상태(코드 기준)**: 단일 `status`만 존재
- **연계**: `SUP-PARTIAL-005`
- **migration 필요**: YES — `order_status` 컬럼 추가
- **작업 이력 (2026-05-07)**: `order_status`(운영) 도입 + `status`(원장) 분리 + 주문 목록/상세에서 상태 표시/전이 UI + 주문현황 탭(전체/오늘납품/지연/출고준비/완료) — worklog: `docs/worklogs/2026-05-07_sup-missing-010_order-status.md`

#### [SUP-MISSING-011] 상품 바코드 스캔 + 사진 인식 자동 등록
- **PRODUCT 정의 위치**: PRODUCT §8-7 식당OS + §6-6 공급자OS
- **구현 방식 (4단계 순서)**:
  - **1순위: 바코드 스캔**
    - 카메라로 바코드 인식
    - 식품안전나라 API 조회 (공공데이터포털 무료)
    - 없으면 Open Food Facts API 조회
    - 폼 자동 입력
  - **2순위: Vision API (바코드 없을 때)**
    - 상품 뒷면 사진 촬영
    - Claude Vision API 텍스트 추출
    - 제품명/용량/가격/원재료 파싱
    - 폼 자동 입력
  - **3순위: 수동 입력 (최후 수단)**
- **자체 DB 구축 병행**:
  - 바코드 스캔/Vision으로 등록한 상품 데이터를 누적
  - `products` 테이블에 `barcode` 컬럼 추가 필요
  - 점진적으로 식식이OS 자체 바코드 DB 구축
- **필요한 것**:
  - 식품안전나라 API 키 (공공데이터포털 신청)
  - 바코드 스캔 라이브러리: quagga2 또는 zxing-js
  - Claude Vision API: 기존 Anthropic API 사용
- **대상 화면**:
  - 공급자OS `/products/new`
  - 식당OS `/settings/ingredients`
- **migration 필요**: YES
  - `products.barcode` 컬럼 추가
  - `ingredients.barcode` 컬럼 추가

#### [SUP-MISSING-012] 견적서 PDF/JPG 출력 미구현 (PRODUCT §6-5)
- **PRODUCT 정의 위치**: PRODUCT §6-5 견적관리
- **요구사항(요약)**:
  - 견적서 PDF 다운로드 / JPG 다운로드
  - 도장 이미지 포함(설정에서 업로드/선택)
  - 카카오/문자 공유 링크 생성
- **migration 필요**: NO (라이브러리/렌더링 구현)
- **작업 이력 (2026-05-07)**: 견적서 PDF/JPG 다운로드 버튼 추가 + export 데이터 조회 액션 + 다운로드 이력(quote_logs) 기록 — worklog: `docs/worklogs/2026-05-07_sup-missing-012_quote-export.md`

#### [SUP-MISSING-013] 거래처별 단가 시스템 미구현 (PRODUCT §6-6)
- **PRODUCT 정의 위치**: PRODUCT §6-6 상품관리
- **요구사항(요약)**:
  - 거래처별 상품 단가(`customer_product_prices`) 관리
  - 견적가 → 주문 기본가 자동 적용
  - 거래처 선택 시 최근 거래가/추천 단가 자동 제안
- **migration 필요**: YES — `customer_product_prices` 컬럼 보강(tenant_id/source)
- **작업 이력 (2026-05-07)**: `customer_product_prices`에 `tenant_id/source` 소급 migration 추가 + 주문 confirmed 시 단가 자동 갱신 + 주문등록 폼 기본가/최근가 자동 추천 — worklog: `docs/worklogs/2026-05-07_sup-missing-013_customer-product-prices.md`

### 🔍 확인 필요

#### [SUP-CHECK-001] (이관 — 공통 DB)
- **이관**: DB·RPC 확인 상세는 **`## [공통 DB]` → [DB-CHECK-001]** 을 본다. (항목 삭제 아님)

#### [SUP-CHECK-003] (이관 — 공통 DB)
- **이관**: `customer_stats`·RPC 저장 논의는 **`## [공통 DB]` → [DB-DANGER-004]** 및 승격 스텁 **[DB-CHECK-002]** 를 본다. (항목 삭제 아님)

### ✅ 구현완료

#### [SUP-DONE-001] Server Action 기반 주문·수금·원장·대시보드 데이터 파이프라인
- **위치**: `realmyos/src/actions/order.ts`, `order-query.ts`, `payment.ts`, `ledger.ts`, `dashboard.ts`, `fund.ts` 등
- **확인 내용**: `getAuthCtx` 후 `tenant_id`/`seller_tenant_id`·`payee_tenant_id` 병행 패턴으로 조회·쓰기; 클라이언트 컴포넌트는 액션 호출 위주(`PaymentsClient`, `OrderCreateForm`, `FundsClient` 등에서 직접 Supabase insert 없음).

#### [SUP-DONE-002] 미수금 핵심 계산 단일 함수 사용
- **위치**: `realmyos/src/lib/ledger-calc.ts` (`getAccountsReceivable`), `ledger.ts`·`dashboard.ts`·`payment.ts` 등에서 호출
- **확인 내용**: AR 합산에 `getAccountsReceivable` 사용; 음수는 `Math.max(0, ...)`로 클램프.

#### [SUP-DONE-003] 주문 라인 스냅샷·서버 확정 `cost_price`
- **위치**: `realmyos/src/actions/order.ts`:94-142 (`product_costs`에서 `getCurrentCostPrice`)
- **확인 내용**: 클라이언트 `cost_price` 신뢰 없이 서버에서 매입가 확정 후 `order_lines` 저장.

#### [SUP-DONE-004] 거래처 원장 UI·기초잔액·누적 잔액 표시
- **위치**: `realmyos/src/app/(app)/customers/[id]/ledger/page.tsx`, `realmyos/src/actions/ledger.ts` `getCustomerLedger`
- **확인 내용**: 기초잔액 행, 주문/수금별 누적 `running_balance`, 요약 카드.

#### [SUP-DONE-005] 자금 일일 계획 생성·이행 (`/funds`)
- **위치**: `realmyos/src/app/(app)/funds/page.tsx`, `realmyos/src/actions/fund.ts`(간접), `FundsClient.tsx`
- **확인 내용**: 오늘 기준 계획 자동 생성 시도, 이행 금액 입력·완료 액션 연동.

---

## [관리자OS] realmyos/src/app/(admin)/

### ❌ 미구현

#### [ADM-TODO-001] 관리자OS route group 자체가 없음
- **PRODUCT 정의 위치**: PRODUCT.md §10 관리자OS 기능 상세, CONTEXT.md [ARCH-02] / [ARCH-08G] `realmyos/src/app/(admin)/`
- **완료 기준**: `realmyos/src/app/(admin)/` 경로가 생성되고, `users.role='admin'` 전용 접근 제어(미들웨어/레이아웃)와 기본 페이지가 존재
- **선행 조건**: 없음 (코드 레벨에서 `/admin/*` 보호 + `getAuthCtx.role` 확장으로 달성)
- **migration 필요**: NO
- **작업 이력 (2026-05-07)**: 관리자OS `(admin)` route group 신설 + `/admin/*` admin role 보호 + 관리자 대시보드 기본 화면 추가 — worklog: `docs/worklogs/2026-05-07_adm-todo-001_admin-os-route.md`
- **작업 이력 (2026-05-07)**: `/admin/tenants` 테넌트 관리(승인/정지) + `/admin/logs` 로그 화면 + admin action 로깅 추가 — worklog: `docs/worklogs/2026-05-07_adm-todo-001_admin-tenant-management.md`

#### [ADM-MISSING-001] 거래 흐름 관제 미구현 (PRODUCT §10-4)
- **PRODUCT 정의 위치**: PRODUCT §10-4
- **요구사항(요약)**:
  - 발주→낙찰→주문→정산 전 과정 추적
  - Level 1~3 자동 개입 시스템(정상 체류 시간 기준, 이상 감지)
  - 이상 감지 → Action Queue 연결
- **migration 필요**: YES — `action_queue` 테이블 신설(ADM-MISSING-008과 공통)
- **작업 이력 (2026-05-08)**: 거래 흐름 관제 화면(`/admin/trades`) + 이상 감지(최소 규칙) → Action Queue 연결 구현 — worklog: `docs/worklogs/2026-05-07_adm-missing-001-008_action-queue.md`

#### [ADM-MISSING-002] 참여자/관계 네트워크 미구현 (PRODUCT §10-5)
- **PRODUCT 정의 위치**: PRODUCT §10-5
- **요구사항(요약)**:
  - 신뢰도 기반 참여자 통제
  - `trust_scores` 테이블 연동(이미 존재)
  - Level 매핑 정책화
- **migration 필요**: NO (`trust_scores` 이미 존재)
- **작업 이력 (2026-05-08)**: 참여자 네트워크(`/admin/participants`) + 관계 네트워크(`/admin/participants/relationships`) + 신뢰도 계산/업데이트 엔진 + Level3→Action Queue(Critical) 연동 — worklog: `docs/worklogs/2026-05-07_adm-missing-002_participants.md`

#### [ADM-MISSING-003] 데이터 학습 센터 미구현 (PRODUCT §10-6)
- **PRODUCT 정의 위치**: PRODUCT §10-6
- **요구사항(요약)**:
  - 플랫폼 전체 데이터 수집/학습
  - MVP: 임계값 기반 자동 판단(룰 엔진 형태)
- **migration 필요**: NO (로직/파이프라인 구현)

#### [ADM-MISSING-004] 판단/분석 엔진 미구현 (PRODUCT §10-7)
- **PRODUCT 정의 위치**: PRODUCT §10-7
- **요구사항(요약)**:
  - 위험/기회 판단 → 정책 트리거 생성
  - Action Queue 자동 생성
- **migration 필요**: YES — `action_queue` 테이블 신설(ADM-MISSING-008과 공통)

#### [ADM-MISSING-005] 성장/영업 엔진 미구현 (PRODUCT §10-8)
- **PRODUCT 정의 위치**: PRODUCT §10-8
- **요구사항(요약)**:
  - 이탈 위험/휴면 참여자 자동 영업
- **migration 필요**: NO (로직 구현)

#### [ADM-MISSING-006] 수익/정산 통제 미구현 (PRODUCT §10-9)
- **PRODUCT 정의 위치**: PRODUCT §10-9
- **요구사항(요약)**:
  - 자동 정산 조건 처리
  - 선지급(Credit Line) 시스템
  - 수수료 구조
- **migration 필요**: YES — settlements 관련 테이블

#### [ADM-MISSING-007] 정책/실험 콘솔 미구현 (PRODUCT §10-10)
- **PRODUCT 정의 위치**: PRODUCT §10-10
- **요구사항(요약)**:
  - 코드 없이 정책 생성/수정
  - A/B 테스트 지원
  - 정책 충돌 감지
- **migration 필요**: YES — `admin_settings_logs` 테이블

#### [ADM-MISSING-008] Action Queue 시스템 미구현 (PRODUCT §10-3)
- **PRODUCT 정의 위치**: PRODUCT §10-3 중앙 대시보드
- **CONTEXT**: [ARCH-08C] `action_queue` 테이블 정의 존재
- **현행 상태**: `action_queue` 테이블 생성 완료 ✅ (DB 기준)
- **migration 필요**: 파일 추가(미적용) — `supabase/migrations/20260507240000_create_action_queue_admin_settings.sql`
- **작업 이력 (2026-05-08)**: Action Queue 조회/만료/완료 처리 + 중앙 대시보드 섹션(`/admin/dashboard`) 연결 — worklog: `docs/worklogs/2026-05-07_adm-missing-001-008_action-queue.md`

### 🔍 확인 필요

#### [ADM-CHECK-001] 관리자OS 접근 제어 구현 여부 (`middleware.ts`, admin role 판별)
- **위치**: `realmyos/src/middleware.ts` 또는 `realmyos/src/app/(admin)/layout.tsx` (예상 위치)
- **확인하지 못한 이유**: `src/app/(admin)/` 폴더가 존재하지 않아, 관리자OS 관련 파일 트리 기반 정독이 불가
- **확인 방법**: `middleware.ts`/`layout.tsx`에서 `tenants.role='admin'` 체크 및 `admin_logs` 기록 강제 여부 확인

---

## [식당OS] resturant_os/src/app/(app)/

> 코드베이스 경로: `resturant_os/` (폴더 철자 주의). 감사 범위: `src/actions/*.ts`, `src/lib/supabase-*`, `src/app/(app)/**/page.tsx`, 핵심 클라이언트 컴포넌트(today/money/orders/rfq). **DB·RLS 실사·DDL 불일치는 `## [공통 DB]`** (`DB-DANGER-002`·`DB-CHECK-003`~**`006`**).

### ☠️ 구조위험

#### [RES-DANGER-001] 발주 확정(`acceptBidAndCreateOrder`)이 다중 write를 트랜잭션 없이 순차 실행·일부 결과 미검증 — **종료 (2026-05-06)**
- **위치**: `resturant_os/src/actions/rfq.ts`:170-268 (`acceptBidAndCreateOrder`)
- **확인 내용**: `orders` insert 후 `payments` insert, `rfq_bids`·`rfq_requests` 갱신, `price_history` insert 등을 연속 호출. `payments.insert` 반환·`error`를 검사하지 않음. 중간 실패 시 주문·지급·RFQ 상태 불일치 가능.
- **RULE 위반**: RULE-19에 준하는 복수 write 원자성 부재(공급자OS `SUP-DANGER-002`와 유사 패턴).
- **완료 기준**: 단일 RPC/트랜잭션 또는 실패 시 보상·롤백 정책 명시
- **migration 필요**: YES — `supabase/migrations/20260506150000_create_accept_bid_atomic.sql` (운영 DB 적용 완료)
- **작업 이력 (2026-05-06)**: 원자화 RPC `accept_bid_and_create_order_atomic` migration SQL 초안 작성(파일 생성, DB 미적용) — `supabase/migrations/20260506150000_create_accept_bid_atomic.sql` — worklog: `docs/worklogs/2026-05-06_phase3_res-danger-001_accept-bid-atomic-draft.md`
- **작업 이력 (2026-05-06)**: 운영 DB에 `accept_bid_and_create_order_atomic` 적용 완료 후, `acceptBidAndCreateOrder`를 단일 RPC 호출로 치환해 순차 write 제거 — worklog: `docs/worklogs/2026-05-06_res-danger-001_accept-bid-atomic.md`

#### [RES-DANGER-002] 납품 완료 처리가 두 갈래로 분리되어 데이터 정합성·PRODUCT 피드백 루프가 깨질 수 있음 — **종료 (2026-05-06)**
- **위치**: `resturant_os/src/components/orders/OrderCompleteButton.tsx`:21 (`updateOrderStatus` 호출), `resturant_os/src/actions/orders.ts`:13-88 (`markOrderDelivered`), 289-323 (`updateOrderStatus`)
- **확인 내용**: 주문 상세의 「납품 완료 처리」는 `updateOrderStatus`만 호출해 `status`를 `completed`로 바꿀 뿐, `ingredients.current_price` 갱신·`price_history` `source='delivery'` 기록·`delivered_at` 등은 `markOrderDelivered` 경로에만 있음. UI는 전자만 사용.
- **PRODUCT 정의**: §8-3·§8-4 계열에서 납품·가격 피드백이 운영 엔진 입력으로 쓰인다는 전제와 충돌 가능.
- **완료 기준**: 단일 액션으로 통합하거나, 버튼이 반드시 `markOrderDelivered`(또는 동등 로직)를 호출하도록 정렬
- **migration 필요**: NO
- **작업 이력 (2026-05-06)**: `markOrderDelivered(tenant_id, order_id)`로 납품 완료 단일화 및 호출부 정렬 — worklog: [`docs/worklogs/2026-05-06_res-danger-002_delivery-unify.md`](./worklogs/2026-05-06_res-danger-002_delivery-unify.md)

#### [RES-DANGER-003] 지급 완료 처리가 두 구현으로 분리·`today` 경로는 `payer_tenant_id` 조건 없음 — **종료 (2026-05-06)**
- **위치**: `resturant_os/src/actions/money.ts`:52-68 (`markPaymentPaid` — `payer_tenant_id`로 스코프), `resturant_os/src/actions/today.ts`:236-248 (`markPaymentPaid` — `id`만으로 `update`)
- **확인 내용**: 오늘 화면 카드는 후자를 사용. 테넌트 조건이 애플리케이션 레이어에 없음 → RLS가 없거나 약하면 타 테넌트 지급 레코드 조작 위험.
- **RULE 위반**: RULE-01 (tenant 스코프를 앱에서 명시적으로 강제하지 않는 경로)
- **완료 기준**: 지급 상태 변경은 항상 `payer_tenant_id`(또는 동등)와 함께 단일 액션으로 통일
- **migration 필요**: NO (RLS 존재 시에도 앱 이중 구현 제거 권장)
- **작업 이력 (2026-05-06)**: 지급 완료 처리 단일화(`today.ts`→`money.ts` 재사용) 및 테넌트 스코프 강제 — worklog: [`docs/worklogs/2026-05-06_res-danger-003-004_payment-tenant-fix.md`](./worklogs/2026-05-06_res-danger-003-004_payment-tenant-fix.md)

#### [RES-DANGER-004] 돈관리 클라이언트가 `markPaymentPaid`에 `tenant_id`를 넘기지 않음 — **종료 (2026-05-06)**
- **위치**: `resturant_os/src/components/money/MoneyClient.tsx`:23-27, `resturant_os/src/actions/money.ts`:52-62
- **확인 내용**: `MoneyClient`는 `restaurantId`를 props로 받지만 `handlePay`에서 `markPaymentPaid(id)`만 호출. 서버 액션 시그니처는 `(payment_id, tenant_id)` — 두 번째 인자 누락 시 `eq('payer_tenant_id', undefined)`에 해당하여 갱신 0건·오동작·RLS 상황에 따른 취약성 가능.
- **완료 기준**: `markPaymentPaid(id, restaurantId)`로 호출 정정 및 단일 구현과 정합
- **migration 필요**: NO
- **작업 이력 (2026-05-06)**: `markPaymentPaid(id, restaurantId)`로 호출 정정 — worklog: [`docs/worklogs/2026-05-06_res-danger-003-004_payment-tenant-fix.md`](./worklogs/2026-05-06_res-danger-003-004_payment-tenant-fix.md)

### 🚨 가짜구현

#### [RES-FAKE-001] 메뉴 목록 조회 오류를 빈 목록 성공으로 처리 — **종료 (2026-05-06)**
- **위치**: `resturant_os/src/actions/restaurant.ts`:90-102 (`getMenus`)
- **확인 내용**: `error`여도 `return { success: true, data: [] }` — 공급자OS `SUP-FAKE-001`과 동일 패턴(오류와 “메뉴 없음” 구분 불가).
- **완료 기준**: 오류 시 `success: false` 또는 명시적 오류 전달
- **migration 필요**: NO
- **작업 이력 (2026-05-06)**: 조회 오류 시 `success: false`로 실패 반환하도록 수정(성공 위장 제거) — worklog: `docs/worklogs/2026-05-06_phase4_fake-001-fix-silent-fail.md`

### ⚠️ 부분구현

#### [RES-PARTIAL-001] PRODUCT 8-5의 3화면(지급 예정 / 거래처 미지급금 / 자금 흐름) 대비 돈관리 UI는 단일 흐름 중심
- **위치**: `resturant_os/src/app/(app)/money/page.tsx`, `resturant_os/src/components/money/MoneyClient.tsx`, `resturant_os/src/actions/money.ts`
- **현재 동작**: `planned`·`outbound` 지급 목록·KPI(이번 주/달)·수동 추가·지급 완료 처리.
- **PRODUCT 정의**: §8-5 — 거래처별 미지급 집계 화면, 자금 흐름(생존 판단) 단계별 확장.
- **GAP**: 거래처별 미지급금 목록·드릴다운, 잔액/패턴 기반 고급 블록 없음(MVP 허용 범위는 문서상 가능하나 IA 명시와 1:1 아님).
- **완료 기준**: §8-5 각 화면의 컬럼·행동·정렬과 일치 여부 점검 후 항목 분해
- **migration 필요**: 🔍
- **확정 결정 (2026-05-06)**:
  - 데이터 모델: **`payments` 단일 테이블** 사용 (`direction='outbound'`)
  - 상태값: **`pending` / `confirmed` 체계로 통일**
  - 레거시: `payments_outgoing` 테이블/타입은 **레거시로 취급** (단, 제거/마이그레이션은 별도 작업으로 분리)
- **세부 항목 분해 (Phase 5)**:
  - **[RES-PARTIAL-001-A] 타입/필드명 정합성 정리**
    - `PaymentOutgoing` 타입: `counterparty_name` 유지, `status`를 `planned/paid` → `pending/confirmed`로 변경
    - `MoneyClient.tsx`: `supplier_name` 참조 → `counterparty_name`로 변경
    - migration: 없음 (코드 타입/참조만)
    - **작업 이력 (2026-05-06)**: 타입(status) 및 표시 필드 정합성 수정 완료 — worklog: `docs/worklogs/2026-05-06_res-partial-001a_type-fix.md`
  - **[RES-PARTIAL-001-B] 화면1(지급 예정) 필터 추가**
    - 필터 UI: 3일/이번주/이번달
    - migration: 없음
    - **작업 이력 (2026-05-06)**: 돈관리 화면(지급 예정) 필터 UI 추가(클라이언트 필터) — worklog: `docs/worklogs/2026-05-06_res-partial-001b_money-filter.md`
  - **[RES-PARTIAL-001-C] 화면2(거래처 미지급금) 목록**
    - 거래처별 집계 쿼리 + 목록 UI
    - migration: 없음 (`payments`에서 group by)
    - **작업 이력 (2026-05-06)**: RPC(`get_supplier_balances`) 기반 거래처별 미지급금 집계 목록 추가 — worklog: `docs/worklogs/2026-05-06_res-partial-001c_supplier-balances.md`
  - **[RES-PARTIAL-001-D] 화면2 드릴다운**
    - 거래처 클릭 → 상세 지급 내역
    - migration: 없음
    - **작업 이력 (2026-05-06)**: 거래처 미지급금 목록에서 인라인 드릴다운(클릭 시 지급 예정 내역 표시) 추가 — worklog: `docs/worklogs/2026-05-06_res-partial-001d_supplier-drilldown.md`
  - **[RES-PARTIAL-001-E] 화면3(MVP) 문구/정렬**
    - KPI 표현 문구 스펙 맞춤
    - migration: 없음
    - **작업 이력 (2026-05-06)**: 화면3(MVP) KPI 문구를 PRODUCT §8-5 예시 표현으로 정렬 + 연결성 점검에서 확인된 `/money` 페이지 기본값(`supplier_balances`) 누락을 보완 — worklog: `docs/worklogs/2026-05-06_res-partial-001e_money-kpi-text.md`
  - **[RES-PARTIAL-001-F] `payments_outgoing` 레거시 처리(문서화)**
    - `resturant_os/supabase/schema.sql`의 `payments_outgoing`에 레거시 주석 추가(“SSOT 아님 / 참고 스냅샷”)
    - migration: 없음
    - **작업 이력 (2026-05-06)**: `payments_outgoing` 레거시 주석 추가로 “단일 payments SSOT” 오인 방지 — worklog: `docs/worklogs/2026-05-06_res-partial-001f_legacy-cleanup.md`
- **상태**: **종료 (2026-05-06)** — RES-PARTIAL-001-A~F 완료(문구/필터/집계/드릴다운/레거시 정리까지)
- **작업 이력 (2026-05-06)**: 8-5 3화면 대조표 작성 + 단일 `payments`/`pending/confirmed` 방향 확정 + 세부 항목 분해 등록 — worklog: `docs/worklogs/2026-05-06_res-partial-001_money-gap-analysis.md`

#### [RES-PARTIAL-002] 주문 라인(`restaurant_order_items`)이 RFQ 확정 주문에서 채워지지 않아 상세 화면이 빈 품목·TODO 노출
- **위치**: `resturant_os/src/actions/rfq.ts`:191-208 (`orders` insert만), `resturant_os/src/app/(app)/orders/[id]/page.tsx`:93-99
- **현재 동작**: 확정 시 헤더형 `orders` 한 줄만 생성. 상세는 `restaurant_order_items` 조회 → 빈 배열 시 사용자에게 TODO 문구.
- **완료 기준**: 확정 시 라인 스냅샷 생성 또는 단일 라인 주문이면 UI/쿼리를 헤더와 정합
- **migration 필요**: 🔍
- **확인된 사실 (2026-05-06)**:
  - 운영 DB에 `order_lines`, `restaurant_order_items` **둘 다 존재**
  - `accept_bid_and_create_order_atomic` RPC에 `restaurant_order_items` insert **없음**
  - `orders/[id]/page.tsx`는 `getOrderDetail()`의 `order_lines`를 렌더링하며, 0건이면 “빈 품목 + TODO”가 노출됨
  - `resturant_os/src/actions/orders.ts`의 `getOrderDetail()`은 `restaurant_order_items`를 조회해 `order_lines`로 반환
  - 결론: 발주 확정 후 라인 미생성 → 상세 화면에서 빈 품목 노출
- **세부 항목 분해 (Phase 5)**:
  - **[RES-PARTIAL-002-A] 테이블명 정합성 확인**
    - `getOrderDetail()`이 실제로 어느 테이블을 조회하는지 확정 (`restaurant_order_items` vs `order_lines`)
    - migration: 없음
    - **작업 이력 (2026-05-06)**: `getOrderDetail` 조회 테이블이 `restaurant_order_items`임을 확정(변수명 `order_lines`는 별칭) + RPC insert 필요 컬럼 목록 확정 — worklog: `docs/worklogs/2026-05-06_res-partial-002a_table-confirm.md`
  - **[RES-PARTIAL-002-B] RPC에 라인 생성 추가**
    - `accept_bid_and_create_order_atomic` RPC 수정
    - 주문 확정 시 `restaurant_order_items` insert 추가 (rfq_id/bid_id/tenant_id 기반 스냅샷)
    - migration: 필요 (RPC 수정)
    - **작업 이력 (2026-05-06)**: 운영 DB RPC에 `restaurant_order_items` insert 추가 + payments status를 `pending`으로 정렬 — migration: `supabase/migrations/20260506180000_update_accept_bid_add_order_item.sql` — worklog: `docs/worklogs/2026-05-06_res-partial-002b_order-item-rpc.md`
  - **[RES-PARTIAL-002-C] UI TODO 제거**
    - `orders/[id]/page.tsx`의 TODO 주석 제거
    - 라인 생성 후 정상 표시 확인
    - **작업 이력 (2026-05-06)**: 주문 상세 빈 품목 상태의 TODO 주석 제거(RULE-13) — worklog: `docs/worklogs/2026-05-06_res-partial-002c_todo-cleanup.md`
- **상태**: **종료 (2026-05-06)** — RES-PARTIAL-002-A~C 완료(RPC 라인 생성 + UI 정리)
- **작업 이력 (2026-05-06)**: 운영 DB 라인 테이블 존재 확인 + RPC 라인 미생성 원인 정리 + 세부 항목(A~C) 분해 등록 — worklog: `docs/worklogs/2026-05-06_res-partial-002_order-lines-gap.md`

#### [RES-PARTIAL-003] `payments` 자동 생성 시 컬럼이 수동 입력과 불일치(`supplier_name` vs `counterparty_name`) — **종료 (2026-05-06)**
- **위치**: `resturant_os/src/actions/rfq.ts`:219-228, `resturant_os/src/actions/money.ts`:89-100 (`addManualPayment`)
- **확인 내용**: RFQ 확정 분기는 `supplier_name`을 넣고, 수동 추가는 `counterparty_name`. 통합 payments 모델에서 표시·집계·PRODUCT §9 필드명과의 정합이 깨질 수 있음.
- **완료 기준**: 스키마 기준 단일 컬럼(또는 뷰)으로 기록 통일
- **migration 필요**: YES — `supabase/migrations/20260506150000_create_accept_bid_atomic.sql` (RPC payments insert: `counterparty_name`으로 통일)
- **작업 이력 (2026-05-06)**: 통일 방향을 `payments.counterparty_name` 단일 사용으로 확정하고, 수동 추가(`addManualPayment`)는 기존대로 유지, RFQ 확정 RPC(`accept_bid_and_create_order_atomic`)의 payments insert를 `counterparty_name`으로 수정 — worklog: `docs/worklogs/2026-05-06_res-partial-003_counterparty-name-unify.md`

#### [RES-PARTIAL-004] 매장 설정의 좌석·테이블 정보가 조회 시 항상 0/null — **종료 (2026-05-06)**
- **위치**: `resturant_os/src/actions/restaurant.ts`:38-49 (`getRestaurant`)
- **확인 내용**: `tenants`에서 일부 필드만 읽고 `table_2p`/`table_4p`는 `0`, `seating_config`는 `null` 고정. PRODUCT 8-2 설정 메뉴의 「테이블 수 입력」과 불일치 가능.
- **완료 기준**: DB 컬럼 또는 JSON 필드와 매핑해 저장·표시
- **migration 필요**: NO — `tenants.seating_config`(jsonb)로 저장/조회 매핑
- **작업 이력 (2026-05-06)**: `tenants.seating_config`(jsonb)를 `{ table_2p, table_4p }` 구조로 저장/조회하도록 `getRestaurant`/`updateRestaurant` 매핑 추가 — worklog: `docs/worklogs/2026-05-06_res-partial-004_seating-config.md`

#### [RES-PARTIAL-005] 발주 확정 시 애플리케이션 레이어에서 RFQ 소유 테넌트와 입찰·요청의 교차 검증이 약함 — **종료 (2026-05-06)**
- **위치**: `resturant_os/src/actions/rfq.ts`:178-184 (`bid`/`rfq`는 id만으로 조회 후 `buyer_tenant_id`에 인자 `tenant_id` 사용)
- **확인 내용**: 코드상 `rfq.tenant_id === tenant_id` 확인 없음. 방어는 RLS·Supabase에 의존.
- **완료 기준**: 서버 액션에서 소유권·상태 검증 명시 또는 RPC 단일 진입점
- **migration 필요**: NO
- **작업 이력 (2026-05-06)**: `acceptBidAndCreateOrder`에서 `rfq.tenant_id === tenant_id` 소유권 검증 추가 — worklog: [`docs/worklogs/2026-05-06_res-partial-005-006_tenant-guard-fix.md`](./worklogs/2026-05-06_res-partial-005-006_tenant-guard-fix.md)

#### [RES-PARTIAL-006] 식자재 삭제·설정 upsert가 `id`만으로 갱신하는 경로 존재(테넌트 조건 없음) — **종료 (2026-05-06)**
- **위치**: `resturant_os/src/actions/settings.ts`:71-72 (`upsertIngredient` update), 82-87 (`deleteIngredient`)
- **확인 내용**: `eq('id', id)`만 사용. 유출된 UUID로 타 테넌트 행 조작 가능성은 RLS에 좌우.
- **RULE 위반**: RULE-01 앱 레이어 방어 관점에서 미흡
- **완료 기준**: 모든 write에 `tenant_id` 조건 또는 권한 RPC
- **migration 필요**: NO
- **작업 이력 (2026-05-06)**: `ingredients` write 경로에 tenant 스코프 강제(`update`는 `tenant_id`, `delete`는 `getTenantId()` 기반) — worklog: [`docs/worklogs/2026-05-06_res-partial-005-006_tenant-guard-fix.md`](./worklogs/2026-05-06_res-partial-005-006_tenant-guard-fix.md)

#### [RES-PARTIAL-007] 미들웨어가 no-op — 라우트 단위 보호는 페이지별 `getTenantId`에 의존 — **종료 (2026-05-06)**
- **위치**: `resturant_os/src/middleware.ts`
- **현재 동작**: `NextResponse.next()`만 반환.
- **GAP**: 공통 인증/승인/역할 검사를 미들웨어에서 강제하지 않음(레이아웃·페이지 분산).
- **완료 기준**: PRODUCT·CONTEXT 기대 수준의 접근 제어 설계와 비교 후 보강 여부 결정
- **migration 필요**: NO
- **결정**: 현행 유지 결정 — `getTenantId()`가 모든 `(app)` 페이지의 SSOT 접근 제어(인증/온보딩/승인 체크) 역할을 수행. Edge middleware DB 조회 제약으로 미들웨어 보강은 불필요. `middleware.ts` no-op 유지.
- **작업 이력 (2026-05-06)**: 현행 구조 분석·GAP 정리 후 “현행 유지” 결정 기록 — worklog: `docs/worklogs/2026-05-06_res-partial-007_middleware-decision.md`

### ❌ 미구현

#### [RES-MISSING-001] 식자재(ingredients) 화면 미구현 (PRODUCT §8-7)
- **PRODUCT 정의 위치**: PRODUCT §8-7 식당OS 설정
- **요구사항(요약)**:
  - `/settings/ingredients` 화면에서 식자재 수기 입력 + 사진 인식(= `SUP-MISSING-011` 연계)
  - `ingredients` 테이블(현 운영/SSOT) 확인 필요
- **migration 필요**: NO (UI 구현만)
- **작업 이력 (2026-05-07)**: 식당OS `resturant_os`에 `/settings/ingredients` 화면 구현(카테고리 그룹/검색/필터) + 식자재 CRUD(soft delete) + 현재가/목표가/가격차이 표시 — worklog: `docs/worklogs/2026-05-07_res-missing-001_ingredients.md`

#### [RES-MISSING-002] 메뉴(menus) + 원가 계산 미구현 (PRODUCT §8-7)
- **PRODUCT 정의 위치**: PRODUCT §8-7 식당OS 설정
- **요구사항(요약)**:
  - `menus` 테이블
  - `menu_ingredients` 연결 테이블
  - 메뉴별 원가 자동 계산: Σ `ingredient.current_price × quantity`
  - `menu_cost_cache` AI 추정 캐시
- **migration 필요**: NO (UI 구현만, 단 migration 파일 소급 추가)
- **작업 이력 (2026-05-07)**: 식당OS `resturant_os`에 `/settings/menus` 화면 신설(메뉴 CRUD + 식재료 구성 입력) + `menu_ingredients` 기반 원가/마진율 실시간 계산(계산값 DB 저장 금지) + 대표메뉴 최대 3개 서버 검증 + `menu_cost_cache` 기반 AI 추정 원가 표시 — worklog: `docs/worklogs/2026-05-07_res-missing-002_menus.md`

#### [RES-MISSING-003] 돈관리 하위 3메뉴 분리 미구현 (PRODUCT §8-4)
- **PRODUCT 정의 위치**: PRODUCT §8-4
- **현행 상태**: 단일 `/money` 화면
- **요구사항(요약)**:
  - 지급예정 / 거래처미지급금 / 자금흐름 3 화면 분리
- **migration 필요**: NO (UI 분리)
- **작업 이력 (2026-05-07)**: 식당OS `resturant_os`에서 `/money`를 `/money/upcoming`으로 리다이렉트 + `/money/upcoming|/money/suppliers|/money/cashflow` 3메뉴 분리 + 화면 상단 서브 네비 추가 — worklog: `docs/worklogs/2026-05-07_res-missing-003-004_money-today.md`

#### [RES-MISSING-004] 오늘운영 카드 생성 로직 미구현 (PRODUCT §8-3)
- **PRODUCT 정의 위치**: PRODUCT §8-3
- **현행 상태**: 단순 목록 표시
- **요구사항(요약)**:
  - 조건 기반 카드 자동 생성: 돈흐름카드 / 절약기회카드 / 오늘할일카드
  - 카드 완료 시 자동 제거
- **migration 필요**: NO (로직 구현)
- **작업 이력 (2026-05-07)**: 식당OS `resturant_os`에서 오늘운영 카드 최대 3개(돈흐름>절약기회>오늘할일) 규칙으로 카드 생성 로직 구현 + 카드 CTA는 화면 이동만(자동 발송/자동 실행 없음) — worklog: `docs/worklogs/2026-05-07_res-missing-003-004_money-today.md`

### 🔍 확인 필요

#### [RES-CHECK-001] (이관 — 공통 DB)
- **이관**: 상세는 **`## [공통 DB]` → [DB-CHECK-003]** 을 본다. (항목 삭제 아님)

#### [RES-CHECK-002] (이관 — 공통 DB)
- **이관**: 상세는 **`## [공통 DB]` → [DB-CHECK-004]** 을 본다. (항목 삭제 아님)

### ✅ 구현됨 (참고)

#### [RES-DONE-001] 식당OS 돈관리 조회 기준이 PRODUCT §8-5·CONTEXT payments `direction='outbound'`와 일치
- **위치**: `resturant_os/src/actions/money.ts`:27-34, `resturant_os/src/actions/today.ts`:32-45

#### [RES-DONE-002] 납품 대기 목록에서 입찰 `delivery_days` 조회를 in-쿼리로 묶어 N+1 회피
- **위치**: `resturant_os/src/actions/orders.ts`:171-184 (`getPendingDeliveries`)

#### [RES-DONE-003] 주문 상세 라인 조회 전 `buyer_tenant_id`로 헤더 검증
- **위치**: `resturant_os/src/actions/orders.ts`:256-266 (`getOrderDetail`)

#### [RES-DONE-004] 테넌트 해석(`getTenantId`)에 승인 대기·온보딩 리다이렉트·데모용 env 오버라이드 정의
- **위치**: `resturant_os/src/lib/get-restaurant.ts`

#### [RES-TODO-001] PRODUCT 8-2 메뉴 구조 대비 일부 라우트·기능 공백 — **완료 (2026-05-07)**
- **확인 내용**: `(app)` 기준 `/today`, `/rfq`, `/orders`, `/money`, `/suppliers`, `/settings` 등은 존재. 별도 `/notifications` 등 알림 전용 IA(§8-7), 「거래 조건 설정」 전용 화면 등은 본 회차 트리 상 미확인 또는 미구현.
- **완료 기준**: §8-2·§8-7 화면 목록과 URL 1:1 매핑 표 작성 후 공백 항목 구현
- **migration 필요**: NO
- **매핑 결과 (2026-05-06, 분석)**:
  - **확인된 라우트 트리**: `resturant_os/src/app/(app)/` 기준 `/today`, `/rfq`(+`/new`, `/[id]`), `/orders`(+`/[id]`), `/money`, `/suppliers`(+`/new`, `/[id]`), `/settings`(+`/ingredients`, `/fixed-costs`, `/restaurant`) 존재 확인.
  - **공백(미구현) 후보**:
    - **알림 메뉴(§8-2, §8-7)**: `/notifications`(알림 목록), `/notifications/important`(중요 알림) 라우트 부재
    - **발주관리(§8-2) + 알림 액션 링크(§8-7)**: `/orders/results`(입찰 결과) 라우트 부재 (`rfq_result` action_link가 `/orders/results`로 정의됨)
    - **설정(§8-2)**: “메뉴/가격 입력”, “거래 조건 설정” 전용 화면/라우트 부재(URL 규약 미확정)
    - **돈관리 하위 3메뉴(§8-2)**: “지급 예정/미지급금/자금 흐름” IA 분리 필요 — 세부는 `RES-PARTIAL-001`에서 분해 진행
  - **산출물**: PRODUCT 화면 목록 ↔ 현재 라우트 1:1 매핑 표(캔버스) — `res-todo-001-menu-route-gap.canvas.tsx`
- **작업 이력 (2026-05-06)**: PRODUCT 8-2/8-7 정독 + `(app)` 라우트 트리 전수 확인 + 1:1 매핑표 작성 + 공백 항목 정리 — worklog: `docs/worklogs/2026-05-06_res-todo-001_menu-route-gap.md`
- **작업 이력 (2026-05-07)**: `/notifications` 알림 목록(+읽음 처리) + `/orders/results` 입찰 결과 라우트 신설 + today 알림 “전체보기” 링크 추가 — worklog: `docs/worklogs/2026-05-07_res-todo-001_notifications-results.md`

---

## 비-DB 운영 확인

> 코드·스키마 감사와 분리: **DB 테이블·RLS·migration 증거**가 아니라, **배포 환경·외부 서비스·런타임**에서만 확정되는 항목.

#### [SUP-CHECK-002] 대시보드 `getAiInsight` 외부 API 호출
- **위치**: `realmyos/src/actions/dashboard.ts`:194-219
- **확인하지 못한 이유**: Anthropic API 키·환경 변수·실제 응답 성공 여부는 런타임 미실행.
- **확인 방법**: 배포 환경 변수·호출 성공률·실패 시 `fallbackMessage`만 사용되는지 운영 로그로 확인
- **이슈 유형 (명시)**  
  - **DB 이슈 아님**: 스키마·마이그레이션·SQL RPC와 무관. **`DB-CHECK`로 분류하지 않음.**  
  - **순수 개발(코드) 결함으로 단정 불가**: 구현은 있으나, 감사 시점에 **API 키 미설정·쿼터·네트워크·벤더 장애** 등으로 실패할 수 있음.  
  - **운영 / 외부 API 이슈**: 확인 책임은 **배포 환경에 접근 가능한 담당자**(시크릿 관리·로그·모니터링). Cursor·로컬 저장소만으로는 **닫을 수 없음**.

---

## 감사 요약 (집계)

> **집계 규칙**: 아래 숫자는 `tasks.md` 본문에 **제목이 한 번씩 등장하는 ID**만 센다. `SUP-CHECK-001` 등 **이관 스텁**은 원 소속(공급자OS)에 포함, 상세는 `DB-CHECK-*` 참조. **`SUP-CHECK-002`**는 **`## 비-DB 운영 확인`**에 두었으나 접두사 `SUP-`이므로 **공급자OS 행의 확인필요 건수**에 포함된다.

### 유형별 건수

| 대상 | 구조위험 | 가짜구현 | 부분구현 | 미구현 | 확인필요 | 완료 | 합계 |
|------|----------|----------|----------|--------|----------|------|------|
| 공통 DB (`DB-*`) | 4 | 2 | 1 | 2 | 8 | 0 | **17** |
| 공급자OS (`SUP-*`) | 6 | 1 | 7 | 5 | 3 | 5 | **27** |
| 관리자OS (`ADM-*`) | 0 | 0 | 0 | 1 | 1 | 0 | **2** |
| 식당OS (`RES-*`) | 4 | 1 | 7 | 0 | 2 | 5 | **19** |
| **전체** | **14** | **4** | **15** | **8** | **14** | **10** | **65** |

> **DB 확인 8건**: `DB-CHECK-001`~`006`은 **forensic 종결(006은 스키마 스냅샷 diff 기록 완료)**. **`007`·`008`** 및 **`DB-CHECK-004`의 `WITH CHECK` 잔여**는 미결.

### ID 접두사별 건수 (교차 검증)

| 접두사 | 건수 |
|--------|------|
| DB- | 17 |
| SUP- | 27 |
| ADM- | 2 |
| RES- | 19 |

### 교차 검증 (운영 DB forensic 반영 후, 본문 `#### [접두사-…]` 개수)

| 접두사 | 본문 ID 개수 | 표와 일치 |
|--------|----------------|-----------|
| DB- | 17 | ✅ |
| SUP- | 27 | ✅ |
| ADM- | 2 | ✅ |
| RES- | 19 | ✅ |
| **합계** | **65** | ✅ |

유형 합: 구조위험 14 + 가짜 4 + 부분 15 + 미구현 8 + 확인 14 + 완료 10 = **65** ✅

---

## 실행 로드맵 (감사 ID 전용)

> **Phase 0**부터 순서 고정. **TASK-nn·PHASE-n** 레거시는 [`tasks-legacy.md`](./tasks-legacy.md)에만 존재 — 본 로드맵과 **같은 스프린트에 섞지 말 것.**

**Phase 0 — 공통 DB forensic** — **완료**  
- **`DB-CHECK-001`~`006`**: 운영 DB 기준 **forensic 종결** (각 항목 본문 **Forensic 상태** 참조).  
- **`DB-CHECK` 1차 배치**: **종료** — 미결은 **`DB-CHECK-007`**, **`DB-CHECK-008`**, 및 **`DB-CHECK-004`** 내 **`WITH CHECK` 추가 확인**만 잔류.  
- 승격: **`DB-CHECK-002` → `DB-DANGER-004`** (RULE-02, `current_balance` delta 저장).  
- **`DB-CHECK-005` 게이트 (이력)** — 닫힘: 대시보드 권한자 확인·`tasks.md` 기록 완료.  
- 참고: 게이트 원문 — *`DB-CHECK-005`는 Cursor 단독 불가; 권한자 확인 후 본 문서 기록; 확인 전 Phase 1 금지* — **현재는 충족됨.**

**Phase 1 — 스키마·정책 위험** — **완료 (2026-05-06, 문서 기준)**  
- **시작 조건**: **Migration governance 확립** — `realmyos/supabase/migrations/README.md` 기준의 **운영 DB SSOT·baseline·incremental·dev → validation → production** 적용·승인 흐름이 채택됨. 과거 migration 복원·히스토리 재구성·환각 DDL 금지. **실제 스키마 변경 SQL 실행·DROP·RPC/테이블 수정은 별 승인·별 작업.**
- **`DB-DANGER-002`** (2026-05-06 **종료** — 레거시 `schema.sql`·운영 SSOT 확정, 본문 참조), **`DB-DANGER-003`** (2026-05-06 **종료 (저장소)** — `action_kind` CHECK 확장 migration 추가·**DB 미적용**, 본문 참조), **`DB-TODO-001`**, **`DB-TODO-002`**, **`DB-TODO-003`** (⚠️ 부분 — `trust_score`/`signal` 미구현) — DDL·PRODUCT·앱 정렬 방향 확정 (구현은 별 작업)  
- 병렬: **`DB-CHECK-007`**, **`DB-CHECK-008`**
- migration 파일 검증 완료 (2026-05-06):
  worklog: docs/worklogs/2026-05-06_phase1_migration-validation.md

**Phase 2 — 테넌트·앱 보안·캐시 제거 설계** — **완료 (2026-05-06)**  
- **`SUP-DANGER-005`**, **`SUP-DANGER-006`**, **`RES-DANGER-003`**, **`RES-DANGER-004`**, **`RES-PARTIAL-005`**, **`RES-PARTIAL-006`**, **`DB-DANGER-004`** (deprecated/원장 단일 소스 전환 **설계·단계 합의** — 즉시 DROP 금지)  
- 입력: **`DB-CHECK-004`** — `USING` 격리 **종결**; **`WITH CHECK`** 잔여는 정책 DDL 재검 시 본 항목에 후속 기록

**Phase 3 — 거래·돈 원자성**  
- **`SUP-DANGER-002`**, **`SUP-DANGER-004`**, **`RES-DANGER-001`**, **`RES-DANGER-002`**, **`SUP-DANGER-001`**

**Phase 4 — 도메인 정합**  
- **`SUP-DANGER-003`**, **`SUP-PARTIAL-004`**, **`SUP-PARTIAL-005`**, **`RES-PARTIAL-003`**, **`SUP-FAKE-001`**, **`RES-FAKE-001`**

**Phase 5 — 기능·IA 공백** — **완료 (2026-05-07, SUP 트랙)**
- **완료(✅)**: `SUP-PARTIAL-002`, `SUP-PARTIAL-003`, `SUP-PARTIAL-004`, `SUP-PARTIAL-006`, `SUP-PARTIAL-007`, `RES-PARTIAL-001`, `RES-PARTIAL-002`, `RES-PARTIAL-004`, `RES-PARTIAL-007`
- **2026-05-07 본 세션 완료(✅, 분해 항목 종결)**:
  - `SUP-PARTIAL-001` 대시보드 KPI/위험 거래처/지연/RFQ/자금/거래처매출 6분해 — partial-001a~f, partial-001 종합 감사
  - `SUP-PARTIAL-006` 자동화영업 감사 (관계형 단일·휴면 회복 일관)
  - `SUP-TODO-001` (A~E): RFQ 라우트·노출 RPC·입찰·낙찰/탈락 알림·계약 후속 흐름 문서화
  - `SUP-TODO-002` (A~D): `/disbursements` 라우트·payments 모델 정합·지급 분배 + 매입 연동 RPC·지급 취소 RPC
  - `SUP-TODO-003` (A~D): `/purchases` 라우트·`default_supplier_id`/procurement_type 감사·매입원장 연동 분해 (자동 매입 Phase 7+)
  - `SUP-TODO-004` (A·B-1·C): `/ledger` 진입점·거래처 원장 컬럼 정합 + 필터·`/analytics` 4탭 신설
  - `SUP-TODO-005-D` 선행 조건 게이트 명시 (A/B/C는 Phase 6+ 이월)
- **분리/이월(다음 세션)**:
  - **B-2/C-2/C-3/C-4** (오늘 신규 분리): 원장 세금계산서 로직·매입원장 별도 페이지 / 차트 라이브러리 / 출력 / 평균결제기간 정확 정의
  - **`RES-TODO-001`**: 식당OS `/notifications` + `/orders/results` 라우트 공백 — **완료 (2026-05-07)** — worklog: `docs/worklogs/2026-05-07_res-todo-001_notifications-results.md`
  - **`SUP-TODO-005-A/B/C`**: Phase 6+ 보류 (관리자OS + `relationships`/`trust_scores` 선행)

**Phase 6 — 관리자OS**  
- **`ADM-TODO-001`** — 입력: **`ADM-CHECK-001`**, **`DB-TODO-002`**
- **추가 (Phase 6에서 migration 생성)**: `relationships`(PRODUCT §8-6) + `trust_scores`(CONTEXT 정의) 테이블 신설 migration (Phase 1에서 방향 B 확정, `DB-TODO-003` 참조)

**Phase 7 — 연체 시스템 설계**  
- **대상**: **`SUP-DANGER-003`** (연체 시스템), **`SUP-PARTIAL-005`** (주문상태 이중 구조) — 두 항목 함께 설계 필요  
- **선행 조건**: **Phase 4~5 완료 후 진행** (상태 모델·도메인 정합이 먼저)  
- **핵심 선행 결정**: `due_date` 컬럼 설계 확정 필요  
- **설계 범위**: 약정일/유예기간/자동연체/알림/위험도/수금스코어 전체 설계 문서 작성 후 진행  
- **완료 기준**: `docs/phase7-overdue-design.md` 설계 문서 확정 + 본 tasks에 작업 이력 기록
- **작업 이력 (2026-05-07)**: Phase 7 연체 시스템 설계 문서 작성(`due_date`/`grace_days`/`trade_status` 런타임 계산, `collection_allocations` 연동) — worklog: `docs/worklogs/2026-05-07_phase7-overdue-design.md`

**비-DB 운영 확인** (`## 비-DB 운영 확인` 참조)  
- **`SUP-CHECK-002`** — 언제든 병렬 가능 (Phase 0~6과 독립, 단 **운영/환경 접근** 필요)

---

## 부록

2026-04-27 **레거시** 멀티테넌트 전환 목록(TASK-nn, PHASE-n, 원장·매출 체크리스트)은 **[`tasks-legacy.md`](./tasks-legacy.md)** 에만 있다. **`tasks.md` 본문과 혼합하지 말 것.**
