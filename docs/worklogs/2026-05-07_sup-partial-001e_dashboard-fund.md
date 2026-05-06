# SUP-PARTIAL-001-E — 대시보드 자금 항목 상세(fund_rules 기반) 표시

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

대시보드의 “오늘 자금 계획” 블록이 합계(KPI)만 보여주는 수준이라, PRODUCT §6-1의 요구(자금 규칙 기반 분배 항목: 매입비/부가세 등) 대비 정보가 부족했다.  
오늘 생성된 자금 이체 계획(`fund_transfers`)을 규칙명(`fund_rules.rule_name`)과 함께 **항목별로 요약 표시**해 “어디로 얼마나 보내야 하는지”를 즉시 파악할 수 있도록 한다.

## 관련 tasks.md ID

- SUP-PARTIAL-001-E

## 수정 파일 목록

- `src/actions/dashboard.ts`
- `src/app/(app)/dashboard/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-partial-001e_dashboard-fund.md`

## 변경 내용 요약

- `DashboardData`에 `fund_items`를 추가했다.
  - `rule_name`, `planned_amount`, `actual_amount`, `status`
- `getDashboardData()`에서 `getDailyFundPlan()` 결과(`fund_transfers`)를 `fund_items`로 매핑해 반환했다. (대시보드 요약 목적상 최대 5개)
- 대시보드 “💰 오늘 자금 계획” 섹션에 `fund_items` 리스트를 추가했다.
  - 항목명(`rule_name`) + 계획금액(`planned_amount`) + 상태 배지(pending/partial/overdue/completed) 표시

## migration 여부

- 없음

## 테스트 결과

- `npx tsc --noEmit` (pass)

## 남은 위험

- 대시보드는 `fund_transfers` 생성 여부에 의존한다. 당일 계획이 생성되지 않았거나 비활성 규칙만 있으면 항목 리스트가 비어 보일 수 있다.
- 상태(`status`) 문자열은 `fund_transfers`의 실제 enum/제약과 UI 매핑이 어긋나면 배지 톤이 기대와 다를 수 있다(현 코드의 상태값: pending/completed/partial/overdue 기준).

## 다음 권장 작업

- 항목 리스트에 `actual_amount`(이행액)도 함께 노출하거나, “계획 대비 이행률” 표시를 추가해 운영 피드백을 강화한다.
- “오늘 자금 배치 제안”의 PRODUCT 블록 요구(가용 자금 = 잔액 + TOP3 수금예정 등)까지 확장하려면, 계좌 잔액/수금예정 집계와 함께 1블록으로 정합한다.

