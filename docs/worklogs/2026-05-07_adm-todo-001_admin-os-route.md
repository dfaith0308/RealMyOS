# ADM-TODO-001 — 관리자OS route group 신설

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`RealMyOS` 저장소 내에 관리자OS 진입점(`/admin/*`)을 신설하고, `users.role='admin'` 기반으로 접근을 강제하여 “관리자 전용 화면”의 최소 골격을 만든다.

## 관련 tasks.md ID

- `ADM-TODO-001`

## 수정 파일 목록

- `realmyos/src/lib/supabase-server.ts`
- `realmyos/src/middleware.ts`
- `realmyos/src/app/(admin)/layout.tsx`
- `realmyos/src/app/(admin)/page.tsx`
- `realmyos/src/app/(admin)/dashboard/page.tsx`
- `realmyos/src/actions/admin.ts`
- `realmyos/src/components/layout/AdminSidebar.tsx`
- `realmyos/docs/tasks.md`

## 변경 내용 요약

- `getAuthCtx()`가 `users.role`을 조회해 `AuthCtx.role`로 반환하도록 확장했다.
- `middleware.ts`에 `/admin/*` 전용 가드를 추가했다.
  - 로그인(세션) 확인 후 `users.role !== 'admin'`이면 `/dashboard`로 리다이렉트한다.
- `(admin)` route group을 신설했다.
  - `layout.tsx`에서 `getAuthCtx()`로 인증 후 admin이 아니면 `/dashboard`로 리다이렉트한다.
  - `/admin`은 `/admin/dashboard`로 리다이렉트한다.
  - `/admin/dashboard`에 관리자 대시보드 기본 화면(테넌트 요약/승인대기 수/최근 테넌트/최근 로그)을 추가했다.
- 관리자 전용 사이드바(`AdminSidebar`)를 추가했다. (테넌트관리/로그 메뉴는 “준비중” 처리)
- `docs/tasks.md`의 `ADM-TODO-001` 항목에 작업 이력을 기록했다.

## migration 여부

- 없음

## 테스트 결과

- `npx tsc --noEmit` pass

## 남은 위험

- `admin_logs` 테이블은 운영 DB에 없을 수 있어(`DB-TODO-002` 문맥), `getAdminDashboard()`에서 로그 조회는 best-effort(에러 시 빈 배열)로 처리했다.
- 미들웨어에서 `users` 테이블 조회가 Edge 런타임/정책에 의해 제한될 경우 `/admin/*` 접근이 의도치 않게 차단될 수 있다(운영 환경에서 확인 필요).

## 다음 권장 작업

- `admin_logs`/`action_queue` 등 관리자OS 전용 테이블의 migration(파일 추가/적용)을 별도 ID로 진행하고, 관리자 행동 기록을 실제로 강제한다.
- `/admin/tenants`, `/admin/logs` 라우트를 구현해 사이드바 “준비중” 메뉴를 활성화한다.

