# collection_allocations + allocate_payment_fifo 연동 (FIFO 수금 배분 + 평균결제기간 정확화)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

inbound 수금(`payments`)을 주문(`orders`)에 매핑해, FIFO 자동배분을 통해 “평균결제기간”을 근사치가 아닌 **배분 기반**으로 계산할 수 있게 한다.

## 관련 tasks.md ID

- `SUP-TODO-004-C-4`

## 수정 파일 목록

- `src/actions/payment.ts`
- `src/actions/analytics.ts`
- `src/components/analytics/CustomerTab.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_collection-allocations-fifo.md`

## 변경 내용 요약

- 수금 등록(`createPayment`)에서 `create_payment_atomic` 성공 후, **best-effort**로 `allocate_payment_fifo(p_tenant_id, p_payment_id)` RPC를 호출해 FIFO 배분을 자동 수행.
  - 배분 실패 시에도 수금 자체는 성공 유지.
- 매출분석 거래처 KPI의 평균결제기간을 `collection_allocations` 기반으로 계산하도록 교체.
  - 데이터가 없으면 기존 근사치(거래처별 마지막 수금일 - 마지막 주문일)로 fallback.
- UI에서 “(근사)” 표기를 제거하고, 힌트를 “수금 배분(FIFO) 기준”으로 변경.

## migration 여부

- 없음 (DB 적용은 별도 완료됨)

## 테스트 결과

- `npx tsc --noEmit` (pass)

## 남은 위험

- `collection_allocations`가 신규 수금부터 채워지므로, 초기 기간에는 fallback 근사치가 섞일 수 있다.
- 현재 평균은 “allocation row 단위의 단순 평균(일수)”이다. `allocated_amount` 가중 평균이 더 정확할 수 있음(후속 개선 후보).

## 다음 권장 작업

- 평균결제기간을 `allocated_amount`로 가중 평균(가중치=배분 금액)으로 개선 검토.
- `allocate_payment_fifo`의 결과를 앱 로그/관리자 로그로 남기거나, 실패 시 관측 가능한 경로(알림/로그)를 마련한다.

