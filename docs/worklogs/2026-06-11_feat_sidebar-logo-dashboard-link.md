# 사이드바 로고 → 대시보드 링크

| 항목 | 내용 |
|------|------|
| **상태** | 완료 |
| **완료일** | 2026-06-11 |
| **브랜치** | `dev` |

## 작업 목적

사이드바 상단 「식식이OS」 로고·텍스트 클릭 시 `/dashboard`로 이동하도록 한다.

## 관련 `tasks.md` ID

- 문서 사용법 — UI/UX 네비게이션

## 수정 파일 목록

- `src/components/layout/Sidebar.tsx`
- `docs/tasks.md`, 본 worklog

## 변경 내용 요약

- `brand` 영역을 `<Link href="/dashboard">`로 교체.
- `brandLink` 스타일: `textDecoration: none`, `color: inherit`, `cursor: pointer`.
- 모바일 사이드바: `onNavigate`로 메뉴 닫기 유지.

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` — **pass**

## 남은 위험

없음

## 다음 권장 작업

해당 없음
