# DISCOUNT-FORENSIC-001 — 기간할인 / 프로모션 가격 구조

> **범위**: 가격·할인과 연관된 **실제 코드·migration·문서 인벤토리** (`realmyos` + storefront 경로 `resturant_os`).  
> **금지 준수**: 구현·migration·데이터·설정 변경 없음. **운영 DB 직접 조회 없음.**

---

## SECTION 1 — 할인 관련 구조 전체

### 1.1 키워드별 (저장소 기준)

| 키워드 / 개념 | 테이블·컬럼 | migration (incremental) | `src` 사용 | 비고 |
|---------------|-------------|-------------------------|------------|------|
| **discount** (일반) | `orders.discount_amount` (CONTEXT §orders) | 본 repo incremental에서 컬럼 생성문 **미추적** | `createOrder`·`OrderCreateForm` — **공급자 CRM 주문** 헤더 할인(수동 숫자) | “기간할인” **UI 라벨만** 존재; **시작/종료일 필드 없음** |
| **promotion / campaign / coupon** | — | 일치하는 DDL **없음** | 일치 사용 **없음** | `docs/CONTEXT.md`에 `promotion_logs (나중)` **메모만** 존재 |
| **sale_price / special_price** | 명칭 그대로의 컬럼 **없음** | — | — | |
| **original_price** | `commerce_product_listings.original_price` | `20260510110000_add_listing_original_price.sql` | 관리자 `commerce.ts` CRUD·`ListingEditClient`·`ListingNewClient`·식당 `getListings`/`getListing` | **정상가(참고)**. `commerce_price`보다 클 때만 저장 (`commerce.ts` 검증) |
| **commerce_price** | `commerce_product_listings.commerce_price` | `20260509010000_create_commerce_tables.sql` | storefront 전 구간 + 관리자 listing | **실판가 SSOT** |
| **point_used** | `orders.point_used` | incremental 미추적 | `createOrder` 등 | **공급자 주문** 헤더; storefront `commerce_orders`와 **무관** (`POINT-FORENSIC-001` 참고) |

### 1.2 `customer_product_prices` (거래처별 단가 기억)

- migration: `20260507190000_add_customer_product_prices_columns.sql` — **견적/주문 소스**로 최근가 캐시.
- 용도: **공급자 CRM** `getProductsForOrder` 등에서 **마지막 거래가 추천** — **기간 한정 프로모션 아님**.

### 1.3 `product_costs` (매입가 이력)

- `start_date` / `end_date`: **원가(비용) 이력** — 판매 프로모션과 **별 축** (`createListingFull` 등에서 insert).

### 1.4 Dead field 여부

- **`original_price`**: **live** — listing·storefront·admin 편집에 연결.
- **`orders.discount_amount`**: **live** — 주문 생성 시에만; 주문 수정 UI에서는 **변경 경로 없음**(선행 포렌식과 정합).
- **promotion/campaign 테이블**: **미존재(인벤토리 기준)**.

---

## SECTION 2 — 기간할인 구조 존재 여부

### 2.1 DB·코드에서의 “기간”

| 대상 | `start_at` / `end_at` / 프로모 기간 컬럼 | 자동 만료 |
|------|----------------------------------------|-----------|
| `commerce_product_listings` | **없음** (검토한 incremental DDL: `commerce_price`, `status`, `is_visible`, `original_price`, 이미지·배송·뱃지 등만 확장) | **없음** — 가격 유지·변경은 **관리자 수동 `updateListingFull` / `updateListingPrice`** |
| 공급자 주문 “기간할인” | **없음** — `discount_amount`는 **주문 시점 숫자**만 | **없음** |

### 2.2 storefront 노출 조건 (실제 코드)

- `resturant_os/src/actions/buy.ts` — `getListings` / `getListing`:  
  `status = 'visible'` AND `is_visible = true` AND `deleted_at IS NULL`  
  → **가격 노출 = 현재 listing 행의 `commerce_price`** 이며, **날짜 WHERE 절 없음**.

