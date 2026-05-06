# SUP-PARTIAL-004 payments.status 명명 통일 (pending/confirmed/reversed)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`payments.status`가 코드/DB/PRODUCT 정의 간에 `planned/paid/cancelled` 등으로 혼용되던 상태를 PRODUCT §9 정의인 `pending/confirmed/reversed`로 통일한다.

## 관련 tasks.md ID

- SUP-PARTIAL-004

## 수정 파일 목록

- `realmyos/supabase/migrations/20260506160000_payments_status_add_pending.sql`
- `resturant_os/src/actions/money.ts`
- `resturant_os/src/actions/today.ts`
- `realmyos/src/actions/payment.ts`
- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-06_sup-partial-004_payments-status-unify.md`

## 변경 내용 요약

- **변경 전(코드 혼용)**:
  - resturant_os outbound 지급예정: `planned`
  - resturant_os 지급 완료: `paid`
  - realmyos inbound 수금 취소: `cancelled`
- **변경 후(통일)**:
  - outbound 지급예정: `pending`
  - outbound 지급 완료: `confirmed`
  - inbound 수금 취소: `reversed`
- **운영 DB 제약**:
  - 기존 CHECK가 `confirmed/reversed`만 허용 → `pending` 추가 필요
  - Supabase 확인 결과: `pending/confirmed/reversed` 허용으로 적용 완료

## migration 여부

- production 적용 — `supabase/migrations/20260506160000_payments_status_add_pending.sql`

## 테스트 결과

- 미실행 — 코드 변경 및 constraint 변경은 반영했으나 로컬/CI/수동 플로우 테스트는 수행하지 않았다.

## 남은 위험

- `payments.status`를 문자열로 가정하는 다른 화면/쿼리가 남아있을 수 있어, 실제 화면(돈관리/오늘/수금목록/취소) 경로 점검이 필요하다.

## 다음 권장 작업

- 식당OS `/money`, `/today`에서 지급예정 목록이 `pending` 기준으로 정상 노출되는지 확인한다.
- 공급자OS `/payments`에서 수금 취소가 `reversed`로 전환되고 목록 필터가 정상 동작하는지 확인한다.

