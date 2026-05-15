# SUP-DANGER-004 수금 fallback 제거 (RPC 실패 시 에러 반환)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`create_payment_atomic` RPC 실패 시 “단일 insert fallback”으로 수금을 성공 처리하던 경로를 제거해, **예치금(deposit) 계산/분리 규칙이 깨진 상태로 성공 반환되는 위험(RULE-24/25)** 을 차단한다.

## 관련 tasks.md ID

- SUP-DANGER-004

## 수정 파일 목록

- `realmyos/src/actions/payment.ts`
- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-06_sup-danger-004_payment-fallback-remove.md`

## 변경 내용 요약

- `realmyos/src/actions/payment.ts`의 `createPayment`에서 RPC 실패 시 실행되던 **direct insert fallback 분기(기존 116~176행)** 를 전부 제거했다.
- 이제 `create_payment_atomic` RPC가 실패하면 **즉시 `success: false`로 에러를 반환**한다.
- 기존 fallback이 반환하던 `deposit_amount: 0`, `balance_before: 0`, `mode: 'fallback'` 성공 응답은 더 이상 존재하지 않는다.
- `CreatePaymentResult.mode` 타입을 `rpc`만 허용하도록 정리했다.
- `realmyos/src/components/order/OrderCreateForm.tsx`에서 `mode === 'fallback'` 메시지 분기 dead code를 제거해, 성공 메시지를 항상 “수금 완료” 형태로 단순화했다.

## migration 여부

- 없음

## 테스트 결과

- 미실행 — 수금 저장 로직의 제어 흐름 변경이지만, 본 작업에서는 로컬/CI 테스트를 실행하지 않았다.

## 남은 위험

- 운영 환경에서 RPC 장애(권한/스키마 변경/네트워크 등)가 발생하면 수금 등록이 실패로 귀결된다(의도된 차단). 장애 원인 진단을 위해 서버 로그/에러 메시지 품질을 추가 개선할 수 있다.

## 근거 (운영 DB RPC 실존)

Supabase에서 아래 쿼리로 `create_payment_atomic`의 `routine_definition`을 조회했고, RPC는 아래 핵심 규칙을 가진다.

- `balance_before := opening + total_orders - total_paid`
- `deposit_amount := GREATEST(0, p_amount - balance_before)`
- `payments.deposit_amount`에 위 `deposit_amount`를 저장
- `collection_schedule_id`가 있으면 `collection_schedules.status='done'` 처리

이 규칙과 달리, 기존 fallback은 `deposit_amount=0` 고정 insert 후 성공 반환했기 때문에 RULE 위반 위험이 있었다.

## 다음 권장 작업

- RPC 호출 실패 시 사용자 메시지/운영 로그에 남는 원인을 분류(권한, 함수 미존재, 기타 DB 오류)해 운영 대응성을 높인다.

