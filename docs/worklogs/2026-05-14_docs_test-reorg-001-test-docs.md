| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

TEST-REORG-001: 분산된 `TEST-RUN-*` 문서를 **`docs/TEST-DEV/`**(개발·SQL·forensic)와 **`docs/TEST-RUN/`**(정무님 단일 런북)으로 나누고, **`TEST-RUN-MASTER-001`** 을 추가한다. 코드·DB·migration 변경 없음.

## 관련 `tasks.md` ID

- OPS 작업 이력 **TEST-REORG-001**

## 수정 파일 목록

- `docs/TEST-DEV/TEST-RUN-001.md` — 이동(내용 동일·경로만 갱신된 링크)
- `docs/TEST-DEV/TEST-RUN-ERP-001.md` — 이동
- `docs/TEST-DEV/TEST-RUN-PRICING-001.md` — 이동
- `docs/TEST-RUN/TEST-RUN-MASTER-001.md` — 신규 운영 리허설 런북
- `docs/TEST.md` — 상단 문서 안내·하위 링크 경로
- `docs/tasks.md` — 문서 사용법 번호·경로·OPS 이력
- `docs/DISCOUNT-ENGINE-DESIGN-001.md` — ERP 연계 링크 경로
- `docs/worklogs/*` — 과거 worklog 내 문서 경로 문자열(참조용)

## 변경 내용 요약

- `git mv` 로 세 가이드를 `TEST-DEV/` 로 이동.
- 전역 `docs/**/*.md` 에서 `docs/TEST-RUN-*.md` → `docs/TEST-DEV/TEST-RUN-*.md` 치환.
- `TEST-RUN-MASTER-001`: 클릭 순서 중심·SQL 최소·limitation 명시.

## migration 여부

- 없음

## 테스트 결과

- 해당 없음

## 남은 위험

- 외부 위키·슬랙 등 저장소 밖 링크는 수동 점검 필요.

## 다음 권장 작업

- `docs/TEST-DEV/README.md` 인덱스(선택)로 파일 목록 고정.
