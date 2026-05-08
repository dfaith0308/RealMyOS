# FORENSIC.md — 식식이OS 레이어 불일치 현실 고정

> 수정 전 현실 고정용 문서  
> 운영 DB vs migration vs 앱 코드 불일치 기록  
> 작성일: 2026-05-07 · **갱신: 2026-05-08** (`admin_logs`·RLS `WITH CHECK`·`customer_stats` · §3 알리고 역할 분리 · §4 **정책키 엔진 연결**)

---

## 1. admin_logs 컬럼 불일치

**✅ 완료 (2026-05-08)** — 소급 migration `supabase/migrations/20260508010000_add_admin_logs_columns.sql`: `admin_id`, `tenant_id`, `reason`, `target_table`, `target_id`, `old_value`, `new_value` 추가 및 COMMENT. 운영 DB 적용 완료.

### 운영 DB 실제 컬럼 (불일치 시점 — Supabase 확인, 2026-05-07 기준)

- id (uuid)
- admin_tenant_id (uuid)
- action_type (text)
- target_tenant_id (uuid)
- payload (jsonb)
- created_at (timestamptz)

### migration 파일 정의

파일: `supabase/migrations/20260506130001_create_admin_logs.sql`  
→ 운영 DB와 일치 ✅

### 앱 코드 가정 (`insertAdminLog` 호출부)

코드가 INSERT 시도하는 컬럼 (**2026-05-07 진단** — 당시 DB에 없었던 항목):

- `admin_id` ❌ (DB에 없음 — DB에는 `admin_tenant_id`만 존재)
- `tenant_id` ❌ (DB에 없음 — DB에는 `target_tenant_id`만 존재)
- `reason` ❌ (DB에 없음)
- `target_table` ❌ (DB에 없음)
- `target_id` ❌ (DB에 없음)
- `old_value` ❌ (DB에 없음)
- `new_value` ❌ (DB에 없음)

### 판정 (종결 전 기록)

**CRITICAL** — 앱 코드가 스키마에 없는 컬럼명으로 INSERT를 시도할 수 있음  
→ 관리자 감사 로그 경로가 **실패하거나**, RLS/에러 처리로 **조용히 누락**될 가능성  
→ 일부 호출부는 `.catch(() => {})` 등으로 실패가 드러나지 않을 수 있음  
→ **2026-05-08**: DB 확장(택 1)으로 컬럼 정합 완료. 앱 INSERT와의 최종 일치는 동작 검증 권장.

### 수정 방향 (이력)

**택 1 — DB 확장 (앱 코드 기준)** — **적용됨 (2026-05-08)**

- `admin_id`, `tenant_id`, `reason`, `target_table`, `target_id`, `old_value`, `new_value` — migration `20260508010000_add_admin_logs_columns.sql`

**택 2 — 앱 정렬 (DB 스키마 유지)** — 미선택 (레거시 기록)

---

## 2. RLS WITH CHECK 현황

**✅ 완료 (2026-05-08)** — 소급 migration `supabase/migrations/20260508020000_fix_rls_with_check.sql`: `orders`·`payments`·`rfq_requests` 기존 정책에 `WITH CHECK`를 `USING`과 동일 조건으로 추가. 운영 DB 적용 완료.

### 확인 테이블 (이력)

- orders — 정책 `"orders: all"`
- payments — 정책 `"payments: all"`
- rfq_requests — 정책 `"tenant_isolation"`

### 상태 (종결 전 기록)

~~⏳ Supabase에서 확인 진행 중 (`docs/tasks.md` `DB-CHECK-004` 잔여와 동일 축)~~ → **종결** — 위 migration 및 운영 반영으로 정리.

---

## 3. 알리고 자격증명 — 역할 분리 확정

**✅ 해소 (2026-05-08)** — 과거 문서에서 **이원화(HIGH)** 로 표현했으나, 저장소·코드 경로 기준으로는 **역할 분리가 확정된 정상 구조**이다.

### settings 테이블 (`tenant_id` 있음)

- 테넌트별 알리고 설정
- 공급자가 **`/settings`**에서 직접 입력
- **실제 문자 발송** 경로 (`src/actions/message.ts` → `getAligoSettings()`, `sendAligo`, `sendAligoTest` 등)

### admin_settings 테이블 (`tenant_id` 없음)

- 플랫폼 레벨 기본값
- 관리자 전용
- **정책 콘솔 테스트 발송 전용** (`src/actions/admin/policy-console.ts` → `sendPolicyConsoleAligoTest`)

### 결론

**이원화가 아닌 역할 분리.** 테넌트 실발송과 플랫폼·관리자 테스트 자격 증명의 책임 경계가 분리되어 있다.

---

## 4. 정책키 소비 코드 매핑표

