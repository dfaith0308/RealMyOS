| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

`docs/FORENSIC.md` §3에서 알리고 자격증명을 **이원화(HIGH)** 가 아니라 **`settings` vs `admin_settings` 역할 분리**로 명확히 고정한다.

## 관련 `tasks.md` ID

없음 — OPS 문서 정합 (`docs/FORENSIC.md` §3).

## 수정 파일 목록

- `docs/FORENSIC.md` (§3 본문·헤더 갱신·§4 aligo 행·처리 순서 4번)
- 코드 변경 없음

## 변경 내용 요약

- `settings`(`tenant_id`): 테넌트별 설정·`/settings` 입력·실발송 경로.
- `admin_settings`(테넌트 없음): 플랫폼 기본·관리자 전용·정책 콘솔 테스트 발송만.

## migration 여부

없음.

## 테스트 결과

해당 없음.

## 남은 위험

PRODUCT·온보딩 문구에서 두 저장소를 혼동해 안내하면 사용자 혼선 가능 — 별도 문서 점검 권장.

## 다음 권장 작업

`FORENSIC.md` §4 정책키 엔진 연결·§6 CONTEXT/tasks 재수집.
