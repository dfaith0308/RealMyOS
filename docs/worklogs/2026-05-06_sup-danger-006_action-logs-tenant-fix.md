# SUP-DANGER-006 — action_logs 조회 tenant_id 스코프 추가

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

거래처 원장 페이지에서 최근 행동 로그(`action_logs`)를 조회할 때 앱 레이어의 `tenant_id` 스코프가 누락된 경로를 제거해, RULE-01(tenant_id 스코프) 및 Phase 2 보안 기준을 충족한다.

## 관련 tasks.md ID

- SUP-DANGER-006

## 수정 파일 목록

- `realmyos/src/app/(app)/customers/[id]/ledger/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-06_sup-danger-006_action-logs-tenant-fix.md`

## 변경 내용 요약

- 거래처 원장 페이지에서 `createSupabaseServer()` 이후 `getAuthCtx()`로 `tenant_id`를 확보하고, `action_logs` 조회에 `tenant_id` 필터를 추가했다.
- `SUP-DANGER-006`를 종료 처리하고 작업 이력을 `tasks.md`에 기록했다.

## migration 여부

- 없음

## 테스트 결과

- 에디터 진단: 수정한 페이지에서 linter 오류 없음

## 남은 위험

- `action_logs` 외 테이블을 직접 조회하는 페이지/컴포넌트에서 유사한 tenant 스코프 누락이 재발할 수 있음.

## 다음 권장 작업

- Phase 2 범위에서 직접 Supabase 조회를 수행하는 페이지를 점검해, `getAuthCtx` 기반 스코프 강제를 일관되게 적용한다.

