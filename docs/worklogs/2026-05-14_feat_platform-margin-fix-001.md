| 필드 | 값 |
|------|------|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

**PLATFORM-MARGIN-FIX-001**: 관리자 storefront KPI에서 `supplier_payables` **미지급(unpaid)** 과 **지급완료(paid)** 금액을 분리해 운영자가 “지금 줄 돈”과 “이미 지급한 돈”을 바로 읽게 한다. `platform_margin` 수치는 기존과 동일하되 공식을 `total_revenue − unpaid − paid`로 명시한다.

## 관련 `tasks.md` ID

- **[PLATFORM-MARGIN-FIX-001]**
- 연계: **[KPI-REVERSAL-P0-001]**, **[PAYABLE-PAYOUT-P1-001]**

## 수정 파일 목록

- `src/actions/admin/platform-revenue.ts`
- `src/components/commerce/StorefrontRevenueKpiSection.tsx`
- `docs/tasks.md`

## 변경 내용 요약

- `supplier_payable_unpaid` / `supplier_payable_paid` 집계·반환, `supplier_payable_total` = 둘의 합(legacy).
- `platform_margin = total_revenue - supplier_payable_unpaid - supplier_payable_paid`.
- UI: reversal 일·월 카드는 `grid2`, 그 아래 `grid3`로 공급자 미지급·지급완료·플랫폼 마진.

## migration 여부

없음.

## 테스트 결과

- `npx tsc --noEmit` — **pass** (exit 0).

## 남은 위험

- 집계는 기존과 동일하게 `PAY_FETCH_LIMIT` 상한 내 `supplier_payables` 행만 반영.

## 다음 권장 작업

- 운영에서 지급 완료 처리 후 미지급↓·지급완료↑·마진 불변인지 샘플 확인.

---

## SECTION 1: 사전 확인 결과

- `supplier_payable_total`는 `payablesRes` 루프에서 `unpaid`+`paid`만 합산(234–240행대).
- `platform_margin`은 `total_revenue - supplier_payable_total` 단일 차감이었음.
- 반환 타입 `StorefrontRevenueKPI`에 위 필드만 존재.
- `StorefrontRevenueKpiSection.tsx`는 `grid3`에 reversal 2 + 마진 1 배치.

## SECTION 2: payable analytics 분리

- 동일 쿼리 결과를 상태별로 `supplier_payable_unpaid` / `supplier_payable_paid`에 누적, `supplier_payable_total`은 합 유지.

## SECTION 3: platform_margin 계산

- `total_revenue - supplier_payable_unpaid - supplier_payable_paid` (기존 `− supplier_payable_total`과 수치 동일).

## SECTION 4: UI

- `grid2`: 오늘/이번달 reversal 금액.
- `grid3`: 공급자 미지급·공급자 지급완료·플랫폼 마진(부연: 순누계 − 미지급 − 지급완료).

## SECTION 5: 검증 결과

- cancelled 제외: 기존과 동일 `status in ('unpaid','paid')`만 처리.
- gross/net 경로: 변경 없음.
- TypeScript: 통과.

## SECTION 6: 남은 운영 transition debt

- **settlement ↔ payable** 여전히 미연결.
- **RFQ KPI** 미수정.
- **완전한 회계 P&L** 아님 — 운영 KPI 수준.

**PLATFORM-MARGIN-FIX-001**은 storefront 운영 KPI의 paid/unpaid payable 의미를 분리해 운영자가 실제 지급 상태를 명확히 이해할 수 있도록 하는 운영 정합 보정 작업이며, 완전한 회계 P&L 시스템 구현은 후속 범위입니다.
