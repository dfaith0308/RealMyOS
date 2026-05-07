# 2026-05-07 UI/UX Design System Phase 1 (SSOT)

## 목적
- UI를 “색 덧칠”로 바꾸지 않고, 이후 Phase 2 화면 리디자인이 흔들리지 않도록 **Design System SSOT(Typescript) + CSS Variables** 구조를 먼저 고정한다.
- 상태(Status)는 **색만으로 전달하지 않는다**(텍스트 + 형태 + 우선순위).
- Side Panel 금지, 행 클릭=페이지 이동 유지.

## 범위 (이번 작업)
- `realmyos/src/styles/design-system.ts`: tokens/semantic/density/state language SSOT 정의
- `globals.css`(양 repo): `--ds-*` 네임스페이스로 CSS variables 매핑 추가
- 핵심 프리미티브 4종 최소 구현: `Surface`, `StatusBadge`, `DataTableRow`, `KPIBlock`
- UI 문제점 분석 문서 작성
- 화면 대규모 리디자인은 **미착수**(샘플/정의만)

## 변경 파일
### realmyos
- `src/styles/design-system.ts`
- `src/app/globals.css`
- `src/components/ui/Surface.tsx`
- `src/components/ui/StatusBadge.tsx`
- `src/components/ui/DataTableRow.tsx`
- `src/components/ui/KPIBlock.tsx`
- `docs/design-system-phase1.md`
- `docs/uiux-redesign-audit.md`

### resturant_os
- `src/app/globals.css`
- `src/styles/design-system.ts`
- `src/components/ui/Surface.tsx`
- `src/components/ui/StatusBadge.tsx`
- `src/components/ui/DataTableRow.tsx`
- `src/components/ui/KPIBlock.tsx`

## 설계 요점
- **SSOT는 TS**: 구조/이름/상태 언어/밀도 규칙을 TS에서 고정.
- **UI 사용은 CSS var**: 화면/컴포넌트는 `var(--ds-*)`로만 소비하도록 유도.
- **상태 언어**: `label(ko/en)`, `priority`, `emphasis(normal/strong)`, `tone(neutral/success/warning/danger)`로 고정.
  - 배지는 tone 컬러를 쓰되, **점선/실선**으로 emphasis를 구분해 “색만” 의존하지 않게 한다.

## 남은 리스크 / 다음 단계(Phase 2)
- 현재 화면에는 여전히 인라인 스타일/하드코딩 색상이 남아 있어, Phase 2에서 `--ds-*`로 단계적 교체가 필요.
- `resturant_os`의 모바일 운영 UX(큐 중심 Today, BottomNav 라벨/행동)도 Phase 2에서 구조적으로 재설계 필요.

