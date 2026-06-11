# 관리자OS 계정 관리 CRUD 확장

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-06-11 |
| **차단 사유** | 해당 없음 |

## 작업 목적

관리자OS `/admin/tenants`에서 공급자·식당 계정을 직접 생성·수정·삭제(소프트)할 수 있도록 하고, 기존 승인/정지 기능과 함께 완전한 계정 관리 화면으로 확장한다.

## 관련 tasks.md ID

- `ADM-TODO-001`

## 수정 파일 목록

- `src/actions/admin.ts` — `createTenant`, `updateTenant`, `deleteTenant`, `getTenantDetail`, `getTenantAdminList` 추가
- `src/app/(admin)/admin/tenants/page.tsx` — 서버 fetch + `TenantsClient` 렌더
- `src/app/(admin)/admin/tenants/TenantsClient.tsx` — 탭·테이블·모달 UI (신규)
- `src/app/(admin)/admin/tenants/tenants.module.css` — 스타일 (신규)
- `docs/tasks.md` — `ADM-TODO-001` 작업 이력
- `docs/worklogs/2026-06-11_feat_admin-tenant-crud.md` — 본 파일

## 변경 내용 요약

- **Server Actions**: `SUPABASE_SERVICE_ROLE_KEY` 기반 admin client로 Auth `createUser` / `updateUserById` / `getUserById` 수행. 생성 실패 시 Auth·tenant·users 롤백. `approveTenant` / `suspendTenant` / `getTenantList` 본문은 변경 없음.
- **createTenant**: Auth user → `tenants`(name, slug, role, `is_approved: true`) → `users` insert → `admin_logs`.
- **updateTenant**: tenants.name, Auth email/password, users.email 동기화.
- **deleteTenant**: 소프트 삭제 (`is_approved: false`, `deleted_at` 설정). Auth user 물리 삭제 없음.
- **getTenantAdminList**: `deleted_at IS NULL` 목록 + tenant별 Auth 이메일 enrichment.
- **UI**: 전체/공급자/식당 탭, 생성·수정·삭제 모달(HTML form 미사용), 승인/정지 토글 유지.

## migration 여부

- **없음** — migration 파일 신규 생성 없음. `deleted_at` 컬럼은 운영 DB에 존재한다고 가정.

## 테스트 결과

- `npx tsc --noEmit` — pass
- `npm run build` — pass
- 수동 UI 검증(공급자/식당 생성·탭·수정·삭제) — 미실행 (로컬 admin 세션·service role key 필요)

## 남은 위험

- 운영 DB에 `tenants.deleted_at` 컬럼이 없으면 목록/삭제 API가 실패할 수 있음.
- `SUPABASE_SERVICE_ROLE_KEY` 미설정 시 생성·수정·이메일 조회 실패.
- 테넌트당 users 1:1 가정; 복수 사용자 연결 tenant는 첫 user만 수정 대상.
- `getTenantAdminList`가 tenant 수만큼 Auth `getUserById` 호출 — 대량 tenant 시 지연 가능.

## 다음 권장 작업

- 운영 DB에서 `deleted_at` 컬럼 존재 여부 확인 및 없으면 별도 승인 migration.
- tenant 목록 이메일 조회 배치 최적화.
- 삭제된 계정 복구(admin un-delete) UI 검토.
