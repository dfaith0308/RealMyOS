# SUP-TODO-003-B/C/D — 매입관리 잔여 항목 감사 (문서만)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |

## 작업 목적

PRODUCT.md §6-7 매입관리의 003-B/C/D를 운영 DB 스키마와 대조해 **현재 구현 가능 범위**·**Phase 5 vs 후속 단계**를 결정한다. 이번 턴은 **코드 수정 없음**.

## 관련 `tasks.md` ID

- `SUP-TODO-003-B`, `SUP-TODO-003-C`, `SUP-TODO-003-D` (상위 `SUP-TODO-003`)

## 수정 파일 목록

- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-todo-003b-c-d_purchase-audit.md`

코드 변경 없음.

## 변경 내용 요약

### 운영 DB 확인 (`information_schema.columns`)

| 대상 | 결과 |
|------|------|
| `products.default_supplier_id` | **존재** ✅ |
| `products.procurement_type` (`text`) | **존재** ✅ |
| `products.fulfillment_type` | 없음 |
| `products.stock_qty` | 없음 |

### 003-B (상품↔매입처 매핑)

- `default_supplier_id` 존재 → **migration 불필요**.
- 구현 방향(잔여): `/purchases/new`에서 **상품 선택 → `default_supplier_id`로 `customers` 조회 → `counterparty_name`(또는 `supplier_tenant_id`) 자동 채움**(텍스트 직접 입력 금지, PRODUCT 6-7).

### 003-C (자동 매입 생성 / 재고)

- **SSOT**: `products.procurement_type` (`stock` / `consignment`).  
  앱은 `order.ts`에서 `defaultFulfillment(p.procurement_type)`로 `order_lines.fulfillment_type` 매핑. `products.fulfillment_type`은 **미존재**·**불사용**.
- **재고 컬럼 부재**: `stock_qty` 없음 → 재고 차감·임계치 기반 **자동 매입 생성 불가**.
- **결정**: Phase 5 범위에서는 **수동 매입 등록만 지원**(`/purchases/new`). **자동 매입·재고 모델은 Phase 7 이후 별도 설계**(컬럼 정의, 트랜잭션·트리거, 단순 시작·확장 원칙 동반).

### 003-D (매입 원장 = 매입 + 지급 집계)

- 데이터 소스: `purchases`(매입) + `payment_allocations`(지급 분배). 부모 `payments.status IN ('pending','confirmed')`만 유효 분배로 합산(SUP-TODO-002-D RPC와 동일 룰).
- 미지급금 = `total_amount − Σ allocated_amount` (계산값, DB 저장 금지).
- **`purchases.status`** 는 002-D `reverse_disbursement` RPC에서 `paid`/`partial`/`unpaid`로 자동 반영.
- 잔여 작업: `getPurchaseList`(또는 별도 액션)에 지급 합계·잔액 컬럼 추가, **매입원장 진입은 `/ledger`(SUP-TODO-004)** 와 정합.

## migration 여부

없음.

## 테스트 결과

코드 변경 없음 — `tsc` 등 **미실행**.

## 남은 위험

- `default_supplier_id` 값이 `customers.is_supplier`와 정합하지 않으면 자동 채움 결과가 비어 있을 수 있음.
- 003-C는 보류 결정으로 “자동 매입” 기대값이 PRODUCT 6-7과 일시적으로 갭 → 후속 ID 필요.
- 매입 원장의 미지급금 계산은 002-D 룰과 동일해야 하며, 추후 SUP-TODO-005(SSOT 정합)와 정렬해야 함.

## 다음 권장 작업

- 003-B 구현 ID 분리(상품 선택 → 매입처 자동 채움 UI/액션).
- 003-D 집계 컬럼 추가 + `/ledger` 매입원장 진입(SUP-TODO-004와 함께).
- Phase 7+ 재고/자동 매입 설계 ID 신설.
