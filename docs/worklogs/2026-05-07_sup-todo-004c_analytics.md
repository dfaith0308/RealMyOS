# SUP-TODO-004-C `/analytics` 매출분석 4탭 신설

| 필드 | 값 |
|------|-----|
| **상태** | 완료 (본체) — 분리 ID(C-2/C-3/C-4) 보류 |
| **완료일** | 2026-05-07 |
| **차단 사유** | (해당 없음) |

## 작업 목적

- PRODUCT §6-11 매출분석을 위해 `/analytics` 라우트(4탭: 매출현황·마진분석·거래처분석·위험신호)를 신설한다.
- “돈을 어디서 잃는지”를 찾는 화면 정의에 따라, 매출만이 아닌 **마진 / 마진율 / 마진 기여도 / 위험 신호**를 표면화한다.
- 차트 라이브러리·출력·평균결제기간 정밀 정의는 단일 PR 범위를 넘기 때문에 **SUP-TODO-004-C-2/-3/-4** 신규 ID로 분리한다.

## 관련 tasks.md ID

- `SUP-TODO-004-C` (본체 완료 처리)
- `SUP-TODO-004-C-2` (신규 — 차트 라이브러리 도입)
- `SUP-TODO-004-C-3` (신규 — 출력 엑셀/PDF/JPG)
- `SUP-TODO-004-C-4` (신규 — 평균 결제기간 정확 정의)

## 수정 파일 목록

신규
- `realmyos/src/lib/analytics-calc.ts` — 마진·일자/상품/거래처 집계 헬퍼, 전기간 계산
- `realmyos/src/actions/analytics.ts` — 4개 서버 액션 (`getAnalyticsOverview`, `getMarginByProduct`, `getMarginByCustomer`, `getRiskSignals`)
- `realmyos/src/app/(app)/analytics/page.tsx` — 서버 컴포넌트 진입점(탭 분기 + RSC 데이터 로드)
- `realmyos/src/app/(app)/analytics/loading.tsx` — 로딩 스켈레톤
- `realmyos/src/components/analytics/AnalyticsShell.tsx` — 탭 헤더 + 기간 프리셋/사용자 지정 폼
- `realmyos/src/components/analytics/OverviewTab.tsx` — 탭 1 (매출현황)
- `realmyos/src/components/analytics/MarginTab.tsx` — 탭 2 (마진분석)
- `realmyos/src/components/analytics/CustomerTab.tsx` — 탭 3 (거래처분석)
- `realmyos/src/components/analytics/RiskTab.tsx` — 탭 4 (위험신호)

수정
- `realmyos/src/components/layout/Sidebar.tsx` — 매출분석 링크 `/sales` → `/analytics`
- `realmyos/docs/tasks.md` — SUP-TODO-004-C 완료 처리 + C-2/C-3/C-4 신규 등록 + 작업 이력 라인

## 변경 내용 요약

### `src/lib/analytics-calc.ts`

- `lineMargin(line) = line_total − cost_price × quantity` — RULE-03(`order_lines` 스냅샷 SSOT) 준수, `product` 테이블 참조 없음.
- `aggregateByDate(orders)` — 일자별 매출/원가/마진(sales 주문만, refund는 음수 자연 합산).
- `aggregateByProduct(orders)` — 상품별 표 + 마진율 + **마진 기여도 = 상품마진 / 전체마진**.
- `aggregateByCustomer(orders, prevOrders?)` — 거래처별 표 + 비중·순위 + **성장률(전기간 대비)**. `customer_id`/`customer_name` 정합은 `ledger-calc.buildCustomerKey/resolveCustomerName` 재사용.
- `prevPeriodRange(from, to)` — `(to - from)` 일수만큼 직전 기간을 복제(전월 길이가 들쭉날쭉한 점을 우회 — 동일 길이 대비).
- `buildOverviewSummary(orders, prevOrders)` — 합계 + 전기간 대비(매출/마진 변화율, 마진율 차이 p).

### `src/actions/analytics.ts`

- 모든 액션은 `getAuthCtx` 후 **`or(seller_tenant_id.eq.${tid},tenant_id.eq.${tid})` 병행** + `status='confirmed'` + `is('deleted_at', null)` (RULE-01).
- 공통 SELECT: `id, order_date, order_type, total_amount, final_amount, customer_id, customer_name, customers(name), order_lines(product_name, quantity, unit_price, cost_price, line_total)`.
- `getAnalyticsOverview(from, to)` — 현 기간·전기간 두 번 fetch → `buildOverviewSummary` + `aggregateByDate`.
- `getMarginByProduct(from, to)` — `aggregateByProduct` + 상위 5개 매출 비중.
- `getMarginByCustomer(from, to)` — `aggregateByCustomer` + KPI 4종:
  - 평균 결제기간(근사): 거래처별 마지막 수금일 - 마지막 주문일 평균
  - 미수금 비율: `(매출 − 수금) / 매출`
  - 반복 구매율: 기간 내 2회 이상 주문한 buyer 비율(전체 buyer 기준)
  - 상위 3개 거래처 비중
