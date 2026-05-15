# BANK-TRANSFER-001 — storefront 무통장 입금 운영 설정

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

`admin_settings`에 무통장 계좌·안내를 저장하고 관리자OS에서 편집하며, 식당OS 체크아웃 무통장 주문 완료 화면에 노출한다. PG·payments·ledger는 다루지 않는다.

## 2. 관련 `tasks.md` ID

- `BANK-TRANSFER-001`

## 3. 수정 파일 목록

**realmyos**

- `src/lib/storefront-bank-transfer.ts`
- `src/actions/admin/storefront-bank-transfer.ts`
- `src/components/commerce/StorefrontBankTransferClient.tsx`
- `src/app/(admin)/admin/commerce/storefront-bank/page.tsx`
- `src/components/layout/AdminSidebar.tsx`
- `src/app/(admin)/admin/commerce/orders/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-14_feat_bank-transfer-001-storefront-bank-settings.md`

**resturant_os**

- `src/lib/storefront-bank-transfer.ts`
- `src/actions/storefront-bank-transfer.ts`
- `src/app/(app)/buy/checkout/page.tsx`
- `src/components/buy/BuyCheckoutClient.tsx`

## 4. 변경 내용 요약

- 키 `storefront_bank_transfer`, 값 JSON 문자열 (`bank_name`, `account_number`, `account_holder`, `notice`).
- RLS: 기존 `admin_settings_read` SELECT 전원 허용으로 식당 세션 읽기 가능; 쓰기는 `is_admin()`.
- 관리자 폼: 검증·toast·`admin_logs` `storefront_bank_transfer_updated`.

## 5. migration 여부

없음.

## 6. 테스트 결과

- `npx tsc --noEmit` — `realmyos`, `resturant_os` 각각 exit 0.

## 7. 남은 위험

- `admin_settings` SELECT가 인증 없이도 가능한 정책이므로, 키에 저장하는 값은 **입금 계좌 등 공개 가능한 정보만** 둘 것(운영 정책).

## 8. 다음 권장 작업

- `docs/TEST-DEV/TEST-RUN-001.md` 또는 `TEST.md`에 무통장 계좌 표시 수동 확인 한 줄 추가 검토.
