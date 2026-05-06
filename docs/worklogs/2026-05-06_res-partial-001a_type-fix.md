# RES-PARTIAL-001-A — 돈관리 타입/필드 정합성 수정

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`resturant_os` 돈관리에서 지급 레코드(outbound payments)의 **상태값과 표시 필드**가 PRODUCT/운영 DB 체계(`pending/confirmed`, `counterparty_name`)와 어긋나던 부분을 최소 범위로 정리해, 이후 돈관리 3화면 분리 작업(RES-PARTIAL-001-B~F)의 기반을 맞춘다.

## 관련 tasks.md ID

- RES-PARTIAL-001-A

## 수정 파일 목록

- `resturant_os/src/types/index.ts`
- `resturant_os/src/components/money/MoneyClient.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-06_res-partial-001a_type-fix.md`

## 변경 내용 요약

- `PaymentOutgoing.status` 유니온을 `planned/paid` → `pending/confirmed`로 변경했다.
- `MoneyClient.tsx`의 리스트 표시 거래처명을 `supplier_name` → `counterparty_name`로 변경했다.

## migration 여부

- 없음 (타입/표시 정합성만)

## 테스트 결과

- linter: `resturant_os/src/types/index.ts`, `resturant_os/src/components/money/MoneyClient.tsx` 진단 결과 오류 없음

## 남은 위험

- `resturant_os/src/actions/money.ts` 및 DB 데이터가 이미 `pending/confirmed`와 `counterparty_name`로 정합되어 있다는 전제 하에, 이번 수정은 UI/타입 레벨만 정리한다.
- 추가적인 호출부/타입 사용처에서 `planned/paid`가 남아있다면 후속 작업(RES-PARTIAL-001-B 이후) 중 컴파일/런타임 이슈로 드러날 수 있다.

## 다음 권장 작업

- `RES-PARTIAL-001-B`(필터 UI)로 진행하기 전에, `MoneyDashboard` 조회 결과의 타입이 `PaymentOutgoing`과 일치하는지(특히 status 문자열) 한 번 더 점검한다.

