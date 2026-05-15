# SUP-PARTIAL-001-A — 대시보드 블록1(지금 해야 할 행동) MVP 추가

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

PRODUCT §6-1의 블록1 “오늘 행동/알림”이 대시보드 최상단에 존재하도록, 기존 데이터(`total_receivable`, `ai_context`)를 재활용한 MVP 블록을 추가한다.

## 관련 tasks.md ID

- SUP-PARTIAL-001-A
- SUP-PARTIAL-001

## 수정 파일 목록

- `src/actions/dashboard.ts`
- `src/app/(app)/dashboard/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-partial-001a_dashboard-block1.md`

## 변경 내용 요약

- `fallbackMessage(d.ai_context)`를 대시보드에서 재사용할 수 있도록 `export`로 노출했다(로직 변경 없음).
- 대시보드 최상단(AI 인사이트 위)에 블록1을 추가했다.
  - 메시지: `fallbackMessage(d.ai_context)`
  - 미수금 총액: `formatKRW(d.total_receivable)`
  - 링크: `/customers`
  - Empty state: `total_receivable === 0`이면 “오늘 처리할 수금이 없습니다”

## migration 여부

- 없음

## 테스트 결과

- 미실행 — 이유: UI 변경이며 본 작업 범위에서 로컬 실행/수동 테스트를 수행하지 않음

## 남은 위험

- PRODUCT §6-1 블록1의 클릭 이동은 `/ledger`로 정의되어 있으나, 본 MVP는 현재 페이지 링크 정책에 맞춰 `/customers`로 연결했다(후속 정합 필요).
- AI 인사이트 박스와 블록1의 메시지 역할이 겹칠 수 있어(행동 문구 2개), 후속에서 우선순위/표현 조정이 필요하다.

## 다음 권장 작업

- `SUP-PARTIAL-001-B/C` 진행 시 블록2 표 컬럼/강조와 KPI 카드 링크(`/ledger`, `/analytics`)를 함께 정합하고, 블록1 클릭 이동을 `/ledger`로 통일할지 결정한다.

