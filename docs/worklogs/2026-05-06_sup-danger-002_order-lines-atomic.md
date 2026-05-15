# Phase 3 — SUP-DANGER-002 update_order_lines 원자화(라인+헤더)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

주문 수정(`updateOrder`)에서 라인 RPC(`update_order_lines`) 이후 `orders` 헤더를 별도로 update하던 경로를 제거해, 라인+헤더 갱신이 **단일 RPC/단일 트랜잭션**으로 원자화될 수 있도록 코드와 migration 초안을 정렬한다. (DB 적용은 별도 승인)

## 관련 tasks.md ID

- SUP-DANGER-002

## 수정 파일 목록

- `supabase/migrations/20260506140000_update_order_lines_atomic.sql` (신규, 미적용)
- `realmyos/src/actions/order.ts`
- `docs/tasks.md`
- `docs/worklogs/2026-05-06_sup-danger-002_order-lines-atomic.md`

## 변경 전/후 비교 (요약)

### 변경 전

- `updateOrder`는 `update_order_lines` RPC로 `order_lines`를 삭제+재삽입한 뒤,
- 앱 레이어에서 합계를 `reduce`로 계산해 `orders` 헤더(`total_supply_price`, `total_vat_amount`, `total_amount`, 필요 시 `order_date`, `memo`)를 별도 `.update(updatePayload)`로 갱신했다.
- RPC와 헤더 update가 분리되어 중간 실패 시 라인/헤더 불일치 가능성이 있었다.

### 변경 후

- `updateOrder`는 RPC 호출 시 `p_order_date`, `p_memo`를 함께 전달한다. (`NULL`이면 DB에서 기존 값 유지)
- `updateOrder`에서 합계 `reduce` 및 `orders` 헤더 별도 update를 제거했다.
- 헤더 합계 갱신은 `update_order_lines` RPC 내부에서 `order_lines` 재삽입 직후 `SUM(...)`으로 계산 후 `orders`를 단일 update하도록 migration 초안에 정의했다.

## RPC 원자화 근거

- 라인 delete+insert와 헤더 합계 갱신이 동일 RPC에서 수행되면, 단일 호출로 라인/헤더 정합을 유지할 수 있다.

## migration 파일

- `supabase/migrations/20260506140000_update_order_lines_atomic.sql`
- **적용 여부**: 미적용 (dev/validation/production 적용은 별도 승인 및 governance 순서 필요)

## migration 여부

- 파일 추가(미적용)

## 테스트 결과

- 에디터 진단: 수정한 파일에서 linter 오류 없음

## 남은 위험

- DB에 migration이 적용되기 전에는 새 파라미터를 받는 `update_order_lines` 시그니처가 운영/개발 DB에 존재하지 않을 수 있어, 런타임에서 RPC 호출이 실패할 수 있다. (본 작업은 “적용 대기” 상태)

## 다음 권장 작업

- governance에 따라 dev → validation → production 순서로 migration 적용 후, 주문 수정 플로우 smoke test를 수행한다.

