# Phase 1 — migration 파일 검증 (문서)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

Phase 2 착수 전에, 저장소에 추가된 migration SQL 파일 3개의 문법/의존/충돌 여부를 **DB 실행 없이** 검증 결과로 고정한다.

## 관련 tasks.md ID

- Phase 1 (스키마·정책 위험) — migration governance
- DB-TODO-001, DB-TODO-002, DB-DANGER-003 (migration 파일 존재)

## 대상 파일

- `supabase/migrations/20260506130000_create_settings_logs.sql`
- `supabase/migrations/20260506130001_create_admin_logs.sql`
- `supabase/migrations/20260506120000_fix_today_events_action_kind_check.sql`

## 검증 결과

### 1) SQL 문법/구문 정합성

- `20260506130000_create_settings_logs.sql`: CREATE TABLE/INDEX, RLS enable, policy 구문 정합
- `20260506130001_create_admin_logs.sql`: CREATE TABLE/INDEX, RLS enable, policy 구문 정합
- `20260506120000_fix_today_events_action_kind_check.sql`: ALTER TABLE, DROP/ADD CONSTRAINT, CHECK 구문 정합

### 2) 참조 함수 존재 여부 (채팅 forensic 근거)

- `get_my_tenant_id()` → 운영 DB 실존 확인 ✅
- `is_admin()` → 운영 DB 실존 확인 ✅

### 3) 테이블명 충돌 여부 (채팅 forensic 근거)

- `settings_logs` → 운영 DB 없음 확인 ✅ (충돌 없음)
- `admin_logs` → 운영 DB 없음 확인 ✅ (충돌 없음)
- `today_events_action_kind_check` → 제약명 일치 확인 ✅

## 주의사항 (적용 전 점검 필요)

- `gen_random_uuid()` 사용: `pgcrypto` 확장 활성화 여부 확인 필요
- 컬럼명 `key`: ORM/쿼리 빌더에서 충돌 가능성 여부 운영 적용 전 점검 필요
- `today_events` CHECK: `DROP CONSTRAINT IF EXISTS` 사용으로 제약명 불일치 시에도 실패 없이 진행됨(안전)

## migration 여부

- 없음 (검증 문서만 작성)

## 테스트 결과

- 미실행 — DB 실행 금지(문서 검증만)

## 남은 위험

- 실제 적용 환경(dev/validation/production)별 extension/RLS 함수/권한 상태 차이로 인해 적용 실패 가능성은 남아있음.

## 다음 권장 작업

- governance에 따라 dev → validation → production 순으로 적용 전 점검 체크리스트(extensions/RLS helper functions/DDL 권한)를 준비한다.

