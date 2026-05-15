# ACCOUNTING-LIFECYCLE-POLICY-001 — lifecycle 정책 확정 ([D-023])

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

settlement / payout / `supplier_payables.paid` / reversal chain / outbound `UPDATE reversed` 에 대해 **정책 닫기(policy closure)** 를 수행한다. **[D-023]** 으로 finality·transition debt·P1 수렴 순서를 고정하고, `PRODUCT`·`CONTEXT`·`tasks`에 반영한다.

## 2. 관련 `tasks.md` ID

**[ACCOUNTING-LIFECYCLE-POLICY-001]** — 연계: **[ACCOUNTING-LIFECYCLE-DESIGN-001]**, **[ACCOUNTING-EVENT-MODEL-001]**, **[PAYMENTS-TAXONOMY-DESIGN-001]**, **[D-021]**, **[D-022]**, **`[PLATFORM-ERP-001]`**

## 3. 수정 파일 목록

- `docs/DECISIONS.md` — **[D-023]**
- `docs/PRODUCT.md` — §10-9 settlement/payout lifecycle 절
- `docs/CONTEXT.md` — lifecycle finality · UPDATE reversed transition debt · settlement≠paid · 한계
- `docs/tasks.md` — 문서 33번·OPS·Epic·`[ACCOUNTING-LIFECYCLE-DESIGN-001]` 연계·`[PLATFORM-ERP-001]` 작업 이력·`[ACCOUNTING-EVENT-MODEL-001]` 연계
- `docs/worklogs/2026-05-14_docs_accounting-lifecycle-policy-001.md` — 본 파일

## 4. 변경 내용 요약

- Q1 `paid` = 자금 사실 finality; Q2 settlement row 불변·조정은 별 이벤트; Q3 P1 outbound append-only 전환.
- 최종 원칙 6개 및 [D-021]/[D-022]/[D-023] 역할 분담 명시.

## 5. migration 여부

**없음**

## 6. 테스트 결과

해당 없음(문서만).

## 7. 남은 위험

- KPI·코드가 정책 전환 전까지 **transition state** 유지 — 오해 시 운영 판단 오류 가능.

## 8. 다음 권장 작업

- P1: payable `paid`·payout 이벤트·`reverse_disbursement` append-only 이행(별 승인).
