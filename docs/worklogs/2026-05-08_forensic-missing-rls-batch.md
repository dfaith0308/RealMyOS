| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

누락된 RLS를 소급 migration으로 고정하고, `product_related_manual` 저장소·운영 불일치 이력을 주석·FORENSIC에 남긴다.

## 관련 `tasks.md` ID

없음 — FORENSIC §6 보강.

## 수정 파일 목록

- `supabase/migrations/20260508040000_fix_missing_rls_policies.sql`
- `supabase/migrations/20260507160000_create_product_related_manual.sql` (상단 주석)
- `docs/FORENSIC.md`
- `docs/tasks.md`
- 코드 변경 없음

## 변경 내용 요약

- `tenant_relationships`·`action_queue`·`admin_settings`에 RLS 및 정책 추가(SQL 사용자 제공본).
- `product_related_manual`: 운영 미반영 확인 후 Supabase 직접 생성 서술.

## migration 여부

파일 추가·주석만 — 운영 적용 전제는 사용자 지시와 동일.

## 테스트 결과

해당 없음.

## 남은 위험

`admin_settings` 관리자 전용 RLS는 테넌트 세션의 `admin_settings` SELECT(예: 정책키 폴백 경로)와 충돌할 수 있음 — 정책·역할·RPC 재점검 필요할 수 있음.

## 다음 권장 작업

테넌트용 정책 읽기 전용 뷰/RPC 또는 예외 정책 설계 검토.
