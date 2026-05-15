# DISCOUNT-ENGINE-DESIGN-001 — B2B 가격정책 엔진 설계

> **성격**: 설계 문서만. **구현·migration·DB 변경·코드 수정 없음.**  
> **근거**: 본 문서의 “현행 구조” 절은 `resturant_os`·`realmyos` 저장소의 **실제 코드·migration**를 열람·grep한 결과이다. 법률·세무 확정 조언은 하지 않는다.

**연계 포렌식**: [`docs/DISCOUNT-FORENSIC-001.md`](./DISCOUNT-FORENSIC-001.md)  
**ERP 연계**: [`docs/PLATFORM-ERP-DESIGN-001.md`](./PLATFORM-ERP-DESIGN-001.md), [`docs/TEST-DEV/TEST-RUN-ERP-001.md`](./TEST-DEV/TEST-RUN-ERP-001.md)

---

## SECTION 1 — 현행 구조 요약 (사전 확인 결과)

### 1-1. storefront 주문 생성 시 금액 확정 (`createCommerceOrder`)

**파일**: `resturant_os/src/actions/buy.ts` — `createCommerceOrder`

| 항목 | 현행 |
|------|------|
| 단가 소스 | 장바구니 품목마다 `assertListingBuyable` → 그 시점 **`commerce_product_listings.commerce_price`** |
| 라인 금액 | `unit_price = commerce_price`, `line_total = unit_price * quantity` |
| 주문 합계 | `total_amount = Σ line_total` → **`commerce_orders.total_amount`** insert |
| 품목 스냅샷 | `commerce_order_items`: `unit_price`, `total_price`(= line_total), `listing_title`, `listing_id`, `quantity` |
| 할인 필드 | **없음** — `discount_amount` / `point_used` / 프로모션 컬럼 **미사용** |
| `commerce_orders` | `total_amount` 외 별도 할인·포인트 컬럼 **incremental DDL에 없음** (`20260509010000_create_commerce_tables.sql`, `20260509020000_add_commerce_orders_columns.sql`, idempotency migration 등) |

**주석·스키마**: `commerce_order_items` — “`unit_price` / `total_price` / `listing_title` 은 주문 시점 스냅샷 · RULE-03 이후 변경 금지” (`20260509010000_create_commerce_tables.sql`).

### 1-2. allocation 금액 기준 (`createCommerceOrderAllocations`)

**파일**: `realmyos/src/actions/admin/commerce-allocation.ts`

| 항목 | 현행 |
|------|------|
| `item_amount` | `commerce_order_items.total_price`가 유효하면 **그 값**, 아니면 `round(unit_price * quantity)` |
| `platform_fee_amount` | `round(item_amount * feePercentNumerator / 100)` — `feePercentNumerator` = `admin_settings.platform_fee_rate` 정수 % |
| `supplier_payable_amount` | **`item_amount - platform_fee_amount`** (할인 분리 없음) |
| 할인 반영 | **없음** — `item_amount`는 주문 스냅샷 총액 하나뿐 |

### 1-3. `customer_product_prices`

**migration**: `realmyos/supabase/migrations/20260507190000_add_customer_product_prices_columns.sql`  
**코드**: `realmyos/src/actions/customer-product-prices.ts`, 공급자 주문 `realmyos/src/actions/order.ts` (조회·추천)

| 항목 | 현행 |
|------|------|
| 용도 | **공급자 CRM** 거래처별 “마지막 거래가” 캐시 (`last_price`, `source` ∈ `quote` \| `order`) |
| storefront 연동 | **`createCommerceOrder` 경로와 무관** — listing `commerce_price`만 사용 |
| `commerce_orders` / RFQ | **직접 FK 없음** — B2B 단가 엔진의 소스 후보일 뿐, storefront 정가의 SSOT 아님 |

### 1-4. 수동 할인·적립금 (공급자 `orders` vs storefront)

| 항목 | 현행 |
|------|------|
| `orders.discount_amount`, `orders.point_used` | `realmyos/src/actions/order.ts` `createOrder`에서 검증 후 저장 — **헤더 수준 숫자**; 기간 엔진 없음 (`DISCOUNT-FORENSIC-001`) |
| `commerce_orders` | **동일 컬럼 없음** |
| `commerce_order_items` | **할인 스냅샷 컬럼 없음** |
| 취소·환불 시 할인 rollback | 본 설계 범위에서 **storefront ERP 스냅샷과 분리**해 별도 정책 결정 필요(포렌식: 포인트 잔고 시스템 없음 — `POINT-FORENSIC-001`) |

