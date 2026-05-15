# SUP-DANGER-005 — customers 조회 tenant_id 스코프 추가

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`/orders`, `/payments` 페이지 서버 컴포넌트에서 `customers` 목록 조회 시 앱 레이어에서 `tenant_id` 조건이 누락된 경로를 제거해, RULE-01(tenant_id 스코프)을 충족한다.

## 관련 tasks.md ID

- SUP-DANGER-005

## 수정 파일 목록

- `realmyos/src/app/(app)/orders/page.tsx`
- `realmyos/src/app/(app)/payments/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-06_sup-danger-005_customers-tenant-fix.md`

## 변경 내용 요약

- `/orders` 페이지의 `customers` 조회에 `getAuthCtx` 기반 `tenant_id` 필터를 추가했다.
- `/payments` 페이지의 `customers` 조회에 `getAuthCtx` 기반 `tenant_id` 필터를 추가했다.
- `SUP-DANGER-005`를 종료 처리하고 작업 이력을 `tasks.md`에 기록했다.

## migration 여부

- 없음

## 테스트 결과

- 에디터 진단: 수정한 두 페이지에서 linter 오류 없음

## 남은 위험

- `customers` RLS가 존재하더라도, 앱 레이어에서의 `tenant_id` 조건 누락은 재발할 수 있으므로 유사 패턴(다른 페이지/쿼리)도 지속 점검 필요.

## 다음 권장 작업

- Phase 1 범위에서 다른 페이지 서버 컴포넌트의 직접 조회(`createSupabaseServer().from(...)`) 중 테넌트 스코프 누락 여부를 동일 기준으로 점검한다.

