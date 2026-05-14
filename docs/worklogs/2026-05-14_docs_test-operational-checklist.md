| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

배포 전 **기능 존재 여부가 아니라 실운영 가능성**을 점검할 수 있도록, storefront·관리자·RFQ·비가역 원칙·부하·regression·migration을 한 문서(`docs/TEST.md`)에 모은 **운영 검증 체크리스트**를 추가한다.

## 관련 `tasks.md` ID

- 없음 (문서 사용법 `[OPS — AI worklog]`에 작업 이력 기록)

## 수정 파일 목록

- `docs/TEST.md` (신규)
- `docs/tasks.md` — 문서 사용법 항목 8·OPS 작업 이력
- `docs/worklogs/2026-05-14_docs_test-operational-checklist.md` (본 파일)

## 변경 내용 요약

- `[ ]` / `[x]` / `[!]` 표기와 7개 본문 섹션(STOREFRONT, ADMIN, RFQ, 비가역 원칙, 운영 테스트, Regression, MIGRATION) 및 기록 템플릿.
- 운영 리스크·실사용 흐름 관점 문구로 작성; “테스트 예정”만 있는 빈 항목은 두지 않음.

## migration 여부

없음

## 테스트 결과

- 해당 없음(문서만).

## 남은 위험

- 체크리스트는 **수동 검증** 전제이므로, 실행·증거 미첨부 시 문서만으로는 운영 보증이 되지 않음.

## 다음 권장 작업

- `docs/TEST.md`에 검증일·담당·증거 링크를 누적 기록.
- `resturant_os` 배포 검증 시 동일 항목을 스테이징에서 병행 체크.
