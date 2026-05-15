# RES-TODO-001 — PRODUCT 8-2/8-7 메뉴 구조 대비 라우트·기능 공백 분석

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

PRODUCT.md §8-2(식당OS 메뉴 구조) 및 §8-7(알림)을 기준으로, `resturant_os/src/app/(app)/`에 존재하는 라우트와 1:1로 매핑해 “현재 존재/부분/공백”을 확정한다. 오늘은 분석·문서화만 수행하고 실제 구현은 다음 세션으로 미룬다.

## 관련 tasks.md ID

- RES-TODO-001
- (연계) RES-PARTIAL-001 — 돈관리 하위 3메뉴 분리/정합

## 수정 파일 목록

- `docs/tasks.md`
- `docs/worklogs/2026-05-06_res-todo-001_menu-route-gap.md`

## 변경 내용 요약

- PRODUCT §8-2, §8-7의 화면/기능 목록을 정독했다.
- `resturant_os/src/app/(app)/` 라우트 트리를 전수 확인했다.
- PRODUCT 화면 목록 ↔ 현재 라우트의 1:1 매핑 표를 작성하고, 공백 항목을 확정했다.

## 확인된 라우트 트리 (resturant_os/src/app/(app))

- `/today`
- `/rfq`, `/rfq/new`, `/rfq/[id]`
- `/orders`, `/orders/[id]`
- `/money`
- `/suppliers`, `/suppliers/new`, `/suppliers/[id]`
- `/settings`, `/settings/ingredients`, `/settings/fixed-costs`, `/settings/restaurant`

## 1:1 매핑 표(캔버스)

- `C:\Users\babok\.cursor\projects\c-Users-babok-Desktop-realmyos\canvases\res-todo-001-menu-route-gap.canvas.tsx`

> 표가 길어서 채팅 본문 테이블 대신 캔버스로 제공한다. 일부 항목은 PRODUCT가 URL을 고정하지 않아 “가정 URL”로 표기했다.

## 공백(구현 필요) 항목

- **알림(§8-2, §8-7)**:
  - 알림 목록: `/notifications` (부재)
  - 중요 알림: `/notifications/important` (부재)
- **발주관리(§8-2) + 알림 액션 링크(§8-7)**:
  - 입찰 결과: `/orders/results` (부재)
  - 근거: §8-7에서 `rfq_result`의 `action_link`를 `/orders/results`로 정의
- **설정(§8-2)**:
  - “메뉴/가격 입력” 화면/라우트 (부재)
  - “거래 조건 설정” 화면/라우트 (부재)
  - URL 규약은 아직 확정되지 않아, 다음 세션 구현 전에 IA/URL을 먼저 결정해야 한다.
- **돈관리(§8-2)**:
  - “지급 예정 / 거래처 미지급금 / 자금 흐름” 3메뉴 분리 IA 필요
  - 단, 세부 분해는 `RES-PARTIAL-001`에서 진행 중이므로 본 worklog는 “메뉴 구조 공백”으로만 기록한다.

## migration 여부

- 없음

## 테스트 결과

- 미실행 — 문서 작업만 수행

## 남은 위험

- PRODUCT에서 “화면 구조”는 명확하지만 URL 규약은 일부 항목에서 고정되지 않았다. URL을 먼저 합의하지 않으면 라우팅/네비게이션이 산개할 수 있다.
- §8-7 알림은 “트리거 엔진” 성격이며, 단순 목록 화면만 만들어도 실제 행동 연동(오늘운영 카드 생성/해결)까지는 미달일 수 있다. 구현 시 범위를 더 쪼개서 진행 필요.

## 다음 권장 작업

- 다음 세션에서 우선순위를 다음과 같이 제안:
  1) `/orders/results` (rfq_result 알림의 action_link와 직접 연결되는 경로)
  2) `/notifications` (알림 목록) + 최소한의 읽음/필터(urgent/important/normal)
  3) 설정의 “메뉴/가격 입력”, “거래 조건 설정”은 IA/데이터모델과 함께 최소 기능부터 분해

