| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

PLATFORM-ERP-P0-001: storefront `commerce_orders`가 관리자에 의해 **`paid` 확정**될 때 `public.payments`에 **플랫폼 inbound 수금 1건**을 자동 기록한다. settlement·allocation·PG 등 **범위 외**.

## 2. 관련 `tasks.md` ID

- **`[PLATFORM-ERP-001]`** · 선행: `docs/PLATFORM-ERP-DESIGN-001.md`, `docs/PLATFORM-ERP-ARCH-001.md`

## 3. 수정 파일 목록

- `supabase/migrations/20260515100000_add_commerce_order_id_to_payments.sql` (신규 — **운영 적용은 별도 승인**)
- `src/actions/admin/commerce.ts` — `updateCommerceOrderStatus`, `tryRecordPlatformReceivablePayment`, `commerce_orders` select에 `total_amount`
- `docs/tasks.md`
- `docs/worklogs/2026-05-14_feat_platform-erp-p0-001-commerce-payments.md` (본 파일)

## 4. 변경 내용 요약

- **migration**: `commerce_order_id` FK·부분 UNIQUE·`order_id` XOR CHECK·`payment_method` CHECK에 `bank_transfer`/`kakao_manual` 추가 (`payment_method::text` 캐스트).
- **액션**: `paid` 전이 성공 + `commerce_order_status_changed` 로그 성공 후, `payments` 중복(`commerce_order_id`) 조회 → 없으면 INSERT. 실패 시 `platform_payment_insert_failed` + `console.error`, **주문 성공 유지**. 성공 시 `platform_payment_recorded`.
- **payload**: `tenant_id`·`payee_tenant_id` = `PLATFORM_OWNER_TENANT` (`commerce.ts` 기존 상수), `payer_tenant_id` = 식당 `tenant_id`, `order_id` = null, `commerce_order_id` = 주문 id, `direction` inbound, `status` confirmed, `payment_date`/`due_date` KST 당일 문자열.

## 5. migration 여부

**파일 추가**: `20260515100000_add_commerce_order_id_to_payments.sql` — **본 턴에 DB 실행 없음**(운영 적용 별도).

## 6. 테스트 결과

- `npm run lint`: 기존 프로젝트 다른 파일에서 에러·경고 발생 — **본 변경 파일(`commerce.ts`)은 IDE lints 무오류**.

## 7. 남은 위험

- 운영 DB에 `payments.payment_method` CHECK **이름·정의가 다르면** migration `DROP CONSTRAINT`가 **의도한 제약만 제거하지 못할 수 있음** — 적용 전 스키마 확인 필요.
- **`docs/rules.md` [RULE-19]**: 본 함수는 기존대로 `commerce_orders` update + `admin_logs` 후 **`payments` 추가 write** — 주문 확정과 수금 row를 **한 RPC 트랜잭션으로 묶지 않음**(요구사항: `payments` 실패 시에도 **주문 paid 유지**). P0 범위에서 **RPC 추가 없음**.

## 8. 다음 권장 작업

- 운영 DB에 migration 적용 후: 관리자 `paid` 전환 1건으로 `payments`·`admin_logs` 검증.
- `getPlatformRevenue` 등에 **`commerce_order_id` 매출 반영**(P1).
