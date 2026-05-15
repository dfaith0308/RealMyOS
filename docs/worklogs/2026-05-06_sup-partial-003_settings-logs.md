# SUP-PARTIAL-003 설정 변경 로그(`settings_logs`) 연동

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

설정 저장 시 `settings` upsert만 하고 감사 로그(`settings_logs`)를 남기지 않던 GAP을 해소해, PRODUCT 6-14의 “설정 변경 감사” 요구를 충족한다.

## 관련 tasks.md ID

- SUP-PARTIAL-003
- (선행) DB-TODO-001: `settings_logs` 테이블

## 수정 파일 목록

- `realmyos/src/actions/settings.ts`
- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-06_sup-partial-003_settings-logs.md`

## 변경 내용 요약 (전/후)

- **변경 전**: `saveSettings`는 `settings` 테이블에 upsert만 수행하고, 변경 로그를 기록하지 않음.
- **변경 후**:
  - upsert **전에** 변경 대상 key 목록으로 기존 값을 조회(`tenant_id` + `key in (...)`)
  - upsert 성공 **후에** `settings_logs`에 key별로 아래를 기록
    - `tenant_id`, `key`, `old_value`, `new_value`, `changed_by(ctx.user_id)`
    - `changed_at`은 DB default(now()) 사용
  - `settings_logs` insert 실패는 **settings 저장 성공을 막지 않음**(best-effort)

## old_value 조회 방식

- `settings`에서 `(tenant_id = ctx.tenant_id) AND (key IN [...])`로 조회 후 `Map<key,value>`로 보관
- upsert 대상 중 `old_value !== new_value`인 key만 `settings_logs` insert 대상으로 필터링

## migration 여부

- production 적용 완료 확인 — `supabase/migrations/20260506130000_create_settings_logs.sql` (`settings_logs` 테이블 존재 확인)

## 테스트 결과

- 미실행 — 코드 변경 및 운영 DB 테이블 존재 확인만 수행(로컬/CI 테스트는 수행하지 않음)

## 남은 위험

- `settings_logs` insert가 실패해도 settings 저장은 성공으로 처리되므로, 운영에서 로그 누락이 발생할 수 있다(의도된 trade-off).

## 다음 권장 작업

- 설정 화면에서 변경 로그 조회 UI/관리자 감사 뷰가 필요한지(기획) 결정하고, 필요한 경우 `settings_logs` 조회 액션을 추가한다.

