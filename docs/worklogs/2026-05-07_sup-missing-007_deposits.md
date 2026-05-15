# 2026-05-07 — SUP-MISSING-007 예치금 시스템 구현

## 목표

- PRODUCT §6-8 수금관리의 예치금(부채) 시스템 구현
- 초과 수금 발생 시 예치금으로 자동 적립
- 수금 등록 화면에서 예치금 잔액 표시 + 예치금 사용 옵션 제공

## DB 상태

- `customer_deposits` 테이블 생성 ✅
- `deposit_logs` 테이블 생성 ✅
- migration 저장: `supabase/migrations/20260507150000_create_customer_deposits.sql`

## 구현 내용

### 1) Actions — 예치금 조회/이력/사용

- 파일: `src/actions/customer-deposits.ts`
- `getCustomerDeposit(customer_id)`: 예치금 잔액 조회(없으면 0)
- `getDepositLogs(customer_id)`: 예치금 이력 조회(최신 100건)
- `useDeposit(customer_id, amount, payment_id?)`
  - `customer_deposits.balance` 차감
  - `deposit_logs`에 `type='debit'` 기록
  - 로그 실패 시 balance 롤백(“이력 필수” 강제)

### 2) 수금 등록(createPayment) — 초과분 자동 예치

- 파일: `src/actions/payment.ts`
- `create_payment_atomic` RPC 응답의 `deposit_amount`를 SSOT로 사용
- `deposit_amount > 0`이면:
  - `customer_deposits` balance 증가(스냅샷)
  - `deposit_logs`에 `type='credit'` 기록(`payment_id` 연결)
  - 실패 시 수금 자체는 성공 유지 + warning 반환(운영 점검 가능하도록)

### 3) 수금 등록 UI — 예치금 사용 옵션

- 파일: `src/components/payment/PaymentCreateForm.tsx`
- 거래처 선택 시 예치금 잔액 표시(기존)
- 예치금 잔액이 있을 경우:
  - “예치금 사용” 체크 + 사용 금액 입력
  - 제출 시 `useDeposit`로 내부 차감 후 수금 등록(합산 금액으로 미수 반영)

## 테스트

- `npx tsc --noEmit`

## 메모

- 예치금 credit/debit은 원칙적으로 RPC 트랜잭션이 이상적이나, 현재는 앱 레벨에서 롤백 가능한 범위로 안전장치를 적용했다.

