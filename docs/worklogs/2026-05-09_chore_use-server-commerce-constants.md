| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

Next.js `'use server'` 모듈에서 **비동기가 아닌 `export const`(배열 상수)** 가 허용되지 않아 빌드/검증 오류가 나므로, 주문·결제 관련 상수를 lib로 분리한다.

## 관련 `tasks.md` ID

- `COMMERCE-003` (주문 처리 액션 `commerce.ts`)

## 수정 파일 목록

- `src/lib/commerce-constants.ts` (신규)
- `src/actions/admin/commerce.ts`
- `src/components/commerce/OrdersClient.tsx`
- `docs/tasks.md`, 본 worklog

## 변경 내용 요약

- `COMMERCE_ORDER_STATUSES`, `COMMERCE_PAYMENT_METHODS` 및 파생 타입을 `commerce-constants.ts`로 이동.
- `OrdersClient`는 `CommerceOrderStatus` 타입만 lib에서 import.

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` — pass
- `npm run build` — pass

## 남은 위험

다른 `'use server'` 파일에 동일 패턴(`export const` 값)이 남아 있으면 동일 오류가 재발할 수 있음. 필요 시 전수 grep으로 점검.

## 다음 권장 작업

CI에서 `next build` 또는 server action 규칙 린트로 회귀 방지.
