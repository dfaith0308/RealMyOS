# 2026-05-07 — SUP-MISSING-002 거래처 등록 필드 추가

## 목표

- PRODUCT §6-3 거래처 등록 확정 필드 중 누락분을 DB/코드에 연결
  - `payment_terms` (결제조건 텍스트)
  - `role` (buyer/supplier/both)
  - `contact_status` (unknown/safe_number/connected/converted)

## 범위 / 원칙

- 기존 필드/데이터 불변
- 신규 필드는 모두 **선택 입력**
- `contact_status` 기본값은 `unknown`

## 변경 내용

- `createCustomer`에 `payment_terms`, `role`, `contact_status` 필드 추가 후 `customers` insert payload에 반영
- 거래처 등록 폼에 “거래 설정” 섹션 추가
  - 결제조건(select): 즉시결제 / 말일 / 매월N일 / N일후
  - 역할(select): 매출처(buyer) / 매입처(supplier) / 둘다(both)
  - 연락 상태(select): 미확인/안심번호/연락가능/전환완료 (기본 unknown)

## 변경 파일

- `src/actions/customer.ts`
- `src/components/customer/CustomerCreateForm.tsx`
- `supabase/migrations/20260507130000_add_customer_fields.sql`
- `docs/tasks.md`

## 테스트

- `npx tsc --noEmit`

