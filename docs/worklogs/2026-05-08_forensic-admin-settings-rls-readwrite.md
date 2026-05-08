| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

`admin_settings`를 정책키 소비(테넌트 세션 SELECT)와 관리자 전용 변경으로 분리하기 위해 RLS 정책을 읽기/쓰기 이원화한다.

## 관련 `tasks.md` ID

없음 — FORENSIC §6·D-018 맥락.

## 수정 파일 목록

- `supabase/migrations/20260508050000_fix_admin_settings_rls.sql`
- `docs/FORENSIC.md` (§6 `admin_settings` 2차 수정 서술·처리 순서·헤더)
- `docs/tasks.md`
- 코드 변경 없음

## 변경 내용 요약

- `admin_settings_admin` DROP 후 `admin_settings_read`(SELECT true)·쓰기 3정책(관리자).

## migration 여부

파일 추가 — 운영 적용 전제는 사용자 지시와 동일.

## 테스트 결과

해당 없음.

## 남은 위험

SELECT 전역 공개는 **키 값 노출 범위**가 넓어짐 — 민감 키는 앱·PRODUCT 기준 재검토 권장.

## 다음 권장 작업

정책키 중 테넌트 비공개가 필요하면 행 단위·별 테이블·뷰 분리 검토.
