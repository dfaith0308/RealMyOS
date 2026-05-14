# worklog — KPI-REVERSAL-P0-001 storefront reversal-aware KPI

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

`getStorefrontRevenueKPI`가 **원본 입금(confirmed, `reversal_of_id` null)** 만 gross로 보고, **reversal 행(`reversal_of_id` not null)** 을 같은 `amount`(양수)로 합산한 뒤 **차감해 net**으로 표시하도록 바꾼다. `platform_margin`·recent 목록의 reversal 구분을 추가하고, **RFQ·`getPlatformRevenue`·settlement-control은 변경하지 않는다.**

## 관련 `tasks.md` ID

- **[KPI-REVERSAL-P0-001]** (신규)
- **[PLATFORM-ERP-P1-001]**, **[ACCOUNTING-REVERSAL-P0-001]**, **[D-021]** 연계

## 수정 파일 목록

| 경로 | 역할 |
|------|------|
| `src/actions/admin/platform-revenue.ts` | gross/reversal 이중 조회·메모리 집계·payable 합·반환 필드 확장 |
| `src/components/commerce/StorefrontRevenueKpiSection.tsx` | 순매출·취소 금액·마진 카드·recent 테이블 |
| `docs/tasks.md` | ID·문서 사용법·OPS·Epic·ACCOUNTING-REVERSAL-P0 비범위 정리 |
| `docs/worklogs/2026-05-14_feat_kpi-reversal-p0-001-storefront-net.md` | 본 로그 |

## 변경 내용 요약

- **Gross**: `commerce_order_id` NOT NULL, inbound, payee=플랫폼, `status=confirmed`, `reversal_of_id IS NULL`.
- **Reversal 금액**: 동일 storefront 필터에 `reversal_of_id IS NOT NULL` (status에만 의존하지 않음).
- **Net**: 일·월·누계 각각 `gross − reversal`; `today_revenue` 등 기존 필드명은 **net 의미로 유지**.
- **`supplier_payable_total`**: 테이블 CHECK상 `unpaid`·`paid` 만 존재 → **`status IN ('unpaid','paid')`** 의 `payable_amount` 합( `cancelled` 제외). 스키마에 `confirmed` status 없음(요청 문구와 불일치 → 코드 기준으로 `unpaid`+`paid` 채택).
- **`platform_margin`**: `total_revenue`(net) − `supplier_payable_total` (운영 KPI P0).
- **`reversal_count`**: reversal 조회 결과 건수(상한 `PAY_FETCH_LIMIT`와 동일 표본).
- **recent_payments**: `is_reversal`, `reversal_reason`, `reversal_of_id` 추가; 조회는 `reversal` OR `(confirmed AND reversal null)`.

## migration 여부

없음.

## 테스트 결과

- `npx tsc --noEmit` — pass.

## 남은 위험

- payments·payables 각각 **50,000행 상한** 초과 시 합계·건수 왜곡.
- `platform_margin`은 **전 기간 net vs 현재 unpaid+paid payable 스냅샷**이라 시점 정합은 완전 forensic 수준 아님.

## 다음 권장 작업

- 운영 데이터 규모에 맞춘 집계 쿼리(RPC/SQL aggregate) 또는 기간 필터 payables.

---

## SECTION 1 — 사전 확인 결과

1. **기존 `getStorefrontRevenueKPI`**: `base()` = confirmed만; `recentBase()` = `status <> 'reversed'`; reversal row(`reversed`)는 매출 합계에서 제외되어 **취소 후 gross 과대** 가능.
2. **`getPlatformRevenue`**: `orders` + `payments.type=settlement'` 만 사용 — **storefront `commerce_order_id` KPI와 무관**, 이번 미수정.
3. **reversal row**: `reversal_of_id` NOT NULL, 일반적으로 `status='reversed'`, amount 양수.
4. **`supplier_payables`**: status는 `unpaid|paid|cancelled` — “confirmed” 명칭은 allocation 측; payable 합산은 **`unpaid`+`paid`** 로 해석.

## SECTION 2 — KPI 집계 방식 변경

- 매출 KPI 필드(`today_revenue` 등)를 **net**으로 변경; gross·reversal·`supplier_payable_total`·margin을 **별도 필드**로 노출.

## SECTION 3 — gross / net / reversal

- 메모리에서 `payment_date`(KST 문자열)로 일·월·전체 구간 합산.
- `amount`는 DB 양수 유지, 집계 시 **뺄셈만**으로 reversal 반영.

## SECTION 4 — platform_margin

- `total_revenue`(누계 net) − `supplier_payable_total` (`unpaid`+`paid`, 상한 50k).

## SECTION 5 — recent_payments

- 최근 10건: 입금(confirmed·원본) + reversal 행 포함.
- UI: 구분 badge, `reversal_of_id`·`reversal_reason` 열.

## SECTION 6 — UI

- `/admin/commerce/orders` 상단: 순매출 카드 부제에 gross−reversal, 취소 금액 2카드, 마진 1카드, 채널 표는 storefront **net** 사용.

## SECTION 7 — settlement-control 영향

- **변경 없음.** `getPlatformRevenue`는 RFQ `orders`·settlement `payments`만 사용.

## SECTION 8 — append-only aggregation

- 원본 `payments` row는 수정하지 않고, **별도 row 집계 + 차감**으로만 net 산출(RULE-02: 결과만 응답에 실시간 반영).

## SECTION 9 — limitation

- settlement KPI **미변경** · RFQ KPI **미변경** · refund automation **미구현** · partial reversal **미구현** · reverse-ledger 완전 accounting **미구현** · margin 완전 forensic·시점 정합 **미구현** · KPI는 **storefront append-only P0 수준**.

**현재 KPI는 append-only reversal을 이해하는 P0 수준이며, 완전한 reverse-ledger financial reporting은 P1/P2 범위이다.**
