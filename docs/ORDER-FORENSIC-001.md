# ORDER-FORENSIC-001 — 주문등록 / 수금동시처리 / 적립금 / 수정제한

> **범위**: `realmyos` **공급자 테넌트 주문** (`orders`·`order_lines`·`payments`·`collection_allocations`) 경로.  
> **제외(명시)**: `commerce_orders`·식당OS storefront 주문은 **별 테이블·별 액션** (`CONTEXT.md` §136, `PAYMENT-FORENSIC-001.md`).  
> **DB 실측**: 본 저장소 작업에서 **운영 DB에 SELECT를 실행하지 않았다.** 고아 주문 건수·`NULL` 개수는 **아래 검증용 SQL만 제시**한다.

---

## SECTION 1 — 주문등록 구조 요약

| 단계 | 구현 위치 | 내용 |
|------|------------|------|
| Server action | `src/actions/order.ts` — `createOrder` | `customer_id` 필수·`customers` 테넌트 일치 검증, `products`·`product_costs`로 라인 스냅샷, `order_lines` insert |
| 거래처 연결 | 동 파일 `insert` | `orders.customer_id` = 입력값, `tenant_id` / `seller_tenant_id` = `ctx.tenant_id` |
| 스냅샷 | `order_lines` | `product_code`, `product_name`, `unit_price`, `cost_price`, `quantity`, `supply_price`, `vat_amount`, `line_total`, `tax_type`, `fulfillment_type` |
| 상태 | `input.status ?? 'confirmed'` | UI 기본 주문 생성은 `OrderCreateForm`에서 `status` 미전달 → **confirmed** |
| 감사 로그 | `order_logs` | `logOrder` — `action: 'create'` |
| 영업 연동 | `linkActionResult` | `action-log.ts` 경유 |

**별도 경로**: RFQ 낙찰 RPC `accept_bid_and_create_order_atomic` 는 migration 파일 **`20260506180000_update_accept_bid_add_order_item.sql`**(이전 초안: `20260506150000_create_accept_bid_atomic.sql`)에 **`INSERT INTO public.orders (...)`** 가 정의되어 있으며, 파일 상단 주석상 **Draft migration only** 이다. 해당 INSERT는 **`customer_id` 컬럼을 쓰지 않고** `tenant_id`·`buyer_tenant_id`(동일 `p_tenant_id`)·`rfq_id`·`bid_id` 등만 설정한다. 공급자 CRM `createOrder`와 **동일 검증·동일 컬럼 집합을 보장하지 않음**.

---

## SECTION 2 — 수금동시처리 구조

| 항목 | 구현 |
|------|------|
| UI | `src/components/order/OrderCreateForm.tsx` — `doPayment` 체크 시 `paymentAmount`·`paymentDate`·`paymentMethod` |
| 순서 | **선** `createOrder` → **후** `createPayment` (`src/actions/payment.ts`) |
| 연결 | `createPayment({ ..., order_id: res.data.order_id })` |
| 수금 RPC | `payment.ts` — `supabase.rpc('create_payment_atomic', { ..., p_order_id })`. **`realmyos/supabase/migrations/` 에서 해당 함수 DDL은 검색되지 않음**(저장소에 본문 없음). `docs/tasks.md` **`[DB-CHECK-001]`** 및 worklog `docs/worklogs/2026-05-06_sup-danger-004_payment-fallback-remove.md` 에는 **운영 DB에 RPC 객체·본문이 존재**하고 앱 호출과 대응한다고 기록됨 |
| 부분 수금 | `collectAmt <= finalAmount` 만 UI에서 검증. `createPayment`는 **양의 정수**만 검증; **잔액 대비 상한**은 RPC 내부 정책(본 문서는 코드만 열람, RPC 본문 미첨부 시 세부 한도는 **미확인**) |
| 실패 시 | 주문은 **유지**, 수금 실패 시 UI에 **명시적 에러**·`paymentFailed` 상태·수동 재시도 링크 (`OrderCreateForm.tsx` 주석·분기) |
| 원장 배분 | `collection_allocations` — 취소 시 `cancel_order_and_void_allocations` 가 `status='voided'` (`20260507111000_create_cancel_order_and_void_allocations.sql`) |

**원자성**: 주문+수금이 **단일 DB 트랜잭션으로 묶여 있지 않음** — 네트워크/중간 실패 시 **주문만 생성** 상태 가능(이미 UI로 노출).

---

## SECTION 3 — 적립금 할인 구조

| 구분 | 사실 (코드 기준) |
|------|------------------|
| UI 라벨 | `OrderCreateForm` — 「적립금 사용」 |
| 저장 위치 | `orders.point_used` (정수, 0 이상), `orders.discount_amount` |
| 계산 | 라인 합 `total_amount` 대비 할인·포인트 상한 — `createOrder` / 클라이언트 이중 검증 |
| 별도 적립금 잔고 테이블 갱신 | **`src`에서 `point_used` insert 외 갱신 코드 없음** (grep 기준) — **잔고 차감형 “포인트 시스템”으로 보이지 않음** |
| `final_amount` | DB generated / 주석 — `ledger-calc.ts` — `final_amount = total - discount - point` 개념 |
| 취소 시 롤백 | `cancel_order_and_void_allocations` — **point_used 역분개·적립금 환급 로직 없음** (SQL 본문 기준) |
| 카페24 연계 | `PRODUCT.md` §카페24 전략·이동 서술만 확인; **주문 `point_used`와 카페24 데이터를 연결하는 코드 없음** |

