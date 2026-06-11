# 숨겨진 페이지 접근 경로 추가

| 항목 | 내용 |
|------|------|
| **상태** | 완료 |
| **완료일** | 2026-06-11 |
| **브랜치** | `dev` |

## 작업 목적

구현은 되어 있으나 사이드바·허브·상세 화면에서 진입 링크가 없던 5개 경로(`/settings/tags`, `/settings/messages`, 거래처 원장→상세/수정, `/customers/all`)에 네비게이션만 추가하여 운영자가 UI에서 직접 접근할 수 있게 한다.

## 관련 `tasks.md` ID

- `SUP-MISSING-001` — 운영분류 관리(`/settings/tags`) 진입
- `SUP-PARTIAL-006-C` — 메시지 템플릿(`/settings/messages`) 진입
- `SUP-PARTIAL-001-B` — KPI/목록 링크 정합(거래처 IA 보완)
- 문서 사용법(로드맵) — IA·네비게이션 보완 이력

## 수정 파일 목록

- `src/components/layout/Sidebar.tsx` — 설정 하위 메뉴(운영분류·메시지 템플릿)
- `src/app/(app)/settings/page.tsx` — 설정 허브 카드 2종
- `src/app/(app)/settings/settings-hub.module.css` — 허브 카드 스타일(CSS Module, `--ds-*` 토큰)
- `src/app/(app)/customers/[id]/ledger/page.tsx` — 거래처 정보·수정 링크
- `src/app/(app)/customers/page.tsx` — 전체 목록 보기 링크
- `docs/tasks.md` — 작업 이력 반영
- `docs/worklogs/2026-06-11_feat_hidden-page-nav-links.md` — 본 로그

## 변경 내용 요약

- **사이드바**: `설정`을 거래처관리와 동일한 그룹 구조로 변경, `운영분류 관리`·`메시지 템플릿` 하위 항목 추가.
- **설정 허브**: 기존 폼 위에 2열 카드 그리드로 하위 설정 페이지 링크 추가(inline style 없음).
- **거래처 원장**: 상단 CTA에 `거래처 정보`(`/customers/[id]`), `거래처 수정`(`/customers/[id]/edit`) 버튼 추가.
- **거래처 운영 목록**: 페이지 액션에 `전체 목록 보기`(`/customers/all`) 링크 추가.
- 각 대상 페이지의 데이터·라우팅 로직은 변경하지 않음.

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` — **pass** (exit 0)
- 브라우저 수동 확인 — 미실행(로컬 dev 서버 미기동). 링크·href·사이드바 MENU 구조는 코드 리뷰로 검증.

## 남은 위험

- 거래처 원장 상단 CTA 버튼이 4개로 늘어 모바일(`max-width: 980px`)에서 줄바꿈·밀집 가능 — 기존 `ctaRow` flex wrap 동작에 따름.
- `/settings` 본문 진입 시 설정 그룹이 자동 펼침되지 않을 수 있음(다른 그룹과 동일: 하위 경로일 때만 auto-open).

## 다음 권장 작업

- dev 서버에서 사이드바·설정 허브·원장·거래처 목록 5경로 클릭 스모크 테스트.
- 설정 허브 기존 inline style 영역을 점진적으로 CSS Module·`--ds-*`로 이관(별도 chore).