```238:241:C:/Users/babok/Desktop/resturant_os/src/actions/buy.ts
    .eq('status', 'visible')
    .eq('is_visible', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
```

### 2.3 `product_costs.start_date` / `end_date`

- **매입 원가 기간**용이지, **소비자 할인 기간** 아님.

**결론**: 질문 의미의 **“기간할인 엔진”(시작·종료·자동 복귀)** 는 **구현되어 있지 않음**.

---

## SECTION 3 — 실제 할인 계산 흐름

### 3.1 Storefront (식당OS `/buy`)

| 단계 | 가격 소스 | 계산 |
|------|-----------|------|
| 목록·상세 | `commerce_product_listings.commerce_price`, `original_price`(선택) | `PriceAidStack`: `savings = original_price - commerce_price` (둘 다 유효·원가>판매가일 때만 절감 문구) |
| 장바구니 | join된 `commerce_price` × `quantity` | `BuyCartClient` / `buy/page` 합계 |
| 체크아웃 | 동일 | `BuyCheckoutClient` subtotal |
| **주문 확정** | **서버 재조회** `assertListingBuyable` → 그 시점 `commerce_price` | `unit_price = ok.commerce_price`, `line_total = unit_price * quantity`, `total_amount = Σ line_total` |

```671:684:C:/Users/babok/Desktop/resturant_os/src/actions/buy.ts
  for (const row of rows) {
    const listing_id = row.listing_id as string
    const quantity = row.quantity as number
    const ok = await assertListingBuyable(supabase, listing_id)
    if (!ok.ok) return { success: false, error: ok.error }
    const unit_price = ok.commerce_price
    const line_total = unit_price * quantity
    lines.push({
      listing_id,
      quantity,
      unit_price,
      listing_title: ok.product_name,
      line_total,
    })
  }
```

- **장바구니 UI에 담긴 가격**과 **결제 직전 DB 가격**이 다를 수 있음 → **의도된 재검증**(가격 인상 시 주문 거절 가능).

### 3.2 공급자 CRM 주문 (`realmyos` `createOrder`)

- 라인 합 = `total_amount` (할인 전).
- 헤더 `discount_amount`·`point_used`를 빼 **DB `final_amount`** (앱은 insert 후 select).
- **상품 단가·라인 세금**은 할인 전 `line_total` 기준으로 먼저 확정 — 헤더 할인은 **주문 헤더 조정** (`order.ts` 선행 분석과 동일).

### 3.3 `commerce_orders` vs `orders`

- storefront 주문은 **`commerce_orders` / `commerce_order_items`** — **`discount_amount` 컬럼 없음**(초기 migration 스키마 기준).
- 공급자 **`orders.discount_amount`** 는 **별 주문 파이프라인**.

---

## SECTION 4 — 고객별 할인 가능 구조 (CASE)

**정무님 요구(특정 식당·기간·상품·공급자별 프로모션)** 에 대한 **storefront + 공통 DB 구조** 판정:

### 판정: **CASE D — 구조 자체 없음** (자동 타깃 프로모션)

근거:

- Listing은 **전역 노출 조건**만 있고 **`buyer_tenant_id` / 식당별 가격** 컬럼이 **없음**.
- **기간 컬럼** 없음 → “식당 A만 5월 한달” 같은 **데이터 모델 없음**.
- 우회 운영: **동일 상품을 listing 복제**하거나 **가격 수동 변경**은 가능하나, **엔진·정책 테이블은 없음**.

### 보조: **CASE B에 가까운 별도 축** (공급자 B2B만)

- `customer_product_prices`: **거래처(바이어)별 마지막 단가** — **캠페인·기간 한정 아님**.

---

## SECTION 5 — storefront 반영 구조

| 항목 | 상태 |
|------|------|
| 할인가 노출 | **`commerce_price`가 판매가**로 노출 |
| strike-through 원가 | **`PriceAidStack`은 취소선 없음** — “식식이가” + 판매가 + (선택) 절감액 텍스트만 |

