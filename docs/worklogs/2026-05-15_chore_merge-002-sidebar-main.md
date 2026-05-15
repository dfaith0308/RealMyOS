| 필드 | 값 |
|------|------|
| **상태** | 완료 |
| **완료일** | 2026-05-15 |

## 작업 목적

**MERGE-002**: MERGE-001에서 실패한 `dev`→`main` 병합을, **`src/components/layout/Sidebar.tsx` 충돌만** 해결하여 완료한다. dev 내용 우선, ERP/매입 메뉴 누락 방지.

## 관련 `tasks.md` ID

- **[MERGE-002]**

## 수정 파일 목록

- `src/components/layout/Sidebar.tsx` (충돌 해결만; merge로 `main`에 반영됨)
- `docs/tasks.md`
- `docs/worklogs/2026-05-15_chore_merge-002-sidebar-main.md`

## 변경 내용 요약

- **충돌 1 (`MENU`)**: `main`은 `icon` 필드·중복 `매입관리`(soon)·`원장관리`(`/customers/all`)·`매출분석`(`/sales`)를 삽입했으나 `MenuGroup`에 `icon` 없음. **dev**의 `설정`·`원장관리`(`/ledger`) 채택. 위쪽에 이미 있는 **매입관리 그룹**과 겹치는 `main`의 placeholder `매입관리` 행은 제거(실제 매입 메뉴는 유지).
- **충돌 2**: **dev**의 `매출분석` → `/analytics`를 자동화영업 그룹 뒤에 유지.
- **충돌 3 (`s` 스타일)**: **dev**의 `mobileHeader`·`closeBtn` 스타일 유지.

## migration 여부

없음(파일 실행·DB 변경 없음). merge commit에 `dev` 쪽 migration 파일들이 **저장소에 포함**되었으나 **적용하지 않음**.

## 테스트 결과

- `npx tsc --noEmit` — **통과** (exit 0).

## 남은 위험

- `main`에 있던 `매출분석` 링크 `/sales`는 dev의 `/analytics`로 통합됨 — 북마크 사용자는 경로 변경 인지 필요.
- `dev` 브랜치는 `main`보다 뒤처질 수 있음; 필요 시 `dev`에 `main` merge-back 별도 검토.

## 다음 권장 작업

- 운영 배포 파이프라인에서 **migration 적용 순서**를 merge와 분리해 통제.
