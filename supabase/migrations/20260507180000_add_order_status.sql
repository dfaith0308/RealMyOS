-- SUP-MISSING-010: 주문상태 이중 구조
-- PRODUCT §6-4 주문관리
-- order_status: 운영 흐름 (접수→납품완료)
-- status: 거래상태/원장 (draft/confirmed/cancelled)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_status text
    NOT NULL DEFAULT '접수'
    CHECK (order_status IN (
      '접수', '확인', '출고준비', '출고완료', '납품완료', '취소'
    ));

COMMENT ON COLUMN public.orders.order_status IS
  '주문상태(운영): 접수/확인/출고준비/출고완료/납품완료/취소';
COMMENT ON COLUMN public.orders.status IS
  '거래상태(원장): draft/confirmed/cancelled';

