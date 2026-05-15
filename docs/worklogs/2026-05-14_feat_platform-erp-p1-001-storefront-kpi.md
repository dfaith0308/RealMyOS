| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

P0로 `commerce_orders` → `payments` 연결 후에도 관리자OS에서 storefront 매출이 보이지 않던 문제를 해소한다. **storefront 매출 가시화** 범위만 구현한다 (supplier payable / allocation / settlement automation 비범위).

## 관련 `tasks.md` ID

- **PLATFORM-ERP-P1-001** (`[PLATFORM-ERP-001]` Epic 하위 실행)

## 수정 파일 목록

- `src/actions/admin/platform-revenue.ts` (신규) — `getStorefrontRevenueKPI`
- `src/components/commerce/StorefrontRevenueKpiSection.tsx` (신규)
- `src/app/(admin)/admin/commerce/orders/page.tsx` — KPI 섹션 연동
- `docs/tasks.md` — 작업 이력
- `docs/worklogs/2026-05-14_feat_platform-erp-p1-001-storefront-kpi.md` (본 파일)

## 변경 내용 요약

- `getStorefrontRevenueKPI()`: `payments`에서 storefront 전용 필터(`commerce_order_id` NOT NULL, `direction='inbound'`, `payee_tenant_id` = P0와 동일 플랫폼 sentinel, `status='confirmed'`)로 일/월/누계 매출 집계; `commerce_orders.payment_status='unpaid'` 합계; RFQ는 `getPlatformRevenue`를 **수정하지 않고** `orders` 확정·KST 월 경계를 동일하게 복제 조회해 채널 표만 제공.
- `/admin/commerce/orders` 상단에 storefront 전용 패널·채널 표·최근 payments 10건 테이블 추가 (`/admin/settlements`는 RFQ 정산 중심이라 충돌을 피해 주문 페이지에 배치).

## migration 여부

- **없음** (스키마·migration 파일 추가 없음)

## 테스트 결과

- `npx tsc --noEmit` — **pass** (본 변경 파일 포함 타입체크).
- `npm run lint` — 저장소 기존 이슈로 **전체 실패**(본 턴 변경 파일만 `read_lints` 기준 문제 없음).

## 남은 위험

- `payments`·`orders`·`commerce_orders` 각 집계는 **상한 50,000행** 클라이언트 합산 — 초과 시 합계 과소 가능.
- RFQ “누계”와 storefront “누계”는 **서로 다른 경제적 의미**(주문 GMV vs 실제 입금)인데 “합계” 행은 단순 합산 참고용.

## 다음 권장 작업

- 대량 데이터 시 서버측 `sum()` RPC 또는 페이지드 집계 검토.
- 환불·역분개 시 storefront 매출 역반영 정책은 별 Epic(자동화 비범위).

---

## SECTION 1 — 사전 확인 결과 (코드 기준)

- **`getPlatformRevenue`**: `src/actions/admin/settlement-control.ts` — 월 GMV는 **`orders`** `status='confirmed'` + 월 `order_date`; `payments`는 **`type='settlement'`** 위주. **분류: RFQ(주문)·정산 payments 혼합이나 storefront `commerce_order_id` 매출은 미포함.**
- **기존 KPI 카드**: `/admin/settlements` — 위 `getPlatformRevenue` 기반.
- **storefront 집계**: 기존 KPI에 **미포함** (이번 `getStorefrontRevenueKPI`로 분리).

## SECTION 2 — `getStorefrontRevenueKPI` 구조

- 관리자 `getAuthCtx` + `role === 'admin'`.
- Storefront 매출: `payments` 필터 + `payment_date`로 today/month; 전체는 동일 필터 전 기간(행 상한 내).
- RFQ 보조 지표: `orders` 별도 `Promise.all` (확정·`deleted_at` null·일/월은 `order_date` 문자열 비교).
- `recent_payments`: storefront 필터 + `reversed` 제외, `created_at` desc 10건 → `commerce_orders`·`tenants`로 주문번호·식당명 보강.

## SECTION 3 — today/month 계산 기준

- **`settlement-control.ts`의 `kstTodayDateString` / `monthRangeUtcNow`와 동일 패턴**: `Date.now() + 9h` 후 **UTC 연·월·일**로 `YYYY-MM-DD` 및 월 시작·말일 문자열 생성.
- Storefront 일/월 매출: **`payments.payment_date`**를 위 KST 달력 문자열과 비교 (임의 TZ 라이브러리 없음).

## SECTION 4 — UI 위치 및 표시

- **`/admin/commerce/orders`** 헤더 바로 아래: storefront 전용 패널(4 KPI + receivable 보조 2칸), 채널 표, 최근 10건 테이블.
- **선택 이유**: 본 페이지가 storefront 주문 운영 허브이며, `/admin/settlements`는 RFQ·정산 UI와 책임이 겹쳐 혼선을 줄임.

## SECTION 5 — RFQ vs storefront 분리

- **RFQ**: `getPlatformRevenue` **미변경**; 동일 `orders` 규칙을 `platform-revenue.ts`에서 **읽기 전용 복제**.
- **Storefront**: `payments` + `commerce_order_id` + inbound + 플랫폼 payee + confirmed.

## SECTION 6 — `recent_payments` 조회

- `payments` 10건 (위 storefront 경로, `status <> 'reversed'`, `created_at` 정렬).
- `commerce_orders.id IN (...)`로 `order_number`, `tenant_id`; `tenants`로 `name`.

## SECTION 7 — limitation

- **supplier payable 없음**, **allocation 없음**, **settlement automation 없음**.
- **refunded 주문에 대한 payments 자동 역반영·조정 없음** (별 정책·배치 비범위).
- **계산값 DB 저장 없음** (실시간 조회만).