### 1-5. supplier payable (`commerce_order_allocations` / `supplier_payables`)

| 항목 | 현행 |
|------|------|
| allocation `item_amount` | 위 1-2와 동일 — **주문 라인 총액 = 사실상 고객 청구액** |
| `supplier_payables.payable_amount` | 확정 allocation의 **`supplier_payable_amount` 복사** (`commerce-allocation.ts` + migration `20260515220000_create_supplier_payables.sql`) |
| 할인 전/후 분리 저장 공간 | **없음** — 단일 `total_price`·`item_amount` 축 |

**결론 (문제 정의)**: 현재는 **“고객이 낼 금액 = allocation의 item_amount = 수수료 계산 기준”** 이 한 축으로 묶여 있다. 플랫폼·공급자 **부담 분리 할인**을 넣으면 이 축을 **깨지 않고** 확장해야 한다.

---

## SECTION 2 — ERP 금액 모델 설계 (Q1)

### 2-1. 필수 분리 금액 (품목 단위 권장)

모든 금액은 **정수 원**, **주문(또는 확정) 시점 스냅샷**으로 고정. 이름은 구현 시 그대로 쓰거나 `*_minor` 등 팀 규칙에 맞게 매핑한다.

| 필드 (설계명) | 의미 |
|---------------|------|
| **`customer_charge_amount`** | 식당이 **실제로 지불·청구되는** 라인 합계(무통장/카드 등 UI·`payments` 대사 기준). |
| **`supplier_basis_amount`** | 공급자와의 계약·정산에서 “이 라인의 **거래 가치**”로 쓰는 **세전 기준액**(할인 부담 반영 **전** 또는 **후**는 **부담 주체 규칙**으로 고정 — 아래 2-3). |
| **`platform_discount_amount`** | 고객 청구를 줄이는 금액 중 **플랫폼이 비용으로 흡수**하는 분(공급자 지급을 깎지 않는 케이스 가능). |
| **`supplier_discount_amount`** | 고객 청구를 줄이거나, 공급자 정산 기준을 깎는 금액 중 **공급자가 부담**하는 분. |
| **`platform_fee_amount`** | 플랫폼 **수수료·마진 룰**에 따른 금액(계산 **기준액**은 정책으로 명시 — 2-3). |
| **`supplier_payable_amount`** | 공급자에게 **지급 예정·지급 확정**되는 금액(현행 `supplier_payables.payable_amount`와 역할 동일). |

### 2-2. 불변식(회계 정합성) — **제안**

한 라인에 대해 다음을 **동시에 만족**하도록 설계한다.

1. **고객 청구**  
   `customer_charge_amount = supplier_basis_amount - platform_discount_amount - supplier_discount_amount`  
   (다른 정의를 쓸 경우, “리스트가”·“혼합 할인”을 어디에 두는지 **SECTION 12**에서 결정.)

2. **공급자 지급 (사용자 제안식과 정합)**  
   `supplier_payable_amount = supplier_basis_amount - supplier_discount_amount - platform_fee_amount`

3. **플랫폼 할인이 공급자 지급을 깎지 않는 경우**  
   `platform_discount_amount`는 **위 2식의 `supplier_discount_amount`에 포함하지 않는다**. 플랫폼 P&L에서만 반영.

4. **수수료 계산 기준 (분기)** — **정책 선택**  
   - **안 A (권장 후보)**: `platform_fee_amount = round((supplier_basis_amount - supplier_discount_amount) * fee%)` — 즉 “공급자 실질 거래대금”에 수수료.  
   - **안 B**: `platform_fee_amount`는 **`supplier_basis_amount`** 에만 적용(공급자 할인은 수수료 면제 효과).  
   선택은 **SECTION 12**.

5. **플랫폼 할인과 수수료의 중복 차감 방지**  
   `platform_discount_amount`가 `supplier_basis`를 건드리지 않으면, **플랫폼 마진**은 대략  
   `customer_charge_amount - supplier_payable_amount` 와 `platform_fee_amount`·`platform_discount_amount` 관계로 표현 가능(정확한 P&L 계정과목은 운영 정의).

### 2-3. “할인 후 실결제 하나로 allocation 돌리기” 금지

- `customer_charge_amount`만으로 `supplier_basis_amount`·`supplier_payable_amount`를 **역산하지 않는다**.  
- 반드시 스냅샷에 **부담 주체·정책 ID**를 남기고, 위 불변식을 **검증 가능한 형태**로 저장한다 (`TEST-RUN-ERP-001` 계열 검증에 포함).