| 키 이름 | 정의 위치 | 소비 코드 존재 | 비고 |
|---|---|---|---|
| platform_fee_rate | admin_settings | ✅ `settlement-control.ts` | 수수료·정산 로직 |
| settlement_cycle_days | admin_settings | ✅ `settlement-control.ts` | 미정산 경과일 위험(`cycle_days`) |
| order_cycle_calculation_count | admin_settings | ✅ `ledger.ts`, `sales.ts` (`getAdminSettingNumber`) | 최근 N건 주문일로 주기 계산 |
| signal_suppression_days | admin_settings | ✅ `sales-trigger.ts` | 관리등급=정기관리 재연락 간격 |
| rfq_repeat_limit | admin_settings | ✅ `resturant_os` `rfq.ts` `createRfqRequest` | 동일 품목 반복 생성 한도 |
| delivery_signal_window | admin_settings | ✅ `trade-monitor.ts` | 지급 outbound 미정산 감지 일수 |
| rfq_open_duration_hours | admin_settings | ✅ `trade-monitor.ts`, `resturant_os` `rfq.ts` | 무입찰 RFQ 경과 시간·기본 마감·반복 윈도우 |
| trust_supplier_level1/2/3 | admin_settings | ✅ `trust-engine.ts` (경유 `policy-console.ts`) | Level 경계 |
| trust_restaurant_level1/2/3 | admin_settings | ✅ `trust-engine.ts` (경유 `policy-console.ts`) | Level 경계 |
| aligo_user_id / aligo_api_key / aligo_sender | admin_settings | ✅ §3 역할 분리 | 플랫폼·정책 콘솔 **테스트 발송** 전용; 실발송은 `settings`(테넌트) |

### 판정

**✅ 완료 (2026-05-08)** — 위 5키는 `getAdminSettingNumber`(실패 시 `POLICY_SETTING_DEFAULTS` 폴백)로 엔진에 연결됨 (D-018). 신규 엔진·키 추가 시에도 동일 패턴 준수.

---

## 5. tenant_id / seller_tenant_id 병행

**✅ 부분 해소 (2026-05-08)** — 컬럼 병행·앱 `.or()` 패턴은 **유지**하되, `orders`에 **`WITH CHECK`** 가 들어간 소급 migration으로 **쓰기 경로 테넌트 정합**을 보강함 (`supabase/migrations/20260508020000_fix_rls_with_check.sql`, 운영 반영 완료).

### 현황

- `orders` 테이블: **`tenant_id`**(레거시) + **`seller_tenant_id`** + **`buyer_tenant_id`** — 세 컬럼 모두 존재(운영 DDL 기준). 전환·조회 시 레거시와 신규 축을 함께 다루는 코드 패턴 유지.
- 쿼리: `.or()` 필터로 판매자/구매자·레거시 `tenant_id` 등을 함께 처리하는 패턴 존재.
- `docs/CONTEXT.md` [ARCH-03]에 단일 축으로의 전환 진행 중으로 명시.

### 판정

**MEDIUM → 부분 완화** — 읽기·집계에서의 `.or()` 실수 리스크는 남음. **INSERT/UPDATE** 는 `WITH CHECK` 로 테넌트 불일치 쓰기 억제.

---

## 6. customer_stats RLS 누락

### 현황 (종결 전 진단)

- `customer_stats`에 **RLS 미적용** 상태였을 경우, 테넌트 간 **`tenant_id` 우회 조회·변경** 가능성이 이론상 존재.
- 테이블은 **계산 캐시** 성격(`current_balance`, `total_sales` 등 집계값 저장)으로 **원장 단일 소스(SSOT)와 이중화** 위험이 있음.

### 조치

**✅ RLS 적용 완료 (2026-05-08)** — 소급 migration `supabase/migrations/20260508030000_fix_customer_stats_rls.sql`: `ENABLE ROW LEVEL SECURITY` + 정책 `customer_stats_tenant` (`USING`·`WITH CHECK`: `tenant_id = get_my_tenant_id()`). 운영 DB 적용 완료.

### 판정

- **CRITICAL (이력)** — RLS 없음 + 계산값 저장 구조의 조합.
- **RLS** — **✅ 완료 (2026-05-08)** (위 migration).
- **계산값(`current_balance` / `total_sales` 등) 저장** — **MEDIUM**: 장기적으로는 **원장 SSOT** 로 정합·전환 권장. **당장 스키마·데이터 대량 변경 시 데이터 손실·불일치 위험** → 별도 설계·마이그레이션 단계에서 처리.

---

## 7. CONTEXT.md / tasks.md 문서 드리프트

### 현황

- **CONTEXT.md**: relationships 코드 없음 등으로 기술된 구간이 있으나, 실제로는 `(admin)/participants/` 등 관리자 라우트·액션이 존재할 수 있음 → 재수집 필요
- **tasks.md**: 상단 migration 인벤토리 등 과거 서술과 실제 `realmyos/supabase/migrations/` 내 다수 `.sql` 파일 존재 사이 불일치 가능

### 판정

**MEDIUM** — 문서만 보고 운영·아키텍처 결정 시 오판 가능

---

## 처리 순서

1. ✅ admin_logs forensic 확인 완료
2. ✅ RLS WITH CHECK 검증·수정 (2026-05-08)
3. ✅ admin_logs 스키마 확장 — migration 소급 파일·운영 반영 (2026-05-08)
4. ✅ 알리고 역할 분리 확정 — `docs/FORENSIC.md` §3 (2026-05-08)
5. ✅ 정책키 소비 코드 연결 — D-018, 본 표 및 코드 참조 (2026-05-08)
6. ✅ `customer_stats` RLS — migration `20260508030000_fix_customer_stats_rls.sql` (2026-05-08)
7. ⏳ CONTEXT.md·tasks.md 재수집
