# RES-PARTIAL-001-E — 돈관리 화면3(MVP) KPI 문구 정렬

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

PRODUCT.md §8-5 “자금 흐름(MVP)”의 표현 예시(“이번 주 약 X원 나갈 예정”, “이번 달 약 X원 나갈 예정”)에 맞춰, `resturant_os` 돈관리 화면의 KPI 텍스트를 **문구만** 정렬한다. (로직/계산/데이터 구조 변경 없음)

## 관련 tasks.md ID

- RES-PARTIAL-001-E

## 수정 파일 목록

- `resturant_os/src/components/money/MoneyClient.tsx`
- `resturant_os/src/app/(app)/money/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-06_res-partial-001e_money-kpi-text.md`

## 변경 내용 요약

- KPI 카드의 라벨/서브 문구를 PRODUCT §8-5 MVP 예시에 맞게 변경했다.
  - “이번 주 약 {금액} 나갈 예정이에요”
  - “이번 달 약 {금액} 나갈 예정이에요”
- 로직(금액 계산/필터링/조회) 변경 없음.
- 연결성 점검에서 발견된 `/money` 페이지 기본값 객체의 `supplier_balances` 누락을 보완했다.
  - `result.data ?? { ... }` 기본값에 `supplier_balances: []` 추가

## migration 여부

- 없음

## 테스트 결과

- linter: `resturant_os/src/components/money/MoneyClient.tsx`, `resturant_os/src/actions/money.ts`, `resturant_os/src/app/(app)/money/page.tsx` 진단 결과 오류 없음

## 남은 위험

- 금액 표시(`formatKRW`)가 이미 “약”의 의미(반올림/단위 축약)를 포함하지는 않으므로, “약”은 UX 표현으로만 사용된다.

## 다음 권장 작업

- `RES-PARTIAL-001-F`(레거시 `payments_outgoing` 주석)로 넘어가거나, 돈관리 화면의 문구 전반(타이트 경고/empty state)까지 PRODUCT 카피로 추가 정렬할지 범위를 확정한다.