**판정**: 운영 UI에서 쓰이는 **주문 헤더 할인 필드**이며, **포인트 원장·자동 환급**은 구현되어 있지 않다(dead/미완이 아니라 **필드 수준 기능**).

---

## SECTION 4 — 주문 ↔ 거래처 연결 무결성 평가

| 경로 | `customer_id` |
|------|----------------|
| `createOrder` | **필수** + `customers` 존재·테넌트 검증 → **앱 레이어에서 NULL 방지** |
| `createPayment` | **필수** |
| RFQ/원자 RPC 등 다른 `orders` insert | **`accept_bid_and_create_order_atomic`**: `customer_id` 미설정·`buyer_tenant_id`만 설정(위 migration). **`orders.customer_id` NULL 허용 여부**는 본 턴에서 **테이블 CREATE 마이그레이션을 전부 스캔하지 않았으므로 미단정** |

**재발 가능성**: `createOrder`·`OrderCreateForm` 경로로는 **`customer_id` 없이 주문 생성 불가**(서버에서 즉시 에러). **다른 RPC·과거 데이터·직접 SQL**은 별도. **UI bypass**: 동일 Server Action을 호출하면 동일 검증; **다른 insert 경로**는 위 RFQ RPC와 같이 분리 평가.

### 고아 주문·데이터 현황 (저장소 / 로컬 DB 미조회)

**본 저장소 작업에서 운영 DB에 대한 SELECT는 실행하지 않았다.** 건수·`created_at` 분포·복구 가능 여부는 **미보고**.

검증용 예시 SQL(읽기 전용·운영에서 실행 시 스키마에 맞게 조정):

```sql
SELECT count(*) FROM public.orders
WHERE deleted_at IS NULL AND customer_id IS NULL;

SELECT count(*) FROM public.orders
WHERE deleted_at IS NULL AND buyer_tenant_id IS NULL;  -- 컬럼 존재 시에만 의미 있음

SELECT id, order_number, created_at, status, tenant_id, seller_tenant_id, customer_id, buyer_tenant_id
FROM public.orders
WHERE deleted_at IS NULL AND (customer_id IS NULL OR buyer_tenant_id IS NULL)
ORDER BY created_at DESC
LIMIT 100;
```

**복구 가능성**: `order_lines`·`payments`·`contact_logs` 등과 조인해 거래처를 좁힐 수 있는 경우 / 식별 불가인 경우는 **행 단위로만 판단 가능** — 본 문서에서는 결론 없음.

---

## SECTION 5 — 주문 수정 제한 정책 분석

| 항목 | 내용 |
|------|------|
| 설정 키 | `settings` 테이블, `key = 'order_edit_lock_days'`, **`tenant_id` 필수** (`order.ts` `getLockDays`) |
| 기본값 | `getLockDays` 실패 시 **7**; `DEFAULT_SETTINGS.order_edit_lock_days = 7` (`src/constants/settings.ts`); `getSettings` 경로도 7 폴백 (`orders/[id]/edit/page.tsx`) |
| PRODUCT 기본값 표 | `order_edit_lock_days` **7일** — `docs/PRODUCT.md` 기본설정 표(3511–3512행) |
| 제한 기준 시각 | **`orders.created_at`** (`edit/page.tsx` `diffDays`, `updateOrder` 동일) |
| **아닌 것** | `order_date`, `paid_at`, `delivery_date` — 코드에서 **사용 안 함** |
| UI | `OrderEditForm` — `isLocked` 시 저장 버튼 비표시, 필드 `disabled` |
| Server | `updateOrder` — `diffDays > lockDays` 시 `{ success: false, error: '... (${lockDays}일 초과)' }` |
| DB constraint | 본 조사 범위에서 **일수 제한용 CHECK/트리거 파일 미확인** |

**문서·코드 갭**: `docs/PRODUCT.md` 주문 수정 정책(1413–1414행)은 **직원(staff) vs 관리자** 구분을 서술하나, `updateOrder`는 **역할 분기 없이** 동일 `lockDays` 적용.

---

## SECTION 6 — “30일 제한” 위치 및 코드

- **주문 수정 잠금**의 코드·문서 기본값은 **7일**이지 30일이 아니다.
- **30일**이 나오는 설정 예: `DEFAULT_SETTINGS.new_customer_days = 30` (신규 고객 판단), `danger_days: 30` 등 **CRM/경고** — `order_edit_lock_days`와 **별 키**.
- **`docs/rules.md`·`docs/DECISIONS.md`**: 본 턴에서 `order_edit`·`주문 수정` 문자열 **grep 결과 0건** — 주문 수정 일수 정책의 **문서 근거는 주로 `PRODUCT.md`·`CONTEXT.md`·설정 UI** 쪽에 있음.

