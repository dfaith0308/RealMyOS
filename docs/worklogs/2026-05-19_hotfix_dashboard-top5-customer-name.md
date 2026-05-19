# hotfix — 대시보드 거래처 매출 TOP5 거래처명 미표시

## 작업 목적

거래처 매출 TOP5에서 금액은 보이나 거래처 이름이 비어 보이는 버그 수정.

## 관련 tasks.md ID

- `SUP-PARTIAL-001-F`

## 수정 파일 목록

- `src/actions/dashboard.ts`
- `src/app/(app)/dashboard/page.tsx`

## 변경 내용 요약

- `resolveDashboardCustomerName()`: `customers` 조인이 **배열**로 올 때 `customers[0].name` 처리 (주문 상세 페이지와 동일 패턴).
- `getCustomersWithScore()` 결과로 `customer_id → name` 맵 fallback.
- UI: `c.name` 빈 값일 때 `알 수 없음` 표시.
- 금액 집계(`resolveDashboardOrderAmount`) 코드는 변경 없음.

## migration 여부

없음.

## 테스트 결과

- `dashboard.ts` / `page.tsx` 린트 오류 없음.
- `main` 전체 `npm run build`: **실패** (기존 `payment.ts` use server export, `/automation/*` prerender).

## 남은 위험

- `ledger-calc.resolveCustomerName`은 여전히 배열 조인 미지원 — 다른 화면은 별도 정합 필요.

## 다음 권장 작업

- `resolveCustomerName`을 `ledger-calc.ts`에서 배열·CRM fallback까지 통합.
- `main` 빌드 복구(payment export, automation prerender).
