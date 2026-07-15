-- message_logs: 외부 SMS 제공자(솔라피 등) 메시지 ID
ALTER TABLE public.message_logs
  ADD COLUMN IF NOT EXISTS external_id text;
