# fix: Sidebar 중메뉴 복원 + 대시보드 색상 토큰 적용

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

UI/UX 1단계 적용 이후 발생한 두 가지 품질 문제(사이드바 서브메뉴 구조 누락, 글로벌 토큰이 실제 화면에 반영되지 않는 문제)를 해결하고, 로컬에서 `next build`가 정상 완료되는 상태를 회복한다.

## 관련 tasks.md ID

- 없음 (UI/UX 공통 개선/수정 — `tasks.md`의 `[OPS — AI worklog]` 작업 이력으로 기록)

## 수정 파일 목록

- `src/components/layout/Sidebar.tsx`
- `src/app/(app)/dashboard/page.tsx`
- `src/components/analytics/OverviewTab.tsx`
- `src/lib/analytics-export.ts`
- `docs/tasks.md`

## 변경 내용 요약

- **문제 1 (Sidebar 중메뉴 복원)**:
  - `git show HEAD~1` 기준으로 기존 MENU 그룹/서브메뉴 구조를 **그대로 복원**했다.
  - 디자인은 차콜/딥그린 브랜드 규칙(활성/hover 포함)을 유지했다.
  - 모바일 UX(라우트 변경 시 닫힘, ESC 닫힘)도 복원했다.
- **문제 2 (대시보드 색상 적용)**:
  - `dashboard/page.tsx`의 하드코딩된 `#fff/#111827/#e5e7eb/#9ca3af` 계열을 `var(--color-*)` 토큰으로 교체했다.
  - 주요 카드/섹션 배경은 `var(--color-bg-card)`로 통일, 기본 border는 `var(--color-border)`로 통일했다.
- **로컬 빌드 이슈 수정**:
  - `/analytics` 빌드 단계 오류 원인(서버 컴포넌트에서 `recharts` 사용)을 해결하기 위해 `OverviewTab`을 client component로 전환했다.
  - 엑셀 export 유틸(`analytics-export`)은 `xlsx` 타입 문제를 최소한의 범위로 정리했다.

## migration 여부

- 없음

## 테스트 결과

- `npm run build` (pass)
- `npx tsc --noEmit` (pass)

## 남은 위험

- 아직 다른 페이지들에 하드코딩 색상이 남아 있을 수 있어, 토큰 적용은 단계적으로 확장해야 한다.
- `analytics-export`의 `xlsx` 타입은 최소한으로만 맞춘 상태이며(다운로드 동작 우선), 타입을 더 엄격히 하려면 별도 정리가 필요하다.

## 다음 권장 작업

- `realmyos`의 주요 화면(원장/거래처/주문)의 카드/섹션 스타일도 동일 토큰으로 일괄 정리한다.
- `resturant_os`에도 동일 토큰 SSOT를 적용하고, 레이아웃/네비게이션을 같은 톤으로 맞춘다.