- `getRiskSignals(from, to)` — 5종:
  1. 매출 감소: `growth_rate ≤ -20%`
  2. 마진 낮은 거래처: `margin_rate < settings.margin_warning_threshold`(매출 > 0)
  3. 손해 상품: `margin < 0`
  4. 매출 TOP10 ∩ 마진율 하위 50%(전체 거래처)
  5. 반품/매출 비율 ≥ 5%(`order_type='refund'` 라인 합산, 음수 자연 합산)

### `src/app/(app)/analytics/page.tsx`

- `searchParams: { tab, from, to, preset, sort }` 검증(허용값만 통과, fallback `overview` / 이번달 1일~오늘).
- `preset = this_month | last_month | 3m | 1y` → `from`/`to`로 변환(KST 기준).
- 탭별 RSC 컴포넌트(`OverviewTabRSC`, `MarginTabRSC`, `CustomerTabRSC`, `RiskTabRSC`)에서 액션 호출 → 클라 컴포넌트 렌더.
- 실패/빈 결과는 공통 `ErrBox` 또는 각 탭의 빈 상태 메시지(PRODUCT 명시 “해당 기간 매출 데이터가 없습니다”) 사용.

### `src/app/(app)/analytics/loading.tsx`

- 매출분석 페이지 로딩 시 스켈레톤(탭/카드/테이블 골격).

### 컴포넌트

- `AnalyticsShell.tsx` — 탭 4종 + 프리셋 4종 + 사용자 지정 기간 폼. URL을 SSOT로 사용해 새로고침/공유 시 상태 보존.
- `OverviewTab.tsx` — KPI 4카드(전기간 대비 표시) + 일자별 표 + **CSS 막대 그래프**(차트 라이브러리 미도입, C-2로 분리).
- `MarginTab.tsx` — 정렬 3종(마진/기여도/수량) + 상위 5 매출 비중 카드 + 표.
- `CustomerTab.tsx` — KPI 4카드(상위3 비중·평균결제기간 근사·미수금 비율·반복구매율) + 정렬 3종(매출/마진/성장률) + 표(성장률 색상 인코딩).
- `RiskTab.tsx` — 5섹션 카드, 각 섹션은 비어있을 때 “해당 신호 없음” 표기. 전체 비어있으면 “🟢 위험 신호 없음” 안내.

### `Sidebar.tsx`

- “매출분석” 메뉴 `href`: `/sales` → `/analytics` 1줄 교체. 다른 메뉴 영향 없음.

## migration 여부

- **없음** (RULE-02 — 분석 결과는 메모리 집계만, 캐시 테이블/머티리얼라이즈드 뷰 없음).

## 테스트 결과

- `npx tsc --noEmit` — pass (0 error).
- `ReadLints`(편집한 10개 파일) — 0 error.
- 수동 검증: 미실행(런타임/E2E는 후속 PR/QA에서 수행).

## 남은 위험

- **평균 결제기간 근사**: “거래처별 마지막 수금 - 마지막 주문 평균”은 PRODUCT 정의(“주문일 ~ 수금일까지 평균”)의 근사. 결제 매핑(`payment_allocations`) 도입 시 정확도 향상 가능 → **SUP-TODO-004-C-4**.
- **반품 정의 의존**: 반품 처리는 `order_type='refund'` 또는 음수 `line_total`을 가정. 기존 운영 데이터에 반품이 다른 컨벤션으로 들어가 있다면 위험신호 #5가 0으로 표시될 수 있음. 도입 시 운영 데이터 점검 필요.
- **차트 미도입**: PRODUCT §6-11이 명시한 라인 차트는 표/CSS 막대로 대체. 시계열 추세 가독성 저하 → **SUP-TODO-004-C-2**.
- **출력 미도입**: 엑셀/PDF/JPG 출력 미구현 → **SUP-TODO-004-C-3**.
- **거래처 키 변동**: `customer_id`가 NULL인 레거시 주문은 `name` 기반 키로 묶이며, 동명이인은 합산될 수 있음(`buildCustomerKey` 동일 동작). 분석 단계에서 별도 처리하지 않음.
- **위험신호 #4 임계치(매출 TOP10 ∩ 마진율 하위 50%)** 는 본 PR의 결정값. 실제 운영 적용 후 임계치 조정 필요할 수 있음.
- **성장률 신규 거래처**: 전기간 매출이 0이고 현재 양수면 `null`(“신규”)로 표기. 위험신호 #1에는 들어가지 않음(의도된 동작).

## 다음 권장 작업

- **SUP-TODO-004-C-2**: 차트 라이브러리 선정(번들 영향 평가) → `OverviewTab` 라인차트 / `MarginTab` 막대차트 / `CustomerTab` 도넛(상위3 비중) 도입.
- **SUP-TODO-004-C-3**: SheetJS/pdf-lib/html2canvas 후보 조사 → 기간/탭 단위 출력 버튼 + 서버 액션 또는 클라 변환 결정.
- **SUP-TODO-004-C-4**: `payment_allocations` 활용한 주문↔수금 매핑 알고리즘 정의(주문일~첫 수금일 가중평균 등).
- **운영 데이터 점검**: 반품(`order_type='refund'` vs 음수 `line_total`) 컨벤션 확인 후 위험신호 #5 보정.
