# SUP-TODO-002-D — 지급 취소(reversed) + `purchases.status` 재계산

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |

## 작업 목적

PRODUCT §6-9 「지급 취소 흐름」을 따라 outbound 지급을 **`status = 'reversed'`** 로 전이하고, 같은 트랜잭션에서 연결된 `purchases.status`를 자동 재계산한다(RULE-10 보존, RULE-11/19/20 준수).

## 관련 `tasks.md` ID

- `SUP-TODO-002-D` (상위 `SUP-TODO-002`)

## 수정 파일 목록

- `supabase/migrations/20260507060000_create_reverse_disbursement.sql`
- `src/actions/payment.ts` — `cancelDisbursement`
- `src/components/disbursements/DisbursementsClient.tsx` — `pending` 행에 “취소” 버튼·확인 모달
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-todo-002d_disbursement-cancel.md`

## 변경 내용 요약

- **`reverse_disbursement` RPC** (SECURITY DEFINER):
  - 테넌트 검증 → 대상 검증(`direction='outbound'` AND `(payer_tenant_id|tenant_id)=p_tenant_id` AND `status<>'reversed'`)
  - `payments.status='reversed'`, `updated_at=now()`
  - 영향 받은 `purchase_id` 집합에 대해 **유효 분배 합계**(부모 `payments.status IN ('pending','confirmed')`)로 `purchases.status` `paid`/`partial`/`unpaid` 갱신
  - `payment_allocations` 자체는 보존(이력 = 부모 상태로 흐름)
- **앱**: `cancelDisbursement(payment_id)`가 RPC 호출 + `/disbursements`/`/purchases` revalidate
- **UI**: 목록에서 `pending`만 “취소” 노출, 확인 모달·trans loading·에러 표시; `reversed`는 줄긋기/투명도

## migration 여부

- **파일**: `20260507060000_create_reverse_disbursement.sql`
- **운영 적용 (2026-05-07, 사용자 확인)**: 적용 완료 — 함수명 `public.reverse_disbursement(uuid, uuid)`.

## 테스트 결과

- `npx tsc --noEmit` — 통과 (realmyos).
- 수동 검증은 사용자 환경에서 진행(에이전트 DB 직접 검증 없음).

## 남은 위험

- **`payments.direction` enum 캐스트**: 현재 SQL은 `= 'outbound'` 텍스트 비교 — 운영에서 자동 캐스트 작동 확인. 비정상 시 `::public.payment_direction` 캐스트로 패치.
- **확정 지급(status='confirmed') 취소 정책**: 현재 RPC는 `confirmed`도 `reversed`로 전이 허용(이력 보존). 더 엄격한 정책이 필요하면 `pending`만 허용하도록 추가 검증 필요.
- **수동 분배 변경 흐름 부재**: 분배 자체 수정/추가는 본 ID 범위 외(취소→재등록 흐름 권장).

## 다음 권장 작업

- `/disbursements/[id]` 상세(분배 표시 포함).
- 003-D 매입 원장(매입+지급) 집계로 미지급금 계산식 통일.
