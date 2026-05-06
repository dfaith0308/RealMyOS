# RES-PARTIAL-001-C — 거래처 미지급금(집계 목록) 추가

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`resturant_os` 돈관리의 화면2 요구사항(거래처별 미지급금 집계 목록)을 충족하기 위해, 운영 DB에 적용된 RPC `get_supplier_balances`를 사용해 **거래처별 미지급금 합계 + 가장 오래된 미지급일**을 단일 호출로 조회하고 UI에 표시한다. (N+1 금지)

## 관련 tasks.md ID

- RES-PARTIAL-001-C

## 수정 파일 목록

- `realmyos/supabase/migrations/20260506170000_create_get_supplier_balances.sql` (파일 생성 — DB 실행은 본 작업에서 금지, 적용 여부는 사용자 확인)
- `resturant_os/src/actions/money.ts`
- `resturant_os/src/components/money/MoneyClient.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-06_res-partial-001c_supplier-balances.md`

## 변경 내용 요약

- 운영 DB RPC `get_supplier_balances(p_tenant_id)`를 호출하는 `getSupplierBalances(tenant_id)`를 `money.ts`에 추가했다.
  - 에러 시 빈 배열 반환(best-effort)로 돈관리 화면이 깨지지 않도록 처리.
- `getMoneyDashboard()`에서 기존 payments 목록 조회와 supplier balances RPC를 `Promise.all`로 병렬 호출해 응답에 함께 포함했다.
- `MoneyClient.tsx`에 “거래처 미지급금” 섹션을 추가해
  - 거래처명 / 총 미지급금(금액) / 가장 오래된 미지급일 을 리스트로 표시했다.

## migration 여부

- 파일 추가 — `20260506170000_create_get_supplier_balances.sql` (DB 적용은 별도. 사용자 메시지로 운영 DB 적용 확인됨)

## 테스트 결과

- linter: `resturant_os/src/actions/money.ts`, `resturant_os/src/components/money/MoneyClient.tsx` 진단 결과 오류 없음

## 남은 위험

- `getMoneyDashboard`는 여전히 payments 목록 조회에 `due_date` 문자열 비교를 사용한다. RPC가 `date`를 반환하므로, UI에서 표시되는 oldest_due_date의 포맷은 DB 반환 문자열에 의존한다.
- RPC가 `counterparty_name`이 NULL인 레코드를 반환할 수 있는지(스키마 제약)에 따라 UI key 충돌 가능성이 있어, 코드에서 null counterparty_name은 필터링했다.

## 다음 권장 작업

- `RES-PARTIAL-001-D`에서 거래처 클릭 → 상세 지급 내역(드릴다운)을 추가해 화면2를 완성한다.

