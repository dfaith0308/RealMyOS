# hotfix — 대시보드 거래처 매출 TOP5 금액 0원 표시

## 작업 목적

대시보드 "거래처 매출 TOP5 (이번달)"에서 거래처명은 보이나 매출 금액이 0원으로 집계되는 버그 수정.

## 관련 tasks.md ID

- `SUP-PARTIAL-001` (대시보드 거래처 매출 TOP5)
- `SUP-PARTIAL-001-F` (거래처 매출 집계)

## 수정 파일 목록

- `src/actions/dashboard.ts`

## 변경 내용 요약

- `resolveDashboardOrderAmount()` 추가: `final_amount`가 0/null이면 `total_amount`, 그래도 0이면 `order_lines.line_total` 합계 사용 (매출분석 `analytics-calc`와 동일 SSOT).
- 이번달 주문 조회에 `order_lines(line_total)` 포함.
- `top_customer_sales`·`monthly_sales` 집계에 `effectiveOrderAmount` 대신 위 헬퍼 적용.

## migration 여부

없음.

## 테스트 결과

- `dashboard.ts` 타입·로직: 로컬 `tsc` 대시보드 관련 오류 없음.
- `main` 브랜치 전체 `npm run build`: **실패** — `payment.ts` `'use server'` export const(기존), `/automation/*` prerender 오류(기존). 이번 변경과 무관.

## 남은 위험

- `ledger-calc.effectiveOrderAmount`는 여전히 `final_amount === 0` 시 `total_amount` 미사용 — 원장·기타 화면은 별도 정합 필요할 수 있음.
- `main` CI 빌드가 automation/prerender·payment export 이슈로 깨질 수 있음.

## 다음 권장 작업

- `main` 빌드 복구: `PAYOUT_OUTBOUND_REVERSAL_BLOCKED_ERROR`를 `lib/payments/constants.ts`로 분리(dev와 동일), automation 페이지 prerender 수정.
- 필요 시 `effectiveOrderAmount` 전역 정합(0 vs null semantics).