---

## SECTION 3 — 가격 우선순위 (Q2)

### 3-1. 확정안(설계 제안)

**원칙**: B2B 회계 정합성을 위해 **“최종 적용 정책 1개(승자) + 부담 주체 명시 + 스냅샷”** 을 기본으로 한다.

| 단계 | 설명 |
|------|------|
| 1. 후보 수집 | 수동 override, 식당별 특별가, 기간 프로모션, 공급자 제안가, RFQ 계약가, `customer_product_prices`, listing `commerce_price` 등에서 **적격 후보**만 목록화. |
| 2. **우선순위 숫자** | 정책마다 `priority` (작을수록 강함 등 **팀 규약** 고정). |
| 3. **충돌 해소** | 동일 품목·동일 식당에 복수 적격 시 **우선순위 가장 강한 정책 1개만 채택** — **자동 “최저가” 적용은 기본값으로 하지 않는다**(의도치 않은 마진 붕괴 방지). |
| 4. **중첩** | 기본 **금지**. “쿠폰 + 기간할인” 등이 필요하면 **명시적 `stacking_group` 허용표**를 별도 제품 결정으로 연다. |
| 5. **수동 override** | 존재 시 **항상 최상위** (운영 사고 방지를 위해 관리자 감사 로그 필수 — 별도 정책). |

**우선순위 예시(조정 가능 — SECTION 12)**  
1. 수동 주문/가격 override(관리자)  
2. 식당별 특별가(플랫폼 관리)  
3. 기간 프로모션(플랫폼)  
4. RFQ 계약가(해당 주문이 RFQ 출처일 때만)  
5. `customer_product_prices` (공급자 CRM — storefront에선 **명시적으로 끈 경우만**)  
6. listing `commerce_price` (현행 storefront 기본)

---

## SECTION 4 — 할인 주체 (Q3)

| `burden_type` | `customer_charge` | `supplier_basis` / `supplier_payable` | `platform_fee` / 플랫폼 P&L |
|---------------|-------------------|----------------------------------------|----------------------------|
| **platform** | 감소 | 기본 유지(설계안) — 공급자 지급 **불변** 가능 | 플랫폼이 할인만큼 **비용**; 수수료는 SECTION 2 안 A/B에 따름 |
| **supplier** | 감소 | **`supplier_discount_amount`** 로 기준·지급 감소 | 수수료 기준도 같이 낮아질지(안 A)는 정책 |
| **mixed** | 감소 | `platform_burden_rate` / `supplier_burden_rate`로 **할인 금액 분할** 후 각각 위 두 행의 규칙 적용 | 분할 비율은 **정책 스냅샷**에 기록 |

**allocation / `supplier_payables`**: 확정 시점에 **이미 스냅샷된** `supplier_basis_amount`, `supplier_discount_amount`, `platform_fee_amount`, `supplier_payable_amount`를 사용. **사후 listing 가격 변경으로 원장을 바꾸지 않는다.**

**`payments`**: 여전히 **실제 수금 이벤트 SSOT**; 금액은 `customer_charge`와 대사.

---

## SECTION 5 — 기간 할인 데이터 모델 (Q4, 제안만)

### 5-1. `pricing_policies` (후보)

| 컬럼 | 타입·메모 |
|------|-----------|
| `id` | uuid PK |
| `name` | text |
| `policy_type` | `fixed_price` \| `amount_discount` \| `percent_discount` (확장 여지) |
| `burden_type` | `platform` \| `supplier` \| `mixed` |
| `platform_burden_rate` | numeric — mixed일 때만 의미 |
| `supplier_burden_rate` | numeric — 합이 1이 되도록 제약 검토 |
| `starts_at`, `ends_at` | timestamptz — **KST/UTC 중 하나로 SSOT** (SECTION 12) |
| `timezone` | text — 표기·경계 판정용 |
| `status` | `draft` \| `active` \| `inactive` \| `expired` 등 |
| `priority` | int — SECTION 3 |
| `created_by`, `approved_by` | uuid — Q6과 연계 |
| `created_at`, `updated_at` | timestamptz |

**만료**: 스케줄러가 `status`만 바꾸고 **과거 주문 스냅샷은 변경하지 않는다**.

### 5-2. `pricing_policy_targets` (후보)

| 컬럼 | 메모 |
|------|------|
| `pricing_policy_id` | FK |
| `target_type` | `listing` \| `restaurant_tenant` \| `supplier_tenant` \| `segment` |
| `target_id` | uuid — `segment`이면 segment 테이블 FK |

