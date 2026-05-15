# 2026-05-07 — SUP-MISSING-013 거래처별 단가 시스템 구현

## 작업 목적

- PRODUCT §6-6 “거래처별 단가 기억”을 구현해 주문 등록 속도/정확도를 개선한다.
- 주문 confirmed 시에만 `customer_product_prices`가 자동 갱신되도록 하여 과거 주문 불변 원칙을 유지한다.

## 관련 작업 ID

- `SUP-MISSING-013`

## 변경 파일

- `supabase/migrations/20260507190000_add_customer_product_prices_columns.sql`
- `src/actions/customer-product-prices.ts`
- `src/actions/order.ts`
- `src/components/order/OrderCreateForm.tsx`
- `docs/tasks.md`

## 구현 내용 요약

### 1) migration 소급

- `customer_product_prices`에 누락 컬럼을 소급 추가한다.
  - `tenant_id uuid`
  - `source text` (CHECK: `quote|order`)

### 2) Server Actions 추가

- `src/actions/customer-product-prices.ts` 신규
  - `getCustomerProductPrice(customer_id, product_id)` : 최근 단가 1건 조회(없으면 null)
  - `upsertCustomerProductPrice(...)` : 거래처+상품 단가 upsert(업데이트 시 updated_at 갱신)
  - `getCustomerProductPrices(customer_id)` : 거래처 단가 목록 조회(상품명 join 포함)

### 3) 주문 생성 연동

- `src/actions/order.ts`
  - 주문 생성 시 **status가 confirmed인 경우에만** `customer_product_prices`를 batch upsert
  - `source = 'order'`
  - 주문 취소 로직에서는 단가 갱신하지 않음

### 4) 주문 등록 폼 연동

- `src/components/order/OrderCreateForm.tsx`
  - 구매 이력 없을 때도 기본가(`products.price_type=normal`)를 자동 추천하도록 개선
  - 상품 추가 시 `getCustomerProductPrice`를 best-effort로 호출하여, 최근 단가가 있으면 입력값을 해당 단가/모드로 동기화

## migration 여부

- 있음 (소급): `20260507190000_add_customer_product_prices_columns.sql`

## 테스트

- `npx tsc --noEmit` 통과

## 남은 위험 / TODO

- 견적가 우선순위(“is_final_price = true” 기반)까지 100% 충족하려면, 견적 확정가를 `customer_product_prices(source='quote')`로 갱신하는 흐름이 추가로 필요하다.

## 다음 권장 작업

- 견적 확정(최종가) 시점에 `customer_product_prices`를 `source='quote'`로 갱신하고, 주문등록 폼에서 “견적 최종가”를 최우선으로 제안하도록 확장한다.

