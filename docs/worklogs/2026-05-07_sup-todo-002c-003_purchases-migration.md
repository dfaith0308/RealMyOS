# SUP-TODO-002-C / SUP-TODO-003 — `purchases`·`payment_allocations` migration 정합

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |

## 작업 목적

운영 DB에 이미 생성된 `purchases`·`payment_allocations`와 동일하게, 저장소 migration SQL을 **FK·RLS `WITH CHECK`**까지 반영해 재현 가능한 SSOT로 맞춘다. **이번 턴에서 DB 추가 실행은 없음**(이미 적용됨).

## 관련 `tasks.md` ID

- `SUP-TODO-002-C` (분배 스키마 선행)
- `SUP-TODO-003` (매입 원장 `purchases` 선행 조건 충족)

## 수정 파일 목록

- `supabase/migrations/20260507030000_create_purchases.sql`
- `supabase/migrations/20260507040000_create_payment_allocations.sql`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-todo-002c-003_purchases-migration.md`

## 변경 내용 요약

### `purchases`

- 매입 원장: `tenant_id`, 상대/품목/수량/단가/합계/일자, `status` CHECK(`unpaid`|`partial`|`paid`), `order_id` 등.
- 인덱스: `(tenant_id, purchase_date DESC)`.
- RLS: `purchases_tenant_isolation` — `USING` + **`WITH CHECK`** (`tenant_id = get_my_tenant_id()`).

### `payment_allocations`

- 지급 분배: `tenant_id`, `payment_id`, `purchase_id`(nullable), `allocated_amount`.
- **FK**: `payment_id` → `public.payments(id)` **ON DELETE CASCADE**; `purchase_id` → `public.purchases(id)` **ON DELETE SET NULL**.
- 인덱스: `payment_id`, 부분 인덱스(`purchase_id IS NOT NULL`).
- RLS: `payment_allocations_tenant_isolation` — `USING` + **`WITH CHECK`**.

## migration 여부

- 저장소: 위 두 파일로 DDL 기록.
- 운영: 사용자 확인 기준 **이미 적용됨** — 본 세션에서 **재실행 없음**.

## 테스트 결과

- DB 실행 없음 — **미실행**.

## 남은 위험

- 앱·RPC 미구현: 분배 저장 시 **RULE-19** 원자 RPC 설계 필요.
- `payment_allocations.tenant_id`와 참조 행(`payments`/`purchases`)의 테넌트 일치는 **앱/RPC에서 검증** 권장(FK만으로는 교차 테넌트 참조 방지 불완전할 수 있음).

## 다음 권장 작업

- `SUP-TODO-002-C` UI + `create_disbursement_with_allocations`류 RPC.
- `SUP-TODO-003-A` `/purchases` 라우트 및 등록 폼.
