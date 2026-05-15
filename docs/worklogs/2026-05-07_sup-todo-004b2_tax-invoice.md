# SUP-TODO-004-B-2 세금계산서 로직(MVP, 수금 기준) 추가

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

PRODUCT §6-10의 세금계산서 로직 요구(카드 제외, 혼합 결제 시 카드 제외분만 대상)를 **MVP로 수금 기준**에서 충족하기 위해, 거래처 원장 화면에 기간 내 수금 결제수단별 합계를 요약해 보여준다.

## 관련 tasks.md ID

- `SUP-TODO-004-B-2`

## 수정 파일 목록

- `src/actions/ledger.ts`
- `src/app/(app)/customers/[id]/ledger/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-todo-004b2_tax-invoice.md`

## 변경 내용 요약

- `getCustomerLedger` 반환에 `tax_summary`를 추가했다(런타임 계산, DB 저장 없음).
  - `taxable_paid`: `payment_method in ('cash','transfer')`인 수금 합계
  - `card_paid`: `payment_method = 'card'`인 수금 합계
  - `invoice_amount`: `taxable_paid`와 동일
- 거래처 원장 페이지 상단에 “세금계산서 요약(수금 기준, 기간)” 박스를 추가했다.
  - `tax_summary`가 전부 0이면 미표시

## migration 여부

- 없음

## 테스트 결과

- `npx tsc --noEmit` (pass)

## 남은 위험

- 본 MVP는 “주문 단위로 공급가/부가세를 결제수단별로 분리”하지 못한다. 현재 스키마/조회 구조상 결제(수금)와 주문을 정확히 배분 매칭하기 어렵기 때문이며, 정확한 분리는 `payment_allocations` 등 매핑 데이터가 필요하다.
- `platform` 등 기타 결제수단이 존재할 경우 본 MVP는 과세/카드 집계에서 제외된다(정책 확정 필요).

## 다음 권장 작업

- 세금계산서 발행 실무 기준에 맞춰 결제수단 enum/정책(`platform` 포함 여부)을 확정하고, 집계 범주를 문서화한다.
- 주문↔수금 배분이 필요해지면 `payment_allocations` 기반으로 주문의 공급가/부가세를 결제수단별로 정확히 분리하는 후속 작업을 설계한다(단, DB 변경은 별 승인/별 Phase).

