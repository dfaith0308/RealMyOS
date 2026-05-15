-- ADM-MISSING-008: Action Queue 시스템
-- ADM-MISSING-001: 거래 흐름 관제
CREATE TABLE IF NOT EXISTS public.action_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  priority text NOT NULL
    CHECK (priority IN ('critical','high','today','normal')),
  category text NOT NULL
    CHECK (category IN
      ('trust','trade','settlement','policy','direct_trade')),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN
      ('pending','in_progress','completed','expired')),
  action_options jsonb,
  target_tenant_id uuid,
  expires_at timestamptz,
  escalated_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  description text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

