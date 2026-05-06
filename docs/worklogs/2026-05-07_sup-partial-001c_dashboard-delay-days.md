# SUP-PARTIAL-001-C — 수금 우선순위 TOP5에 지연일(D+N) 표시(MVP)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

PRODUCT §6-1의 “수금 우선순위 TOP5 표에 지연일 컬럼이 필요” 요구를 최소 비용으로 반영하기 위해, 운영 DB에 `due_date/promised_date`가 없는 현 상황에서 근사치 지연일을 런타임 계산으로 표시한다(RULE-02: DB 저장 금지 준수).

## 관련 tasks.md ID

- SUP-PARTIAL-001-C
- SUP-PARTIAL-001

## 수정 파일 목록

- `src/actions/dashboard.ts`
- `src/app/(app)/dashboard/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-partial-001c_dashboard-delay-days.md`

## 변경 내용 요약

- `DashboardData.top_customers`에 지연일 계산을 위한 필드 2개를 pass-through로 추가했다.
  - `days_since_order`
  - `payment_terms_days`
- 대시보드 TOP5 렌더링에서 다음 근사치로 지연일을 계산해 표시했다.
  - \(delayDays = days\_since\_order - payment\_terms\_days\)
  - `delayDays > 0`일 때만 `D+{delayDays}` 표시, 0 이하면 미표시
- 지연일은 **런타임 계산만** 수행하고 DB에 저장하지 않는다(RULE-02 준수).

## migration 여부

- 없음

## 테스트 결과

- `npx tsc --noEmit`: pass
- lint: pass

## 남은 위험

- 본 지연일은 PRODUCT의 `due_date/promised_date` 기반 정의가 아니라 “주문 경과 - 결제조건” 기반 근사치이다. 정확도 개선은 `due_date/promised_date` 모델 확정 후 별도 작업이 필요하다.

## 다음 권장 작업

- TOP5 표를 PRODUCT 컬럼 정의(미수금/지연일/우선순위 점수)로 맞추기 위해, 고객별 미수금/약속일/지연일을 정확히 산출하는 데이터 소스(원장/스케줄)를 확정한다.

