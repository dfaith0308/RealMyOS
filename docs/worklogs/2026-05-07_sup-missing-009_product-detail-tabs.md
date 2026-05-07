# 2026-05-07 — SUP-MISSING-009 상품 상세 탭 구조 구현

## 목표

- PRODUCT §6-6 상품관리의 상품 상세 탭 구조를 `/products/[id]`에 구현
- 탭: 기본정보 / 가격·마진 / 연관상품 / 사용패턴 / 로그
- RULE-01(tenant)·RULE-03(order_lines 스냅샷)·RULE-10(물리 삭제 금지) 준수
- 데이터 부족 시 빈 화면 금지(안내 문구 표시)

## 구현 내용

### 1) 라우트 신설

- `src/app/(app)/products/[id]/page.tsx`
- 서버에서 상세/원가이력/거래처단가/패턴/추천 데이터를 병렬 로드 후 탭 UI에 전달

### 2) Actions 확장 (`src/actions/product.ts`)

- `getProductDetail(product_id)`: 상품 상세 + 현재 매입가 + 기본 판매가(normal)
- `getProductCostHistory(product_id)`: `product_costs` 이력
- `getCustomerProductPrices(product_id)`: `customer_product_prices` 기반 거래처별 단가(최근 업데이트 순)
- `getProductUsagePattern(product_id)`:
  - confirmed 주문의 `order_lines` 스냅샷 기반 분석
  - 주요 거래처 TOP5(주문 횟수)
  - 함께 구매 TOP5(같은 주문의 다른 상품)
  - 최근 6개월 월별 판매량(수량) + 평균 주문 수량
  - 거래 10건 미만 시 안내 문구 노출(빈 화면 금지)
- `getProductAutoRecommend(product_id)`:
  - 자동 추천 활성 조건 3개 중 2개 충족 시만 추천 표시
  - 조건: 거래횟수≥20 / 함께구매데이터≥30 / 서로다른거래처≥5
- `getProductMarginAnalysis(product_id)`:
  - 현재 마진율, 평균 마진율(거래 기반 avg_unit_price), 기준(threshold) 계산
  - 기준: products.min_margin_rate 우선, 없으면 settings.margin_warning_threshold
- 수동 연관상품: `getProductRelatedManual/addRelatedProduct/removeRelatedProduct`
  - soft deactivate(물리 삭제 없음)
  - ※ 운영 테이블명은 SSOT에 의존(본 구현은 `product_related_manual` 사용)

### 3) 탭 UI

- `src/components/product/ProductDetailTabsClient.tsx` + CSS Module
- 5탭 전환 + 각 탭에 요구 정보 표시
- 연관상품:
  - 수동 등록(항상 표시) + 자동 추천(조건 충족 시만)
  - 조건 미충족 시 안내 문구 표시
- 로그:
  - 가격 변경 로그(product_costs) 표시
  - product_logs는 운영 컬럼 정합 확정 후 확장 예정(빈 화면 대신 안내 문구)

### 4) 목록에서 상세 진입

- `src/components/product/ProductListClient.tsx`
  - 상품명 클릭 시 `/products/[id]`로 이동

## 테스트

- `npx tsc --noEmit`