```68:84:C:/Users/babok/Desktop/resturant_os/src/app/(app)/buy/page.tsx
function PriceAidStack({
  commercePrice,
  originalPrice,
}: {
  commercePrice: number
  originalPrice: number | null
}) {
  const savings =
    originalPrice != null && originalPrice > commercePrice ? originalPrice - commercePrice : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, color: '#888' }}>식식이가</span>
      <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text)' }}>{formatKRW(commercePrice)}</span>
      {savings != null && savings > 0 ? (
        <span style={{ fontSize: 12, color: 'var(--color-primary)' }}>{formatKRW(savings)} 절감</span>
      ) : null}
    </div>
  )
}
```

| 항목 | 상태 |
|------|------|
| 할인 종료 자동 | **없음** — `status`/`is_visible`/가격 **수동** |
| export vs 주문 금액 | 관리자 **공급자 전달 CSV** (`getCommerceOrderSupplierExportRows` + `commerce-order-supplier-export.ts`)는 **상품명·수량·배송 등**이며 **`unit_price`/`total_amount` 컬럼 없음** → 스프레드시트 합계와 **주문 DB `total_amount` 자동 대조 불가** |

---

## SECTION 6 — 운영 리스크 TOP 10

1. **HIGH** — **기간 프로모션 부재**: 종료일을 시스템이 모름 → **수동 미복귀** 시 가격 오표시.  
2. **HIGH** — **식당별 타깃 가격 부재**: 전체 구매자 동일 listing 가격.  
3. **HIGH** — **체험가/신제품 캠페인 데이터 모델 없음** — 운영은 **복수 listing·수동 전환**에 의존.  
4. **MID** — **체크아웃 시점 가격 변동**: `createCommerceOrder`가 **최종 DB 가격**으로 덮어씀 → 사용자 혼란·CS.  
5. **MID** — **공급자 export에 단가·합계 없음** — 외부 정산·물류와 **숫자 대조 어려움**.  
6. **MID** — **공급자 주문 헤더 할인**은 **정책·감사 추적 없이** 숫자 입력.  
7. **MID** — **라인 세금 vs 헤더 할인** 분리 — 회계 해석 착오.  
8. **LOW** — **`original_price` < `commerce_price`** 는 admin에서 저장 억제 — 절감 UI만 억제.  
9. **LOW** — **쿠폰 사칭** — 코드상 쿠폰 없음.  
10. **LOW** — **다 공급자 동일 프로모션** listing만으로는 **충돌 최소**; 다만 **인적 편집 충돌**은 가능.

---

## SECTION 7 — MVP / 장기 구조 판정

### 판정: **A (단순 MVP 가격 표시)** + **장기 C·엔진 B 해당 없음**

| 옵션 | 판정 |
|------|------|
| **A** | **해당** — `commerce_price` + 선택적 `original_price` 표시 + 수동 상태/가격 관리. |
| **B** | **부정** — 자동 프로모션 규칙·스케줄러 없음. |
| **C** | **부정** — 기간·타깃·감사 추적 없이 장기 운영 SSOT로 부족. |
| **D** | **요소만** — 수동 의존·export 갭은 **운영 실수에 취약**하나, 전체를 “위험한 임시”로 단정하진 않고 **A + 운영 리스크(§6)** 로 정리. |

---

## 참조

- `resturant_os/src/actions/buy.ts`, `resturant_os/src/app/(app)/buy/page.tsx`, `realmyos/src/actions/admin/commerce.ts`, `realmyos/supabase/migrations/20260509010000_create_commerce_tables.sql`, `20260510110000_add_listing_original_price.sql`, `realmyos/src/lib/commerce-order-supplier-export.ts`, `docs/CONTEXT.md` (테이블 인벤토리·orders 절), `docs/POINT-FORENSIC-001.md`
