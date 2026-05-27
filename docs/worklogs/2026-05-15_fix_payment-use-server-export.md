| 필드 | 값 |
|------|------|
| **상태** | 완료 |
| **완료일** | 2026-05-15 |

## 작업 목적

Next.js `"use server"` 파일(`src/actions/payment.ts`)에서 비-async export 제거. accounting/reversal semantics 무변경.

## 관련 `tasks.md` ID

- **[BUILD-FIX-PAYMENT-USE-SERVER-001]**

## 수정 파일 목록

- `src/lib/payments/constants.ts` (신규)
- `src/lib/payments/helpers.ts` (신규)
- `src/actions/payment.ts` (import만)

## 변경 내용 요약

- `PAYOUT_OUTBOUND_REVERSAL_BLOCKED_ERROR` → `constants.ts`
- `pickReversalPaymentType` → `helpers.ts` (동일 로직·`PAYMENTS_TYPE_PAYOUT_REVERSAL` 사용)

## migration 여부

없음.

## 테스트 결과

- `npm run build` — **성공** (exit 0). `"Only async functions are allowed to be exported in a use server file"` 미재현.

## 남은 위험

- `payment.ts`의 `export type`/`export interface`는 그대로 두었음. 향후 Next/빌드 정책 변경 시 별도 분리 필요할 수 있음.

## 다음 권장 작업

- 없음 (운영 배포는 기존 절차).
