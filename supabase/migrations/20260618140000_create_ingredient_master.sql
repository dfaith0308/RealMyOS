-- 운영 DB 적용 완료
CREATE TABLE IF NOT EXISTS ingredient_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  barcode text,
  item_report_number text,
  brand text,
  spec text,
  category text,
  manufacturer text,
  ingredients_text text,
  confidence_level text DEFAULT 'unconfirmed'
    CHECK (confidence_level IN ('confirmed', 'estimated', 'unconfirmed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingredient_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('supplier', 'restaurant', 'admin')),
  source_id uuid NOT NULL,
  master_id uuid REFERENCES ingredient_master(id),
  match_confidence integer DEFAULT 0 CHECK (match_confidence BETWEEN 0 AND 100),
  matched_by text CHECK (matched_by IN ('barcode', 'item_report_number', 'name_spec', 'ai', 'manual')),
  price integer,
  tenant_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredient_mappings_source_unique
  ON ingredient_mappings(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_ingredient_master_barcode
  ON ingredient_master(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ingredient_master_item_report
  ON ingredient_master(item_report_number) WHERE item_report_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ingredient_mappings_master
  ON ingredient_mappings(master_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_mappings_source
  ON ingredient_mappings(source_type, source_id);
