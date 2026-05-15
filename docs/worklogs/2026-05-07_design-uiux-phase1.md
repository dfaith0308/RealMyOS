# UI/UX 전면 개선 1단계 (브랜드 토큰 + Sidebar + Layout)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

식식이OS의 UI/UX를 “ERP스러운 투박함 없이” **정보 밀도는 높게**, **숫자/상태는 더 명확하게** 보이도록 만들기 위한 1단계로, 공통 색상 토큰을 SSOT로 고정하고 공급자OS(`realmyos`)의 Sidebar/레이아웃 기본 골격을 정돈했다.

## 관련 tasks.md ID

- 없음 (디자인/브랜딩 공통 작업이므로 `tasks.md`의 `[OPS — AI worklog]` 섹션에 작업 이력으로 기록)

## 수정 파일 목록

- `src/app/globals.css`
- `src/components/layout/Sidebar.tsx`
- `src/app/(app)/layout.tsx`
- `docs/tasks.md`

## 변경 내용 요약

- **브랜드 컬러 토큰 SSOT**를 `globals.css`에 반영했다.
  - `--color-primary/#1f5d3a`, `--color-bg/#f7f6f2`, `--color-text/#2b2b2b` 등 “절대 변경 금지” 값을 그대로 유지
  - 기본 `font-family`: `'Pretendard', 'Inter', -apple-system, sans-serif`
  - 기본 `font-size: 14px`, `line-height: 1.5`
- **Sidebar 전면 재작성**
  - 배경 `#2b2b2b`(차콜), 기본 텍스트 `#f7f6f2`
  - 활성 메뉴: `#1f5d3a` 배경 + `#ffffff` 텍스트
  - hover: `rgba(255,255,255,0.08)`
  - 아이콘 제거(텍스트 중심, Linear 스타일), 폭 200px, 하단 로그아웃 버튼 포함
- **(app) 레이아웃 정리**
  - 전체 배경 `#f7f6f2`
  - 콘텐츠 영역 `padding: 32px`, `max-width: 1280px`

## migration 여부

- 없음

## 테스트 결과

- `npx tsc --noEmit` (pass)

## 남은 위험

- 현재는 `realmyos` 중심 1단계 적용이며, `resturant_os` 공통 토큰 적용/레이아웃 정리는 다음 단계로 이어져야 한다.
- 기존 페이지별 인라인 스타일이 많아, 토큰 적용을 확장하기 전까지 화면별 톤이 일부 혼재될 수 있다.

## 다음 권장 작업

- `resturant_os`에도 동일한 브랜드 토큰을 반영하고, 공통 레이아웃(네비게이션/컨테이너)부터 정렬한다.
- `realmyos` 주요 화면(대시보드/원장/analytics)의 테이블·KPI 컴포넌트를 토큰 기반으로 점진적 정리해 “촌스러운 ERP 느낌”을 제거한다.

