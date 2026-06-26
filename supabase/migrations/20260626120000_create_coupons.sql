-- 운영 DB 적용 완료
CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  plan text NOT NULL DEFAULT 'earlybird'
    CHECK (plan IN ('earlybird', 'pro', 'annual')),
  free_months integer NOT NULL DEFAULT 2,
  max_uses integer DEFAULT 1,
  used_count integer DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid
);

CREATE TABLE IF NOT EXISTS coupon_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid REFERENCES coupons(id),
  tenant_id uuid NOT NULL,
  used_at timestamptz DEFAULT now(),
  plan_expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupon_uses_tenant ON coupon_uses(tenant_id);
