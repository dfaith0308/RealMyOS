# SUP-PARTIAL-001-B — 대시보드 KPI 카드 링크형(MVP) 처리

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

PRODUCT §6-1의 “돈 요약 KPI는 클릭 이동이 있어야 한다” 요구를 만족시키기 위해, 대시보드 KPI 4종 카드를 링크형으로 변경한다(로직 변경 없이 네비게이션만 추가).

## 관련 tasks.md ID

- SUP-PARTIAL-001-B
- SUP-PARTIAL-001

## 수정 파일 목록

- `src/app/(app)/dashboard/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-partial-001b_dashboard-kpi-links.md`

## 변경 내용 요약

- `KpiCard`에 `href` prop을 추가해 카드 전체를 클릭 가능한 링크로 변경했다.
- KPI 4종을 모두 `/customers`로 연결했다(MVP).

## migration 여부

- 없음

## 테스트 결과

- 미실행 — 이유: 본 작업 범위는 링크 추가(UI 변경)이며, 별도 수동 테스트를 수행하지 않음

## 남은 위험

- PRODUCT §6-1은 KPI 클릭 목적지를 `/ledger`, `/analytics`로 정의하나, 현행 라우트/정책에 맞춰 MVP로 `/customers`에 연결했다(후속 정합 필요).

## 다음 권장 작업

- `SUP-PARTIAL-001` 후속에서 KPI 목적지를 PRODUCT 정의대로 `/ledger`, `/analytics`로 정렬하거나, IA 결정을 `PRODUCT.md`/`tasks.md`에 확정 기록한다.

