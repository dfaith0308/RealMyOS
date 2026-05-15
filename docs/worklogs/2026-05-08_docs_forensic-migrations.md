| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

FORENSIC §1·§2에 따라 **`admin_logs` 컬럼 확장**과 **`orders`·`payments`·`rfq_requests` RLS `WITH CHECK`** 를 소급 migration으로 저장소에 고정하고, 문서·`tasks.md`를 종결 상태와 일치시킨다.

## 관련 `tasks.md` ID

- `DB-TODO-002` (`admin_logs`)
- `DB-CHECK-004` (RLS `WITH CHECK`)

## 수정 파일 목록

- `supabase/migrations/20260508010000_add_admin_logs_columns.sql` (신규)
- `supabase/migrations/20260508020000_fix_rls_with_check.sql` (신규)
- `docs/FORENSIC.md`
- `docs/tasks.md`
- 애플리케이션 코드 변경 없음

## 변경 내용 요약

- `admin_logs`: 앱 INSERT와 정합되는 컬럼 7개 `IF NOT EXISTS` 추가 및 COMMENT.
- RLS: 명명된 기존 정책(`orders: all`, `payments: all`, `tenant_isolation`)에 `WITH CHECK`를 `USING`과 동일 식으로 설정.
- `FORENSIC.md`에 완료(2026-05-08) 배너 및 처리 순서 갱신.

## migration 여부

- **파일 추가**: `20260508010000_add_admin_logs_columns.sql`, `20260508020000_fix_rls_with_check.sql`
- **본 로그 작성 시점**: 사용자 지시에 따라 **운영 DB 적용 완료(2026-05-08)** 전제의 소급 기록

## 테스트 결과

해당 없음 (저장소 파일·문서만). 신규 환경에서는 정책 이름·함수(`get_my_tenant_id`, `is_admin`) 존재 여부에 따라 적용 성공 여부가 달라질 수 있음.

## 남은 위험

- Greenfield에 기존 정책명이 없으면 `ALTER POLICY` 실패 가능 → baseline migration 또는 정책 생성 순서와 정합 필요.
- `admin_logs` 컬럼 추가 후에도 `admin_tenant_id` vs `admin_id` 등 **이중 필드 의미** 문서·앱 일관성 추가 정리 권장.

## 다음 권장 작업

- `insertAdminLog` 실제 INSERT 경로 스모크 테스트(운영 또는 스테이징).
- `FORENSIC.md` §3~§6 후속(CDN·정책키·CONTEXT 재수집).
