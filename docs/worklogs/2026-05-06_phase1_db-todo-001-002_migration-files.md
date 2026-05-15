# Phase 1 — DB-TODO-001/002 migration 파일 추가 (미적용)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

운영 DB에 존재하지 않는 것으로 확정된 `settings_logs`, `admin_logs`에 대해, PRODUCT 요구(설정 변경 감사/관리자 개입 감사)를 충족할 수 있도록 **테이블 + RLS 정책을 포함한 migration 파일만** 생성한다. (실제 DB 적용은 금지)

## 관련 tasks.md ID

- DB-TODO-001
- DB-TODO-002

## 수정 파일 목록

- `supabase/migrations/20260506130000_create_settings_logs.sql`
- `supabase/migrations/20260506130001_create_admin_logs.sql`
- `docs/tasks.md`
- `docs/worklogs/2026-05-06_phase1_db-todo-001-002_migration-files.md`

## 변경 내용 요약

- `settings_logs` 테이블을 생성하는 migration 파일을 추가했다. (`tenant_id`, key/old/new, changed_by, changed_at 포함 + tenant 기반 RLS + 인덱스)
- `admin_logs` 테이블을 생성하는 migration 파일을 추가했다. (`admin_tenant_id`, action_type, target_tenant_id, payload, created_at 포함 + admin-only RLS + 인덱스)

## migration 여부

- 파일 추가(미적용)
  - `supabase/migrations/20260506130000_create_settings_logs.sql`
  - `supabase/migrations/20260506130001_create_admin_logs.sql`

## 테스트 결과

- 미실행 — DB 적용 금지(파일 생성만)

## 남은 위험

- migration 파일만으로는 PRODUCT 요구를 충족하지 못한다. 앱 레이어에서 `settings_logs`/`admin_logs` 기록을 실제로 남기는 경로가 아직 없음.
- RLS 정책은 `get_my_tenant_id()` 및 `is_admin()` 함수 존재를 전제로 한다. (정책 이름/함수명 변경 시 추후 조정 필요)

## 다음 권장 작업

- `SUP-PARTIAL-003`의 `saveSettings`에 설정 변경 로그 기록을 연결한다. (Server Action, tenant_id/changed_by 강제)
- 관리자OS(`ADM-*`) 구현 시 관리자 행위마다 `admin_logs`에 남기도록 공통 헬퍼/미들웨어 설계를 확정한다.