**조합**: 복수 행으로 AND/OR을 표현할지 — **기본은 AND(모두 일치)** 로 단순화하고, 복잡 조합은 후속.

---

## SECTION 6 — 식당별 타깃 할인 (Q4 확장, 제안만)

- **현행**: 고객별 타깃 CASE D 없음 (`DISCOUNT-FORENSIC-001`).  
- **제안**: `pricing_policy_targets.target_type = 'restaurant_tenant'` + `listing` 조합으로 “특정 식당 + 특정 상품”을 표현.  
- **세그먼트**: 별도 `customer_segments` / 멤버십 테이블이 생기면 `target_type = 'segment'` 로 연결(미구현 전제).

---

## SECTION 7 — 가격 확정 흐름 (Q5)

### 7-1. 권장: **주문 생성 시점 스냅샷**

| 이유 | 설명 |
|------|------|
| 식당 UX | 체크아웃·카카오 요약에 본 금액 = 이후 청구와 일치 |
| ERP | `commerce_order_items`·(향후) price snapshot이 **불변** |
| allocation | `paid` 이후 allocation이 **동일 스냅샷**을 읽음 |

### 7-2. 대안: 결제 확정 시점 재가격

- **리스크**: 식당이 본 금액과 `paid` 이후 금액 불일치, CS·규제 분쟁.  
- **가능 조건**: “결제 시점 재가격”을 도입하려면 UI·법적 고지·동의 흐름이 선행(본 문서에서 구현 제안 없음).

**확정**: 기본안은 **주문 생성 시 스냅샷**; 반대안은 SECTION 12에서 제품이 명시적으로 선택할 때만.

---

## SECTION 8 — ERP 연동 설계 (Q1·Q3·현행 코드와의 맞물림)

### 8-1. `payments` (SSOT 유지)

- **변경 금지**(요청 준수).  
- **금액**: `customer_charge` 합계와 **대사** (현행: `commerce_orders.total_amount` = `tryRecordPlatformReceivablePayment`의 `amount`).  
- 할인이 생기면 **주문 헤더·라인 스냅샷의 `customer_charge` 합 = `payments.amount`** 가 되도록 운영 규칙을 맞춘다.

### 8-2. `commerce_order_allocations`

- **현행**: `item_amount` = 주문 `total_price` 기반.  
- **향후**: 스냅샷에 따라  
  - `item_amount`를 **`supplier_basis_amount`** 로 두고,  
  - 별도 컬럼으로 `customer_charge_amount`, `platform_discount_amount`, `supplier_discount_amount`를 넣거나,  
  - 또는 **1:1 보조 테이블** `commerce_order_item_price_snapshot`에만 두고 allocation은 FK로 참조 — **성능·마이그레이션 트레이드오프**는 SECTION 10.

### 8-3. `supplier_payables`

- **현행**: `payable_amount` = allocation의 `supplier_payable_amount`.  
- **향후**: allocation에 분리 금액이 있으면 **그 스냅샷을 그대로 복사** (확정 후 불변).

### 8-4. 검증(문서화만)

- `TEST-RUN-ERP-001`에 **“할인 후에도 불변식 2-2 유지”** 절을 추가하는 것을 권장(별 커밋).

---

## SECTION 9 — 세금계산·정산 관점 (시스템 설계만)

| 질문 | 설계 관점 답(확정은 SECTION 12) |
|------|----------------------------------|
| 식당 매출 표시 | UI·내부 리포트는 **`customer_charge_amount`** 를 “청구·수금 기준”으로 쓰는 것이 자연스러움. |
| 공급자 매입/지급 | **`supplier_payable_amount`** 가 지급 원장과 일치. |
| `supplier_basis_amount` | 계약·분쟁·리베이트·감사 추적용 **참고 축**으로 유지할지. |
| 플랫폼 마진 | `platform_fee_amount` + (플랫폼이 가져가는 기타) − `platform_discount_amount` 등으로 **내부 관리 회계**를 구성할 수 있음 — 단일 숫자로 압축하지 말 것. |

---

## SECTION 10 — migration 필요 목록 (설계 기준, **실행은 별도 지시**)

