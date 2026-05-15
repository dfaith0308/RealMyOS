# SUP-TODO-004-C-2 analytics 라인차트(recharts) 도입

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

PRODUCT §6-11의 매출분석(Overview) 요구사항 중 “일자별 매출/원가/마진 라인차트”를 구현하기 위해, `recharts`를 도입하고 `OverviewTab`의 기존 CSS 막대 시각화를 라인차트로 대체한다.

## 관련 tasks.md ID

- `SUP-TODO-004-C-2`

## 수정 파일 목록

- `package.json` / `package-lock.json` (recharts 설치)
- `src/components/analytics/OverviewTab.tsx` (LineChart 적용, CSS 막대 제거)
- `docs/tasks.md` (ID 완료 처리)
- `docs/worklogs/2026-05-07_sup-todo-004c2_recharts.md` (본 로그)

## 변경 내용 요약

- `recharts` 설치 후, `OverviewTab`의 “일자별 매출/원가/마진” 섹션에 `ResponsiveContainer` + `LineChart`를 추가.
- X축은 `date`, 라인은 3개를 사용:
  - `revenue` (파랑 `#2563EB`)
  - `cost` (회색 `#6B7280`)
  - `margin` (초록 `#16A34A`)
- Y축/Tooltip 표시는 기존 포맷 함수 `formatKRW`를 그대로 사용.
- 차트 높이는 240px로 고정.
- 기존 “매출 분포” CSS 막대(테이블 기반 시각화)는 제거.

## migration 여부

- 없음

## 테스트 결과

- `npx tsc --noEmit` (pass)

## 남은 위험

- 현재는 `by_date`의 원시 값을 그대로 시각화한다(일자 라벨 밀집/회전, 통화 단위 축 약식 표기 등 UX 개선 여지 있음).
- 차트가 추가되면서 번들 크기가 증가할 수 있다(필요 컴포넌트만 import 하도록 제한했음).

## 다음 권장 작업

- 날짜가 길어질 때 X축 tick 간격/회전/축 라벨 단축(예: `MM-DD`) 적용을 검토한다.
- 전기간 비교 라인(이전 기간 revenue/cost/margin)까지 필요하면 `by_date_prev` 같은 구조를 액션에서 제공하고 멀티라인로 확장한다.

