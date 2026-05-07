# 2026-05-07 — Dashboard Visual Operating System Polish (v2)

## 목표

- `/dashboard`의 구조( CommandStrip / KPI / Queue / Quick Actions / 분석 격리 )는 유지
- “정보 페이지”가 아니라 **운영 센터**로 느껴지게 만드는 **visual hierarchy** 재정렬
- 핵심 키워드: **visual silence / spacing rhythm / queue dominance / KPI dominance / lightweight interaction**

## 범위 (중요)

- DB/데이터 로직 수정 없음
- Queue/KPI/CommandStrip 구조 유지
- Typography / spacing / depth / density / interaction polish 중심

## 핵심 변경

### QueueRow hierarchy 재정렬

- action 텍스트를 기본 상태에서 **muted**로 낮추고, hover/focus에서만 브랜드 컬러로 강조
- rowHint를 11px + 낮은 대비(opacity)로 약화
- groupLabel(urgent/today/backlog)을 uppercase/letter-spacing 강조에서 **조용한 divider 느낌**으로 변경
- empty 상태 padding 축소로 “리듬 끊김” 완화
- StatusBadge를 개별 스타일로 약화할 수 있도록 `StatusBadge`에 `className` prop 추가 후 Queue에서 soft 처리

### KPI dominance 강화

- KPI의 StatusBadge가 label 라인에서 경쟁하던 문제를 해결:
  - `KPIBlock.statusPlacement="below"`로 value 아래로 이동(시선 경쟁 제거)
- valueSize를 `lg`로 통일해 숫자 dominance 강화
- hint를 11px/약한 대비로 조정해 “배경 근거”화

### spacing rhythm 통일

- dashboard 전반 gap을 16/24 계열로 정렬 (`page` gap 24, grid/stack 16)

### Quick Actions 경량화

- 버튼마다 border로 분리되던 느낌을 제거:
  - 리스트 상단 divider + 각 row bottom divider 기반으로 “즉시 실행 패널” 톤으로 변경
  - hover만 배경 강조

### 분석 섹션 약화

- 분석 타이틀/메타의 대비를 낮춰 “배경 정보”로 위치를 조정

## 변경 파일

- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/dashboard/dashboard.module.css`
- `src/components/dashboard/DashboardQueueSection.tsx`
- `src/components/dashboard/DashboardQueueSection.module.css`
- `src/components/ui/KPIBlock.tsx`
- `src/components/ui/KPIBlock.module.css`
- `src/components/ui/StatusBadge.tsx`
- `docs/tasks.md`

## 테스트

- `npx tsc --noEmit`

## 남은 문제 / 다음

- Surface depth(패널 간 layer 차이)는 `Surface.inset` 등으로 더 미세 조정 여지 있음(그림자 남발 금지)
- 분석 카드의 “panel 안 card” 대비는 타이틀/보더 톤을 더 낮추는 추가 iteration 가능

