| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

DISCOUNT-ENGINE-P0-001: storefront `createCommerceOrder` 시 `pricing_policies` 기반으로 단일 승자 정책을 고르고, `commerce_order_items`에 `unit_price`·`base_price`·`applied_policy_id`·`applied_policy_snapshot`을 남기는 최소 가격 엔진을 구현한다. 식당은 정책 테이블을 직접 SELECT하지 않는다(RLS + SECURITY DEFINER RPC).

## 관련 `tasks.md` ID

- `[DISCOUNT-ENGINE-001]` — 작업 이력 갱신
- 맥락: `[DISCOUNT-ENGINE-POLICY-001]`·`DECISIONS.md` [D-020]

## 수정 파일 목록

- `supabase/migrations/20260515400000_create_pricing_policies.sql` — 테이블·인덱스·RLS·`commerce_order_items` 컬럼·체크아웃/로그용 RPC
- `src/lib/pricing-policy-engine.ts` — 티어 매칭·우선순위·적용·RPC JSON 파서
- `src/actions/admin/pricing-policies.ts` — 관리자 CRUD·폼 옵션
- `src/components/commerce/CommercePricingPoliciesClient.tsx` — 최소 UI
- `src/app/(admin)/admin/commerce/pricing/page.tsx` — 관리자 경로
- `src/components/layout/AdminSidebar.tsx` — 메뉴 링크
- `docs/tasks.md` — Epic 상태·작업 이력
- (식당OS 저장소) `resturant_os/src/lib/pricing-policy-engine.ts` — 동일 엔진 규칙
- (식당OS 저장소) `resturant_os/src/actions/buy.ts` — 주문 생성 연동

## 변경 내용 요약

- `pricing_policies` / `pricing_policy_targets` DDL 및 관리자 전용 RLS.
- `commerce_order_items`에 스냅샷 컬럼 3종 추가.
- 식당 세션은 `fetch_active_pricing_policies_for_checkout` RPC로만 활성 정책 JSON을 받고, TS 엔진으로 라인별 승자 1건 선택 후 적용.
- 실패 시 `log_pricing_engine_admin_event`로 `admin_logs`에 기록(주문은 `commerce_price` 폴백으로 계속).
- 장바구니 라인별 `assertListingBuyable` N회를 제거하고, 리스팅 단일 IN 조회 + 정책 1회 RPC로 N+1 방어.

## migration 여부

- **파일 추가(미적용)** — `20260515400000_create_pricing_policies.sql` (운영 적용은 별도 승인)

## 테스트 결과

- `realmyos`: `npm run build` — 성공
- `resturant_os`: `npm run build` — 성공

## 남은 위험

- migration 미적용 환경에서는 RPC·컬럼 부재로 주문 INSERT 실패 가능(배포 순서: DB 먼저).
- `tenants.role = 'restaurant'` 가정으로 폼 식당 목록을 채움 — 스키마 불일치 시 폼만 실패.
- P0 관리자 UI는 정책당 타깃 행 1건만 생성(복수 타깃 조합 UI는 P1).

## 다음 권장 작업

- 스테이징에 migration 적용 후 E2E로 주문 1건 스냅샷 검증.
- `supplier_tenant_id` 타깃·주문 라인 공급자 컨텍스트 연결(티어 4 실사용).
- 자동 만료 배치·정책 스택킹은 설계 범위 밖(P1).

---

## SECTION 1: 사전 확인 결과 (코드 기준)

1. **createCommerceOrder** (`resturant_os/src/actions/buy.ts`): 기존에는 루프 안에서 `assertListingBuyable` → `commerce_product_listings.commerce_price`를 `unit_price`로 사용. 가격정책 조회 코드는 없었음.
2. **commerce_order_items**: 기존 스냅샷은 `unit_price`·`total_price`·`listing_title` 등; `applied_policy_id` / `base_price` / `applied_policy_snapshot` 없음 → migration으로 추가.
3. **UUID**: 기존 commerce migration과 동일하게 `gen_random_uuid()` 패턴 사용.

## SECTION 2: `pricing_policies` 구조

- 식별·이름·`policy_type`(fixed_price | amount_discount | percent_discount)·`burden_type`(P0는 플랫폼 중심, mixed/supplier 로직 미구현)·`discount_value`·선택 `platform_fee_rate_override`·기간·`status`·`priority`·감사 필드·타임스탬프.

## SECTION 3: 가격 결정 흐름

1. 카트의 고유 `listing_id`에 대해 리스팅을 일괄 조회해 매입 가능 여부·`commerce_price`를 `base_price`로 확정.
2. 동일 `listing_id` 배열 + `ctx.tenant_id`(식당)로 RPC 호출 → 활성 정책 JSON.
3. 엔진이 라인별 **단일** 승자 정책 선택 → `applyPricingPolicy`로 `unit_price` 계산.
4. 정책 없음·RPC 실패·적용 예외 시 `commerce_price` 폴백.

## SECTION 4: `createCommerceOrder` 연동

- `resturant_os`는 `realmyos` 패키지를 import하지 않으므로, 동일 규칙의 `pricing-policy-engine`을 식당OS `src/lib`에 두고 `buy.ts`에서만 사용.
- INSERT 시 `base_price`·`applied_policy_id`·`applied_policy_snapshot` 포함.

## SECTION 5: 스냅샷 저장 구조

- `applied_policy_snapshot`: `policy_id`, `policy_type`, `discount_value`, `priority`, `burden_type`, `name`, `platform_fee_rate_override` 등 주문 시점 복구용 필드.

## SECTION 6: 정책 우선순위 구조

- 타깃 티어: (1) listing+restaurant 동시 (2) restaurant만 (3) listing만 (4) supplier만 — P0는 주문 라인에 공급자 미전달로 사실상 미사용 (5) `applies_to_all`.
- 동일 티어에서는 `priority` DESC, tie-break `id` 문자열.

## SECTION 7: fallback 및 `admin_logs`

- RPC `log_pricing_engine_admin_event`로 `pricing_policy_lookup_failed` / `pricing_policy_apply_failed` 기록(payload에 `listing_id`, `restaurant_tenant_id`, `policy_id`, `error` 등).
- RPC 미배포 시 로그만 실패할 수 있음(`console.error`).

## SECTION 8: N+1 방어

- 리스팅: `IN (listing_ids)` 단일 쿼리.
- 정책: RPC 1회 + 메모리 맵 `listing_id → policy`.

## SECTION 9: UI 위치 및 구조

- 경로: `/admin/commerce/pricing` — 목록·등록 폼·활성/비활성 버튼. 사이드바 「가격 정책」.

## SECTION 10: 남은 limitation

- **supplier_basis** 주문/할당 축 미분리([D-020] P0 범위 밖).
- **멀티 조건 타깃**: DB는 nullable 조합 허용하나, 관리자 UI는 정책당 타깃 1행만.
- **자동 만료** 배치 없음(쿼리/RPC에서 `starts_at`/`ends_at`만 필터).
- **allocation / supplier_payables / payments** 스키마·금액 기준 변경 없음.
- **platform_margin** 실시간 계산·저장 없음.
