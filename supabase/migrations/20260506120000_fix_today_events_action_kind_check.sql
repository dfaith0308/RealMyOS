-- DB-DANGER-003: today_events.action_kind CHECK 확장
-- 기존: payment / rfq / sku
-- 추가: delivery / order_create
-- 근거: TodayDeliveryCard, rfq.ts acceptBid 호출부 직접 확인
ALTER TABLE today_events
  DROP CONSTRAINT IF EXISTS today_events_action_kind_check;
ALTER TABLE today_events
  ADD CONSTRAINT today_events_action_kind_check
  CHECK (action_kind IS NULL OR action_kind IN (
    'payment', 'rfq', 'sku', 'delivery', 'order_create'
  ));
