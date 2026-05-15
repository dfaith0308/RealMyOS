## 작업 개요
- 목표: PRODUCT §10-9 수익/정산 통제에 맞춰 **정산 상태를 한 화면에서 통합**하고, MVP 범위에서 **증빙(메모)**를 남길 수 있게 한다.
- 범위: **FORENSIC-003-B** 통합 뷰 + **FORENSIC-003-A** 증빙 메모(Storage 파일 첨부는 후속).

---

## FORENSIC-003-B: 정산 상태 통합 뷰
- 파일: `src/actions/admin/settlement-control.ts` — `getUnifiedSettlementView()`
  - `orders.status = 'confirmed'` 기준 주문 집계
  - 동일 `order_id`의 **수금**: `payments` 중 `status='confirmed'`, `direction='inbound'`, `type != 'settlement'` 합계
  - **정산**: `type='settlement'` 확정 합계
  - **미정산 잔액** = 주문금액 − 수금 − 정산 (0 미만은 0으로 클램프)
  - 거래처(공급 테넌트 + customer)별 그룹, 상태 라벨(정산완료/부분정산/미정산), 30일 초과 플래그
  - 조회 시 `admin_logs` (`settlement_unified_view`) best-effort
- 파일: `src/app/(admin)/settlements/page.tsx` — 거래처별 통합 테이블 섹션 추가

---

## FORENSIC-003-A: 정산 증빙 메모 (MVP)
- DB: `public.payments.settlement_memo` (text) — migration `supabase/migrations/20260508130000_add_payments_settlement_memo.sql`, **운영 DB 적용 완료 (2026-05-08)**
- 파일: `src/actions/admin/settlement-control.ts`
  - `processSettlement(order_id, settlement_memo?)` — insert 시 `settlement_memo` 저장(최대 500자 클램프), `admin_logs`에 포함
  - `getSettlementHistory` — 이력 표시 시 `settlement_memo` 우선, 없으면 `memo`
- 파일: `src/app/(admin)/settlements/SettleOrderButton.tsx` — 정산 확인 모달에 메모 입력

---

## 검증
- `npx tsc --noEmit` 통과
