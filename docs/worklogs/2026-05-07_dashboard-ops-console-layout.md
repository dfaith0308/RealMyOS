# 2026-05-07 Dashboard — 운영 콘솔 구조(2열 Queue 중심)

## 목적
- Dashboard를 “KPI 카드 모음”이 아니라 **운영 우선순위 중심(Queue 주인공)** 구조로 재설계한다.
- 데이터/DB/서버 액션 로직(`getDashboardData`, `getTodayCollections`)은 **수정하지 않는다**.
- 스타일은 인라인/하드코딩 없이 **`--ds-*` CSS 변수 + CSS Module**로만 구성한다.

## 핵심 UX 변경
- **상단 Full width**: `CommandStrip`
  - 핵심 경고 1줄 + 즉시 행동 2개 버튼
  - 기존 “AI 한마디” 별도 섹션 제거 → CommandStrip 내부로 통합(Suspense 유지)
- **메인 2열**
  - **Left(60%)**: `DashboardQueueSection` — `urgent / today / backlog` 3단 큐
  - **Right(40%)**: KPI(숫자 계층) + Quick Actions
- **하단 Full width**: P3 분석 영역(거래처/상품 TOP) — “있으면 참고”로 격리

## 구현 메모
- **Queue Row**: `DataTableRow` + `StatusBadge` + 숫자(우측정렬) + “다음 행동” 텍스트를 고정.
- **KPI**: `KPIBlock` 중심으로 숫자 대비/계층을 확보.
- **금지 준수**: Dashboard 및 신규 컴포넌트에서 인라인 스타일 제거, 이모지 사용 최소화.

## 변경 파일
### 신규
- `src/components/dashboard/CommandStrip.tsx`
- `src/components/dashboard/CommandStrip.module.css`
- `src/components/dashboard/DashboardQueueSection.tsx`
- `src/components/dashboard/DashboardQueueSection.module.css`
- `src/app/(app)/dashboard/dashboard.module.css`
- `src/app/(app)/dashboard/loading.module.css`

### 수정
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/dashboard/loading.tsx`
- (프리미티브 인라인 스타일 제거)
  - `src/components/ui/Surface.tsx` + `Surface.module.css`
  - `src/components/ui/StatusBadge.tsx` + `StatusBadge.module.css`
  - `src/components/ui/DataTableRow.tsx` + `DataTableRow.module.css`
  - `src/components/ui/KPIBlock.tsx` + `KPIBlock.module.css`
- `src/app/globals.css` (`--ds-shadow-subtle` 추가)

## 검증
- `npx tsc --noEmit` 통과

## 남은 UX 문제 / 다음 단계 제안
- Queue row의 “다음 행동”을 텍스트가 아니라 **명시적 1차/2차 액션**으로 분리(단, 링크 중첩 구조 주의)
- `getDashboardData`에 “수금 속도” 정식 KPI를 제공할지(Phase 7/Analytics 연계) 결정 필요
- 다음 추천 화면: **Customers 목록**을 Queue 기반 Row list로 재설계(연체/미수/다음 행동 중심)