관련 코드 참조:

- `src/actions/order.ts` — `getLockDays`, `updateOrder` 잠금 분기  
- `src/app/(app)/orders/[id]/edit/page.tsx` — `diffDays` / `isLocked`  
- `docs/PRODUCT.md` — 기본설정 표 `order_edit_lock_days` 7일, 주문 수정 정책 절

---

## SECTION 7 — 50일 변경 시 영향 분석

| 영역 | 50일로 변경 시 |
|------|------------------|
| 변경 방법 | 테넌트 `settings.order_edit_lock_days` 값 변경(또는 기본 상수 변경 시 신규 테넌트만 영향) |
| ledger / receivable 계산 | `ledger.ts`·`ledger-calc.ts` grep 기준 **`order_edit_lock_days` 미사용** → **직접 영향 없음** |
| 월별 정산·export | 동일 이유로 **직접 연쇄 없음** |
| `admin_logs` | 수정 제한 일수 자체는 로그 키가 아님 — **없음** |
| 감사 추적 | 오래된 주문 수정 **가능 기간만 연장** — 과거 수정 가능해져 **감사·분쟁 리스크는 증가**할 수 있음(정성 평가) |

**판정**: **단순 정책 상수·설정값 변경에 가깝고**, 원장 수식·배치잡에 대한 **기계적 연쇄는 코드상 없음**.

---

## 운영 리스크 등급 (요청 §6 요약)

| 등급 | 항목 | 근거 |
|------|------|------|
| **HIGH** | 주문·수금 순차 처리로 인한 **미수금·상태 불일치** | `OrderCreateForm` + `createOrder` / `createPayment` 분리 |
| **HIGH** | **거래처(`customer_id`) 미연결 주문** 재발 가능성 | CRM 경로는 차단; RFQ RPC 등 **다른 insert 경로**·**과거 행**은 DB 조회 없이 단정 불가 |
| **HIGH/MID** | **원장·배분과 실제 현금 흐름 불일치** | RPC·할당·취소 void는 별도; 본 문서는 경로만 정리 |
| **MID** | `point_used` **명칭·운영 기대 vs 무잔고 시스템** | 음수 방지는 `createOrder`에서 `Math.max(0, …)` 및 상한 검증 |
| **MID** | 수정 잠금 **역할 예외 없음** | `PRODUCT.md` vs `updateOrder` |
| **LOW** | 잠금 일수만 연장 시 **단순 운영·UX** (과거 주문 편집 창 허용 범위) | `order_edit_lock_days` |

---

## SECTION 8 — 즉시 인지할 위험 TOP 5

1. **HIGH — 주문-수금 비원자성**  
   - **위치**: `OrderCreateForm.tsx` + `createOrder` / `createPayment`  
   - **원인**: 두 액션 분리 호출  
   - **영향**: 미수금·대사 시 “주문만 있고 수금 없음”

2. **HIGH — 다중 `orders` 생성 경로**  
   - **위치**: `createOrder` vs RFQ RPC `INSERT INTO orders`  
   - **원인**: 컬럼·검증 불일치 가능  
   - **영향**: CRM 주문과 RFQ 주문 **스키마·거래처 무결성 불일치**

3. **MID — `point_used` 명칭 vs 실제**  
   - **위치**: `orders.point_used`, UI 「적립금」  
   - **원인**: 별도 포인트 원장 없음  
   - **영향**: 운영자가 “잔액 차감”으로 오해·수동 장부와 불일치

4. **MID — 취소 시 포인트/할인 역분개 없음**  
   - **위치**: `cancel_order_and_void_allocations.sql`  
   - **원인**: 할당 void + status cancelled만  
   - **영향**: 회계 정책이 “취소 시 할인 환급”이면 **추가 프로세스 필요**

5. **MID — PRODUCT vs 코드(관리자 수정 예외)**  
   - **위치**: `PRODUCT.md` §주문 수정 정책 vs `updateOrder`  
   - **원인**: 역할별 예외 미구현  
   - **영향**: 관리자가 “언제든 수정” 기대 시 **거부됨**

---

## 참조 파일 (열람)

`src/actions/order.ts`, `src/actions/payment.ts`, `src/components/order/OrderCreateForm.tsx`, `src/components/order/OrderEditForm.tsx`, `src/app/(app)/orders/[id]/edit/page.tsx`, `src/constants/settings.ts`, `src/actions/settings.ts`, `src/lib/ledger-calc.ts`, `supabase/migrations/20260507111000_create_cancel_order_and_void_allocations.sql`, `supabase/migrations/20260506180000_update_accept_bid_add_order_item.sql`, `docs/PRODUCT.md`, `docs/CONTEXT.md`, `docs/tasks.md` (`[DB-CHECK-001]`)