1. **`pricing_policies` / `pricing_policy_targets`** (SECTION 5~6) — RLS·`is_admin()`·감사 로그 연계 설계 필요.  
2. **`commerce_order_items` 확장 또는 `commerce_order_item_price_snapshot` 신설** — SECTION 2 금액·`applied_policy_id`·부담 비율 스냅샷.  
3. **`commerce_order_allocations` 컬럼 추가 또는 snapshot FK** — allocation이 고객 청구와 공급자 기준을 동시에 갖도록.  
4. **`supplier_payables`** — 필요 시 감사·리포트용 컬럼(예: `customer_charge_amount` 복사 여부) — **중복 저장 vs 조인** 트레이드오프.  
5. **CHECK 제약** — 예: `customer_charge = supplier_basis - platform_discount - supplier_discount`, `supplier_payable = supplier_basis - supplier_discount - platform_fee` 등 **정책 확정 후** DB에 고정.  
6. **기존 주문 backfill 정책** — 신규 컬럼 도입 시 `supplier_basis = total_price`, 할인 0으로 채울지.

---

## SECTION 11 — 구현 우선순위 제안

| 순위 | 내용 |
|------|------|
| **P0** | 품목 스냅샷에 4+2 금액(섹션 2) + `applied_policy_id` + `burden_type` 확정 — **스키마·불변식** |
| **P1** | `createCommerceOrder` 가격 결정 파이프라인(우선순위 엔진) — **플랫폼 관리 정책만** |
| **P2** | 기간 프로모션 활성/비활성·타임존 |
| **P3** | mixed 부담·세그먼트·RFQ 가격과의 자동 병합 |
| **나중** | 공급자 자율 제안가 + 승인 워크플로(Q6 옵션 B/C) |

---

## SECTION 12 — 확정이 필요한 정책 결정 목록

1. **`supplier_basis_amount`의 정의**: 리스트가인가, 할인 전 계약가인가, `commerce_price`인가.  
2. **`platform_fee_amount` 계산 기준**: SECTION 2 안 A vs B.  
3. **우선순위 표**: SECTION 3 예시를 채택할지, RFQ·특가의 순서를 바꿀지.  
4. **할인 중첩 허용 여부** 및 예외 표.  
5. **주문 생성 vs 결제 확정** 스냅샷 최종 선택.  
6. **타임존 SSOT** (KST vs UTC).  
7. **`customer_product_prices`를 storefront에 연결할지** — 연결 시 우선순위·오염 방지.  
8. **취소·환불 시** 할인/수수료/공급자 지급 역분개 규칙(현행 confirmed allocation 비자동 취소와의 정합).  
9. **세금계산서·대외 공시 금액**이 어느 축과 일치해야 하는지(운영·세무 자문과 별도).  
10. **“최저가 자동 적용”** 상품 정책 허용 여부(기본 비권장).  
11. **공급자 listing 가격 변경**과 할인 정책 충돌 시 **승자 규칙**.

---

## SECTION 13 — 반드시 사람이 결정해야 하는 정책 (보고·승인용 요약)

- SECTION 12 항목 1~11 전부 — **숫자 정의 하나가 틀리면** allocation·`supplier_payables`·`payments` 대사 전체가 틀어진다.  
- **플랫폼만 정책 생성** 원칙(Q6 권장)을 채택할지, 공급자 제안·승인 흐름을 열지 여부.  
- **mixed 부담** 비율을 실제 캠페인에서 쓸지 여부.

---

## 부록 — 현행 코드 인용 (열람 기준)

**storefront 주문 금액**

```671:699:resturant_os/src/actions/buy.ts
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
  // ...
  const total_amount = lines.reduce((s, l) => s + l.line_total, 0)
```

**allocation `item_amount`·수수료**

```267:285:realmyos/src/actions/admin/commerce-allocation.ts
    const item_amount =
      typeof it.total_price === 'number' && Number.isFinite(it.total_price) && it.total_price >= 0
        ? it.total_price
        : Math.max(0, Math.round((it.unit_price ?? 0) * (it.quantity ?? 0)))

    const platform_fee_amount = Math.round((item_amount * feeNum) / 100)
    const supplier_payable_amount = item_amount - platform_fee_amount
```

**공급자 주문 할인(참고 — storefront와 분리)**

```203:217:realmyos/src/actions/order.ts
  const discount_raw = Number(input.discount_amount ?? 0)
  const point_raw    = Number(input.point_used      ?? 0)
  // ...
  if (discount_amount > totals.total_amount) {
    return { success: false, error: `기간할인(${discount_amount})이 주문금액(${totals.total_amount})을 초과합니다.` }
  }
  if (point_used > totals.total_amount - discount_amount) {
```

---

**문서 끝**
