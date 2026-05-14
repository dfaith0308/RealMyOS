| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

`tasks.md`의 **COMMERCE-*** 블록·집계·**OPS worklog** 목록을 실제 worklog 파일·`git`에 커밋된 문서와 맞추고, **COMMERCE-009**(미착수)를 신규 등록한다. 코드·`PRODUCT.md`·`CONTEXT.md`·`TEST.md` 본문은 변경하지 않는다.

## 관련 `tasks.md` ID

- **OPS** — `[OPS — AI worklog]` 절차 기록
- `COMMERCE-007`, `COMMERCE-008`, `COMMERCE-009`

## 수정 파일 목록

- `docs/tasks.md` — COMMERCE-007 상태·이력, COMMERCE-008 범위 문구, COMMERCE-009 신규, 집계 10/84, Phase 8 문구, OPS에 `docs/TEST.md`·본 정리 이력
- `docs/worklogs/2026-05-14_docs_tasks-commerce-ops-alignment.md` (본 파일)

## 변경 내용 요약

- **COMMERCE-008**: 존재·완료·작업 이력·`feat_commerce-008` worklog 링크 유지; **범위**에 썸네일·상세 이미지 **URL 표시만**(업로드·삭제·순서·URL 직접 편집 없음) 명시; **비범위**에 썸네일 URL 직접 수정 명시.
- **COMMERCE-009**: 운영 전환 / forensic cleanup — **미착수**, 예정 범위만 열거(완료 처리 없음).
- **COMMERCE-007**: `resturant_os` `src/app/(app)/today/page.tsx`에서 `/buy` 링크·카드 최대 3 유지 **파일 확인** 후 완료 기준과 정합되도록 **상태·작업 이력** 반영.
- **OPS (2026-05-14)**: 기존에 없던 **`docs/TEST.md`** 생성 이력을 [`2026-05-14_docs_test-operational-checklist.md`](./2026-05-14_docs_test-operational-checklist.md)로 연결.
- **집계**: 본문 `#### [COMMERCE-000]`~`009` **10건**에 맞춰 `COMMERCE-*`·본문 ID 합계·교차 검증 표 갱신.
- **Phase 8**: 일부 ID 완료·009 미착수 반영해 로드맵 설명 보강.

## migration 여부

없음

## 테스트 결과

- 본문 `#### [COMMERCE-` 제목 수: **10건** (000~009) — `tasks.md` 내용과 집계 표 일치 확인.
- `docs/worklogs/2026-05-14_*.md` 파일 존재 여부로 OPS 링크 대상 검증.

## 남은 위험

- `COMMERCE-009` 범위는 **선언만**이며, 실제 제거 작업 시 별도 worklog·브랜치에서 코드 변경이 따른다.

## 다음 권장 작업

- `COMMERCE-009` 범위를 이슈/PR 단위로 쪼개 우선순위 확정 후 구현.
