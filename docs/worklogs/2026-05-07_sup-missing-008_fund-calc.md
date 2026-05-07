# 2026-05-07 — SUP-MISSING-008 자금관리 계산 정확도 개선

## 목표

- PRODUCT §6-12 자금관리 산식 정합
- 영업일(평일) 기반 daily_amount 계산으로 계획 금액 정확화
- `fund_transfers.carry_over_amount` 기반 부족금 이월 로직 구현
- migration 없이 로직만 수정

## 변경 내용

### 1) 영업일수 계산 + daily_amount 산식 수정

- 파일: `src/actions/fund.ts`
- 영업일수: 해당 월 1일~말일 중 **토/일 제외**
- daily_amount:
  \[
  \text{daily\_amount} = \left\lfloor \frac{\text{monthly\_sales} \times \text{ratio}}{\text{business\_days}} \right\rfloor
  \]
  - fixed 규칙도 동일하게 \(\lfloor \frac{\text{monthly\_fixed}}{\text{business\_days}} \rfloor\)
  - **소수점 버림**(기존 round → floor)
- 반영 위치:
  - `generateDailyFundPlan` (실제 계획 생성)
  - `getFundPreview` (설정 화면 미리보기)

### 2) carry_over(부족금 이월) 로직 구현

- 파일: `src/actions/fund.ts`
- 오늘 필요금액:
  - `required = planned_amount + carry_over_amount`
- 이체 완료 처리(`completeFundTransfer`):
  - `actual_amount >= required` → `completed`, `carry_over_amount = 0`
  - 그 외 → `pending/partial` 유지
  - 미이행 금액 `carryForward = required - actual_amount`를 **다음날 동일 account+rule의 carry_over_amount에 누적**
    - 다음날 행이 없으면 최소 행을 생성(planned_amount=0) 후 carry_over만 기록

### 3) UI 요약/입력 placeholder 정합

- 파일: `src/components/fund/FundsClient.tsx`
- “오늘 계획/미이행” 계산에서 `carry_over_amount`를 포함하도록 수정
- 입력 placeholder도 `planned + carry_over` 기준으로 표시

## 테스트

- `npx tsc --noEmit`

