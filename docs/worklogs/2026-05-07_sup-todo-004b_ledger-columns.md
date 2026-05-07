# SUP-TODO-004-B(B-1) 거래처 원장 컬럼 정합 + 기간/결제수단 필터

| 필드 | 값 |
|------|-----|
| **상태** | 부분완료 (B-1만 완료) |
| **완료일** | 2026-05-07 |
| **차단 사유** | (해당 없음) |

## 작업 목적

- PRODUCT §6-10 정의(`날짜 / 유형 / 상품명 / 공급가 / 부가세 / 합계 / 결제수단 / 잔액`)와 `/customers/[id]/ledger`의 표시 컬럼을 정합한다.
- 기존에 `summary.opening_balance !== 0` 조건으로 가려지던 **기초잔액 행**을 항상 표시하여 “플랫폼 정의 전체 충족(기간·기초잔액)” 요건을 만족시킨다.
- 거래처 원장에서 **기간**과 **결제수단** 필터를 URL 파라미터 기반으로 도입해 후속 세금 로직(B-2)에 필요한 표면을 먼저 정렬한다.
- 같은 작업에서 발견된 **세금계산서/혼합 결제 분리·매입원장 별도 페이지**는 단일 PR 범위를 넘기 때문에 **SUP-TODO-004-B-2** 신규 ID로 분리한다.

## 관련 tasks.md ID

- `SUP-TODO-004-B` (B-1 범위 완료 처리)
- `SUP-TODO-004-B-2` (신규 — 세금계산서·세금 요약·매입원장 별도 페이지)

## 수정 파일 목록

- `realmyos/src/actions/ledger.ts` — `getCustomerLedger` 시그니처 확장(`from`/`to`/`payment_method`)
- `realmyos/src/app/(app)/customers/[id]/ledger/page.tsx` — 컬럼 정합·기초잔액 항상 표시·필터 폼 추가
- `realmyos/docs/tasks.md` — SUP-TODO-004-B 완료 처리, SUP-TODO-004-B-2 신규 등록
- `realmyos/docs/worklogs/2026-05-07_sup-todo-004b_ledger-columns.md` (본 파일)

## 변경 내용 요약

### `src/actions/ledger.ts`

- `CustomerLedgerOptions { from?, to?, payment_method? }` 인터페이스 신규 export.
- `getCustomerLedger(customer_id, options?)` — **두 번째 인자 추가**(옵셔널이라 기존 호출 호환).
- `orders` 쿼리: `options.from` → `gte('order_date', from)`, `options.to` → `lte('order_date', to)`.
- `payments` 쿼리: 동일하게 `payment_date`에 `gte/lte` + `options.payment_method` → `eq('payment_method', method)`.
- `Promise.all`로 두 쿼리 병렬화(체인 호출 단순화 부수 효과).
- 정책: 기간/결제수단 필터는 **현재 행만** 좁히는 “보기 필터”이며, `running_balance`는 PRODUCT §6-10 정의에 따라 **`opening_balance`에서 출발해 화면 행만 누적**한다(필터 밖 거래의 사전 누적 비포함). 카드 제외/혼합 결제 분리 등 **세금 의미가 있는 필터링은 B-2**.

### `src/app/(app)/customers/[id]/ledger/page.tsx`

- `searchParams: { from?, to?, payment_method? }` 추가.
- 기본값: KST 기준 **이번달 1일 ~ 오늘**(`new Date(Date.now() + 9 * 3600000)` 후 UTC 게터 사용 — 서버 타임존 의존성 제거).
- 필터 폼 추가(`<form method="get">`): `from`/`to` 날짜 입력 + `payment_method` 셀렉트(`전체/transfer/cash/card/platform`) + 검색·초기화 버튼.
- 요약 카드 라벨: `총 매출` → `총 매출 (기간)`, `총 수금` → `총 수금 (기간)` (필터 의미를 명시).
- 표 컬럼 정합: `날짜 / 유형 / 상품명 / 공급가 / 부가세 / 합계 / 결제수단 / 잔액` — 기존의 `주문금액` + `수금액` 별도 컬럼 → **`합계` 단일 컬럼**으로 통합. 수금 행은 음수(`−`) 표기, **결제수단은 별도 컬럼**으로 분리(기존엔 “수금 · 무통장”처럼 유형 배지에 결합되어 있었음).
- **기초잔액 행 항상 표시**: 종전 `summary.opening_balance !== 0` 조건 제거. 0원도 회계상 단서로 의미 있고 PRODUCT §6-10에 “기초잔액 표시 필수” 명시.
- 빈 결과 UI를 표 외부 div → 표 내부 `<tr><td colSpan={8}>`로 이동(기초잔액 행 + 빈 행 동시 표시).

### `docs/tasks.md`

- `SUP-TODO-004-B` 블록을 **완료 (B-1 범위)** 로 갱신, B-1 완료 항목·migration NO·호출부 점검 결과 명시.
- `SUP-TODO-004-B-2`(신규) 등록: 카드 제외/혼합 결제 분리 세금계산서 로직, 세금 요약 영역, 매입원장 별도 페이지(`/suppliers/[name]/ledger` 또는 동등 라우트).
- 작업 이력 라인 추가.

## migration 여부

- **없음** (조회·UI만 변경, 스키마/쿼리 시그니처는 클라이언트 측 옵셔널 인자만 추가).

## 테스트 결과

- `npx tsc --noEmit` — pass (0 error).
- 호출부 전수 점검: `getCustomerLedger`는 `src/app/(app)/customers/[id]/ledger/page.tsx` 한 곳만 사용 → 옵셔널 인자라 타입 호환 OK.
- 수동 검증: 미실행(런타임 검증은 후속 PR/리뷰에서 수행).

## 남은 위험

- **러닝 잔액 의미 합의 미고정**: 본 PR은 “기초잔액에서 기간 행만 누적” 방식으로 표시. 회계팀이 “기간 외 거래까지 누적 후 기간만 표시”를 요구하면 수정 필요. 현재 기준은 PRODUCT §6-10의 “기초잔액 표시 + 누적 잔액” 표현을 보수적으로 해석한 것.
- **결제수단 필터의 비대칭성**: `payment_method` 필터는 `payments`에만 적용되고 `orders`는 그대로 표시된다. UX상 “카드 결제만 보기” 의도를 정확히 전달하지 못할 수 있음 → B-2에서 “결제수단 필터 시 매출 행을 어떻게 표시할지” 정책 결정 필요.
- **세금 처리 미반영**: PRODUCT §6-10이 요구하는 카드 제외/혼합 결제 분리 세금계산서 로직은 본 범위 밖(B-2).
- **매입원장 상세 페이지 없음**: SUP-TODO-004-A의 `/ledger?kind=purchases&supplier=...`는 진입점만 제공. 매입+지급 분배 상세 표는 B-2.

## 다음 권장 작업

- **SUP-TODO-004-B-2** 착수 시:
  1. 세금계산서 로직: `payment_method` 별 합계, 카드 제외 후 발행 대상 합계, 혼합 결제 행 분할(또는 별도 표) 정의.
  2. 세금 요약 영역: 표 상단/하단에 공급가/부가세/합계 + 카드 제외 후 합계 별도 노출.
  3. `/suppliers/[name]/ledger`(또는 동등 라우트) 신설: `purchases` + `payment_allocations` 집계 표(SUP-TODO-003-D `getPurchaseList` 잔액 컬럼 확장과 정합).
- **SUP-TODO-004-C**(`/analytics`) 착수 — 동일 기간 필터 컴포넌트 재사용 가능.
