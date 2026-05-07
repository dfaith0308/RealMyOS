# ADM-TODO-001 후속 — 관리자OS 테넌트 관리/로그 화면

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

관리자OS에서 테넌트 승인/정지 운영을 수행할 수 있도록 `/admin/tenants` 화면을 추가하고, `admin_logs`를 조회할 수 있는 `/admin/logs` 화면을 추가한다.

## 관련 tasks.md ID

- `ADM-TODO-001`

## 수정 파일 목록

- `realmyos/src/actions/admin.ts`
- `realmyos/src/app/(admin)/tenants/page.tsx`
- `realmyos/src/app/(admin)/logs/page.tsx`
- `realmyos/src/components/layout/AdminSidebar.tsx`
- `realmyos/docs/tasks.md`

## 변경 내용 요약

- 관리자 전용 Server Action 확장:
  - `getTenantList()` — 전체 테넌트 목록 조회(최근 생성 순)
  - `approveTenant(tenant_id)` — `tenants.is_approved=true`
  - `suspendTenant(tenant_id)` — `tenants.is_approved=false`
  - `getAdminLogs({ action_type })` — 최근 로그 조회 + action_type 필터
- 원칙 준수:
  - 모든 액션에서 `getAuthCtx().role === 'admin'` 검증을 수행한다.
  - 승인/정지(write) 액션은 `admin_logs` 기록 실패 시 롤백을 시도하고 실패로 반환한다.
  - 목록 조회 로그는 화면 진입을 막지 않도록 best-effort로 처리한다.
- 관리자 UI 추가:
  - `/admin/tenants`: 승인대기/승인됨/정지/전체 필터 + 승인/정지 토글 버튼
  - `/admin/logs`: 최근 로그 테이블 + action_type 빠른 필터
- `AdminSidebar`에서 `/admin/tenants`, `/admin/logs` 메뉴를 활성화했다.

## migration 여부

- 없음

## 테스트 결과

- `npx tsc --noEmit` pass

## 남은 위험

- `admin_logs` 테이블/컬럼이 운영 DB에 존재하지 않거나 스키마가 다르면,
  - 승인/정지(write) 액션은 **실패 처리**된다(로그 기록을 필수로 강제).
  - 로그 화면(`/admin/logs`)은 조회 자체가 실패할 수 있다.
- 승인/정지 + 로그 기록은 DB 트랜잭션(RPC)으로 원자화되어 있지 않아, 극단적 상황에서 롤백이 완전하지 않을 수 있다.

## 다음 권장 작업

- `admin_logs`의 정본 스키마를 migration으로 확정하고(별도 승인/적용), 승인/정지 및 향후 정책 변경 액션을 **단일 RPC로 원자화**한다.
- “승인 대기”와 “정지”를 구분하려면 `tenants`에 별도 상태 컬럼(예: `status`)을 도입하는 방안을 검토한다(본 작업은 migration 없음 원칙으로 `is_approved`만 사용).

