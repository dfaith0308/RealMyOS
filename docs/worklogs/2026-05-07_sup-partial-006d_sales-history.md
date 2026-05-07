# 2026-05-07 — SUP-PARTIAL-006-D 영업이력 성과 연결

## 목적

- PRODUCT §6-13 자동화영업의 “영업이력”을 전환(영업→주문) 관점으로 정합 맞춘다.
- `contact_logs.converted_order_id`로 “이 영업으로 발생한 주문”을 추적하고, 화면에서 즉시 확인/이동할 수 있게 한다.
- `outcome_type` 기반으로 `next_action_date`를 서버에서 자동 계산해 저장한다.

## 관련 tasks.md ID

- `SUP-PARTIAL-006-D`

## 구현 요약

### 1) 영업이력 컬럼 정합 + 필터

- 화면: `src/app/(app)/sales/history/SalesHistoryClient.tsx`
  - 컬럼: 날짜 / 거래처 / 행동유형 / 결과코드 / 다음행동일 / 담당자 / 주문발생여부
  - 주문발생여부:
    - `converted_order_id`가 있으면 “주문발생 ✅” 링크 → `/orders/[id]`
    - 없으면 `-`
  - 필터:
    - 결과코드(outcome_type)
    - 기간(from/to)
    - 거래처(검색)
    - 주문발생여부(전체/발생/미발생)

### 2) next_action_date 서버 자동 계산

- `src/actions/contact.ts` (`createContactLog`)
  - `outcome_type`가 있고 `next_action_date`가 없으면 자동 계산 후 `contact_logs.next_action_date` 저장
  - 주문주기(평균)는 해당 거래처의 최근 90일 confirmed 주문 날짜로 계산, 없으면 7일 기본
  - 매핑(요구사항):
    - interested: 주문주기×0.3
    - potential: 주문주기×0.5
    - maintained: 주문주기×0.8
    - churn_risk: 주문주기×0.2
    - rejected: 주문주기×2.0
    - no_answer: 2일 고정
    - order_placed: 주문주기×0.9

### 3) 주문 confirmed 시 영업이력 자동 연결

- `src/actions/order.ts` (`createOrder`)
  - 주문이 confirmed로 생성되면, 최근 7일 내 해당 거래처의 contact_log 중 `converted_order_id IS NULL`인 최신 1건을 찾아
    `converted_order_id = 주문 id`로 best-effort 업데이트

### 4) migration 파일 소급

- `supabase/migrations/20260507220000_add_contact_logs_converted_order.sql`

## 변경 파일

- `supabase/migrations/20260507220000_add_contact_logs_converted_order.sql`
- `src/actions/sales.ts`
- `src/actions/contact.ts`
- `src/actions/order.ts`
- `src/app/(app)/sales/history/SalesHistoryClient.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-partial-006d_sales-history.md`

## Migration

- 있음(소급, DB 실행 금지): `20260507220000_add_contact_logs_converted_order.sql`

## 테스트

- `npx tsc --noEmit` ✅

## 리스크 / 남은 일

- 주문 confirmed 시 “어떤 영업이 주문으로 전환됐는지”는 추정(best-effort) 규칙 기반(최근 7일 내 미전환 최신 1건).
  이후에는 실행센터/스케줄 실행에서 주문작성 버튼으로 진입한 경우 명시적 연결을 더 강화할 수 있다.

