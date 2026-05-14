# ACCOUNTING-LIFECYCLE-DESIGN-001 — settlement/payout/reversal lifecycle 설계 문서

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

`settlement`·`payout`·`supplier_payables`·`reversal`·KPI가 코드에서 실제로 어떻게 동작하는지 **저장소 기준으로만** 확인한 뒤, 통합 accounting lifecycle 의미·finality·cutoff·reversal depth에 대한 **설계 문서**(`docs/ACCOUNTING-LIFECYCLE-DESIGN-001.md`)를 작성한다. 구현은 하지 않는다.

## 2. 관련 `tasks.md` ID

**[ACCOUNTING-LIFECYCLE-DESIGN-001]** — 연계: **[D-021]**, **[D-022]**, **[PAYMENTS-TAXONOMY-DESIGN-001]**, **[PAYMENTS-TAXONOMY-POLICY-001]**, **[ACCOUNTING-EVENT-MODEL-001]**, **[ACCOUNTING-REVERSAL-DESIGN-001]**, **`[PLATFORM-ERP-001]`**, **[ACCOUNTING-REVERSAL-P0-001]**, **[KPI-REVERSAL-P0-001]**

## 3. 수정 파일 목록

- `docs/ACCOUNTING-LIFECYCLE-DESIGN-001.md` — 신규(SECTION 1~13)
- `docs/tasks.md` — 문서 사용법 32번·OPS·**`[PLATFORM-ERP-001]`** 작업 이력·**[ACCOUNTING-EVENT-POLICY-001]** 연계·Epic **`[ACCOUNTING-LIFECYCLE-DESIGN-001]`**
- `docs/worklogs/2026-05-14_docs_accounting-lifecycle-design-001.md` — 본 파일

## 4. 변경 내용 요약

- SECTION 1: `settlement-control.ts`, `commerce-*`, `platform-revenue.ts`, `payment.ts`, 관련 migration 사실 표로 정리.
- SECTION 2~10: 옵션 비교·권장안·흐름도·append-only 호환성·KPI·finality.
- SECTION 11~13: migration **목록만**·P0/P1/P2·인간 결정 목록.

## 5. migration 여부

**없음** — migration 파일 추가·실행 없음.

## 6. 테스트 결과

해당 없음(문서만).

## 7. 남은 위험

- 권장 semantics는 **정책 승인 전**까지 운영 단일 기준으로 쓰이지 않을 수 있음.
- `supplier_payables.paid` 경로 부재·RFQ settlement와 storefront 축 분리는 **마진 KPI 왜곡** 가능.

## 8. 다음 권장 작업

- §13 인간 결정 항목 확정 후 P1 구현 범위를 Epic으로 쪼개기.
- `settlement_cycle_days` vs 자동 추천 **30일** 코드 불일치 정합(별 턴·승인).
