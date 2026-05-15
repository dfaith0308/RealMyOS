| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

paid storefront 주문에서 **공급자별 지급 예정(payable) 금액**을 품목 단위로 추적할 수 있는 최소 구조를 추가한다. 정산 자동화·실지급·공급자OS 연동은 범위 밖.

## 관련 `tasks.md` ID

- **PLATFORM-ERP-P2-001** (`[PLATFORM-ERP-001]` 하위)

## 수정 파일 목록

- `supabase/migrations/20260515200000_create_commerce_order_allocations.sql` (신규)
- `src/actions/admin/commerce-allocation.ts` (신규)
- `src/actions/admin/commerce.ts` — `getCommerceOrderDetail`·`updateCommerceOrderStatus` 연동
- `src/app/(admin)/admin/commerce/allocations/page.tsx` (신규)
- `src/components/commerce/CommerceAllocationsClient.tsx` (신규)
- `src/components/commerce/OrdersClient.tsx` — 주문 상세 allocation 표시
- `src/app/(admin)/admin/commerce/orders/page.tsx` — allocation 페이지 링크
- `docs/tasks.md`
- `docs/worklogs/2026-05-14_feat_platform-erp-p2-001-commerce-allocations.md` (본 파일)

## 변경 내용 요약

- `commerce_order_allocations` 테이블 + 품목당 UNIQUE + RLS(관리자 전체, 공급자 SELECT만).
- `commerce_product_listings.supplier_tenant_id` nullable FK 추가(명시적 fulfillment 공급자).
- `createCommerceOrderAllocations` / `confirmCommerceAllocation` / 관리자 목록 집계 API.
- `payment_status=paid` 주문에 한해 라인별 스냅샷 INSERT(전부 성공 가능할 때만 커밋, 실패 시 롤백 + `commerce_allocation_failed` 로그).
- `/admin/commerce/allocations` UI 및 주문 상세 모달에 allocation 표시.

## migration 여부

- **파일 추가** — `20260515200000_create_commerce_order_allocations.sql` (**운영 적용은 별도 승인**)

## 테스트 결과

- `npx tsc --noEmit` — **pass**

## 남은 위험

- 공급자 집계는 allocation 행 **최대 25,000건** 기준(초과 시 과소).
- 기존 platform listing은 `supplier_tenant_id` 미설정 시 allocation 생성 실패(의도된 보수 동작).

## 다음 권장 작업

- 관리자 listing UI에서 `supplier_tenant_id` 편집.
- 취소·환불 시 allocation 정합성(자동 cancelled 등) 별 과제.

---

## SECTION 1 — 사전 확인 결과

- **`commerce_order_items`**: `id`, `order_id`→`commerce_orders`, `listing_id`, `quantity`, `unit_price`, `total_price`, `listing_title`, `created_at` — **`commerce_order_id`/`deleted_at` 없음** (주문 FK 컬럼명은 `order_id`).
- **`commerce_product_listings`**: 기존에 **`supplier_tenant_id` 없음** — `tenant_id`, `product_id`, `owner_type`, `owner_tenant_id` 존재. 플랫폼 상품은 코드상 `products.tenant_id`가 플랫폼 sentinel인 경우가 있어 **단독으로는 fulfillment 공급자 식별 불가** → migration으로 `supplier_tenant_id` 추가.
- **기존 allocation**: `payment_allocations`·`collection_allocations`는 **RFQ/payments** 축 — storefront 품목 payable과 **스키마 목적이 달라 신규 테이블 사용**.
- **`platform_fee_rate`**: `admin_settings` 키, `settlement-control`과 동일하게 **정수 퍼센트** 파싱; 실패 시 **0** (worklog에 명시).
- **UUID**: 기존 migration 패턴 **`gen_random_uuid()`**.

## SECTION 2 — `commerce_order_allocations` 구조

- 품목 1행당 1 allocation(`commerce_order_item_id` UNIQUE), 금액 스냅샷·`platform_fee_rate`(numeric)·`status` pending|confirmed|cancelled, 수동 확정 시 `confirmed_at`/`confirmed_by`.

## SECTION 3 — 공급자 식별 방식

1. `commerce_product_listings.supplier_tenant_id` (NOT NULL 이고 플랫폼 sentinel 아님)  
2. `owner_type === 'approved_supplier'` 이고 `owner_tenant_id` ≠ 플랫폼 sentinel  
3. `products.tenant_id` ≠ 플랫폼 sentinel  
4. 불가 시 **해당 주문 allocation 생성 전체 중단**(부분 insert 없음).

## SECTION 4 — platform_fee 계산

- `platform_fee_amount = round(item_amount * feeNumerator / 100)` (`feeNumerator` = `admin_settings.platform_fee_rate` 정수 파싱 실패 시 0).
- `supplier_payable_amount = item_amount - platform_fee_amount`.
- `item_amount`는 **`total_price` 스냅샷 우선**.

## SECTION 5 — paid → allocation 생성 흐름

- `updateCommerceOrderStatus`에서 `paid` 확정 후 **`tryRecordPlatformReceivablePayment` 다음** `createCommerceOrderAllocations(order_id)` 호출.
- allocation 실패해도 **주문 paid·payments 유지**; 실패는 `commerce_allocation_failed` 로그(함수 내부).

## SECTION 6 — 수동 payable 확정 흐름

- `confirmCommerceAllocation`: 관리자만, `pending`→`confirmed`, `confirmed_at`/`confirmed_by` 기록, `commerce_allocation_confirmed` 로그. **되돌림·지급 실행 없음.**

## SECTION 7 — UI 위치 및 구조

- **`/admin/commerce/allocations`**: 공급자별 pending/confirmed 합계(최대 25k allocation 기준), 필터·행별 “지급 예정 확정” 버튼.
- **`/admin/commerce/orders`**: 헤더에 allocation 페이지 링크; 주문 상세 모달에 allocation 테이블 또는 paid인데 없으면 안내 문구.

## SECTION 8 — 중복 방지 / 부분 실패 방어

- DB UNIQUE(`commerce_order_item_id`) + 생성 전 기존 행 skip.
- **사전 검증 실패 시 insert 없음**; insert 중 오류 시 **이번 배치 insert 분만 DELETE 롤백**.

## SECTION 9 — limitation

- **settlement automation 없음**, **supplier payout 없음**, **취소·환불 시 allocation 자동 취소 없음**, **공급자OS 알림 없음**.
- **`updated_at` 자동 트리거 없음**(저장소 내 기존 패턴 부재).
