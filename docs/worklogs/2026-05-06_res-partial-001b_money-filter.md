# RES-PARTIAL-001-B — 돈관리(지급 예정) 필터 UI 추가 (3일/이번주/이번달)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`resturant_os` 돈관리의 “지급 예정” 목록이 전체 pending만 나열되어 행동 우선순위(임박 순) 정리가 어렵다. PRODUCT §8-5의 필터 요구(3일/이번주/이번달)에 맞춰, 동일 데이터(단일 로드)를 기준으로 클라이언트 필터 UI를 추가한다.

## 관련 tasks.md ID

- RES-PARTIAL-001-B

## 수정 파일 목록

- `resturant_os/src/components/money/MoneyClient.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-06_res-partial-001b_money-filter.md`

## 변경 내용 요약

- “지급 예정” 목록에 **필터 칩 UI(3일/이번주/이번달)**를 추가했다.
- 서버 재조회 없이, 이미 로드된 `data.payments`를 기준일(cutoff)을 런타임 계산해 필터링한다.
- 상단 “지급 예정 N건” 카운트와 빈 상태(Empty State)는 필터 적용 결과(`visible`) 기준으로 표시한다.

## migration 여부

- 없음

## 테스트 결과

- linter: `resturant_os/src/components/money/MoneyClient.tsx` 진단 결과 오류 없음

## 남은 위험

- 필터 기준일 계산은 클라이언트의 `toISOString().slice(0,10)`을 사용한다. 서버(`getMoneyDashboard`)가 같은 방식으로 KPI를 계산하고 있어 일관성은 확보되나, 로컬 타임존/UTC 경계(자정)에서 UX 차이가 날 수 있다.
- “이번주”는 “이번 7일”로 구현되었다(서버 KPI 기준과 동일). 달력 주(월~일) 기준으로 바꾸려면 별도 정의가 필요하다.

## 다음 권장 작업

- `RES-PARTIAL-001-C/D`(거래처 미지급금 목록/드릴다운)로 진행해 돈관리 3화면 구조를 완성한다.

