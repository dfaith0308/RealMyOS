# 식식이OS Design System (Phase 1 · 초안)

이 문서는 “화면 리디자인”이 아니라, 리디자인이 흔들리지 않도록 **단일 SSOT(Typescript) + CSS Variables** 기반의 최소 정의와 패턴(프리미티브 4종)을 고정하기 위한 초안입니다.

## 원칙
- 화면에서 **hex 직접 사용 금지**(Phase 2에서 단계적 제거).
- 포인트 컬러(딥그린)는 **상태/강조에만 사용**.
- 상태는 **색만으로 전달 금지**: 텍스트 + 형태(선 스타일/강조) + 우선순위.
- Side Panel 금지, 행 클릭 = 페이지 이동 유지.

## SSOT
- `realmyos/src/styles/design-system.ts`
  - `ds.brand / ds.neutral`: 기본 토큰
  - `ds.semantic`: 앱이 실제로 써야 하는 의미 토큰(문맥 기반)
  - `ds.density`: table/list 밀도(컴팩트/컴포터블)
  - `ds.status`: 상태 언어(텍스트/우선순위/강조/톤)

## CSS Variables 매핑
- `realmyos/src/app/globals.css`, `resturant_os/src/app/globals.css`
- 네임스페이스: `--ds-*`

## 상태 언어 (예시)
- `confirmed`: 텍스트 “확정” + strong emphasis(실선) + priority 2 + success tone
- `pending`: 텍스트 “대기” + normal emphasis(점선) + priority 1 + neutral tone
- `overdue`: 텍스트 “연체” + strong emphasis(실선) + priority 3 + danger tone

## 프리미티브 (최소 구현 4종)

### `Surface`
- 파일: `realmyos/src/components/ui/Surface.tsx`
- 목적: canvas/panel/card/raised 표준 배경/보더/패딩 규격

### `StatusBadge`
- 파일: `realmyos/src/components/ui/StatusBadge.tsx`
- 목적: 상태 언어 기반의 일관된 배지 (텍스트+형태)

### `DataTableRow`
- 파일: `realmyos/src/components/ui/DataTableRow.tsx`
- 목적: “운영 리스트/테이블”의 표준 row 인터랙션(hover/focus/숫자 정렬) 스켈레톤

### `KPIBlock`
- 파일: `realmyos/src/components/ui/KPIBlock.tsx`
- 목적: 숫자 우선 계층(탭ular-nums) + 상태/델타 표시 표준

## 사용 예시 (샘플)

```tsx
import { Surface } from '@/components/ui/Surface'
import { KPIBlock } from '@/components/ui/KPIBlock'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTableRow, DataCell } from '@/components/ui/DataTableRow'

export function Demo() {
  return (
    <Surface variant="panel" density="comfortable">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <KPIBlock label="미수금" value="₩12,340,000" status="overdue" hint="연체 포함" />
        <KPIBlock label="수금" value="₩8,120,000" delta={{ text: '+12%', tone: 'success' }} />
      </div>

      <div style={{ marginTop: 16, borderTop: '1px solid var(--ds-border-default)' }}>
        <DataTableRow asLink href="/customers/1" density="compact">
          <DataCell tone="primary">강남식자재</DataCell>
          <DataCell tone="secondary">최근 주문 2026-05-07</DataCell>
          <DataCell align="end">₩1,240,000</DataCell>
          <DataCell align="end">
            <StatusBadge status="pending" />
          </DataCell>
        </DataTableRow>
      </div>
    </Surface>
  )
}
```

