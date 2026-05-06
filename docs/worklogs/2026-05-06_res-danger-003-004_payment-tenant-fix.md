# Phase 2 — RES-DANGER-003/004 지급 완료 처리 단일화 + tenant 스코프

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

식당OS에서 “지급 완료 처리”가 두 구현으로 분리되어(`today.ts` vs `money.ts`) 테넌트 스코프가 누락되는 경로를 제거하고(RULE-01), 클라이언트 호출부에서 `tenant_id` 누락을 바로잡아 단일 액션으로 통일한다(RULE-22).

## 관련 tasks.md ID

- RES-DANGER-003
- RES-DANGER-004

## 수정 파일 목록

- `resturant_os/src/actions/today.ts`
- `resturant_os/src/components/money/MoneyClient.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-06_res-danger-003-004_payment-tenant-fix.md`

## 수정 전/후 요약 (핵심 차이)

### 수정 전

- `resturant_os/src/actions/money.ts`의 `markPaymentPaid(payment_id, tenant_id)`는 `payer_tenant_id` 조건을 포함했으나,
- `resturant_os/src/actions/today.ts`의 `markPaymentPaid(payment_id)`는 `id`만으로 업데이트하여 테넌트 스코프가 누락됨.
- `resturant_os/src/components/money/MoneyClient.tsx`에서 `restaurantId`를 보유하고도 `markPaymentPaid(id)`로 호출하여 `tenant_id` 인자가 누락됨.

### 수정 후

- `resturant_os/src/actions/today.ts`의 `markPaymentPaid(payment_id)`는 `getTenantId()`로 tenant를 해석한 뒤, **단일 구현**인 `resturant_os/src/actions/money.ts`의 `markPaymentPaid(payment_id, tenant_id)`를 호출하도록 변경.
- `resturant_os/src/components/money/MoneyClient.tsx`는 `markPaymentPaid(id, restaurantId)`로 호출하도록 수정.

## 단일화 근거

- `money.ts` 구현은 `payments.update`에 `payer_tenant_id` 조건을 포함해 테넌트 스코프를 애플리케이션 레이어에서 강제한다.
- `today.ts`는 자체 구현을 유지할 이유가 없고, 동일 동작을 중복 구현하면 스코프 누락과 같은 보안 결함이 재발할 수 있다.

## migration 여부

- 없음

## 테스트 결과

- 에디터 진단: 수정한 두 파일에서 linter 오류 없음

## 남은 위험

- `resturant_os` 작업 트리의 기존 변경(`.env.development`, `supabase/schema.sql`)은 본 작업 범위와 무관하며 별도 정리가 필요할 수 있음.

## 다음 권장 작업

- 동일한 패턴으로, “테넌트 인자 누락/중복 구현” 류의 위험 항목을 Phase 2에서 연속 처리한다.

