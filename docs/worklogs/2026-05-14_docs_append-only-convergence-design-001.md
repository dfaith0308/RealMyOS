# APPEND-ONLY-CONVERGENCE-DESIGN-001 — append-only 수렴 설계 문서

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

`payments`에 공존하는 **INSERT 상쇅(storefront)** vs **`reverse_disbursement` UPDATE `reversed`(outbound)** 및 **`cancelPayment` UPDATE(inbound)** 를 **[D-021]/[D-022]/[D-023]** 에 맞추어 장기 **append-only 단일 방향**으로 수렴시키는 설계를 문서화한다. 구현은 하지 않는다.

## 2. 관련 `tasks.md` ID

**[APPEND-ONLY-CONVERGENCE-DESIGN-001]** — 연계: **[D-021]**, **[D-022]**, **[D-023]**, **[ACCOUNTING-LIFECYCLE-DESIGN-001]**, **[ACCOUNTING-LIFECYCLE-POLICY-001]**, **[PAYMENTS-TAXONOMY-DESIGN-001]**, **[ACCOUNTING-EVENT-MODEL-001]**, **`[PLATFORM-ERP-001]`**, **[ACCOUNTING-REVERSAL-P0-001]**, **[KPI-REVERSAL-P0-001]**

## 3. 수정 파일 목록

- `docs/APPEND-ONLY-CONVERGENCE-DESIGN-001.md` — SECTION 1~11
- `docs/tasks.md` — 문서 34번·OPS·Epic·`[ACCOUNTING-LIFECYCLE-POLICY-001]`·`[ACCOUNTING-EVENT-MODEL-001]` 연계
- `docs/worklogs/2026-05-14_docs_append-only-convergence-design-001.md` — 본 파일

## 4. 변경 내용 요약

- 사전 확인: RPC·`commerce-reversal`·`cancelPayment`·migration·KPI·taxonomy 사실만 기재; **`type` NULL 비율은 DB 미조회로 명시**.
- 권장: outbound 전환 **방식 C**(신규 경로 + 점진 deprecate)·`reverse_disbursement` 4단계 제거 순서·transition debt 표.

## 5. migration 여부

**없음**

## 6. 테스트 결과

해당 없음(문서만).

## 7. 남은 위험

- 병행 기간 중 집계·운영 혼선.
- `purchases.status` 재계산 규칙 변경 시 회귀 범위 큼.

## 8. 다음 권장 작업

- P1: 신규 outbound reversal RPC 설계 승인·스테이징 검증.
