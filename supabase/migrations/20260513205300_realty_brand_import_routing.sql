-- Brand-specific RealtyFlow imports and property visibility routing.

CREATE TABLE IF NOT EXISTS import_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'xml_url'
    CHECK (type IN ('xml_url', 'xml_upload', 'csv', 'api')),
  url TEXT,
  mapping_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_sources_brand_active
  ON import_sources (brand_id, active);

ALTER TABLE import_sources ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'import_sources'
      AND policyname = 'Allow all on import_sources'
  ) THEN
    CREATE POLICY "Allow all on import_sources"
      ON import_sources FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS brand_id TEXT,
  ADD COLUMN IF NOT EXISTS region_bucket TEXT,
  ADD COLUMN IF NOT EXISTS is_inland BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS brand_visibility JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS import_source_id UUID REFERENCES import_sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_properties_brand_id
  ON properties (brand_id);

CREATE INDEX IF NOT EXISTS idx_properties_region_bucket
  ON properties (region_bucket);

CREATE INDEX IF NOT EXISTS idx_properties_is_inland
  ON properties (is_inland);

CREATE TABLE IF NOT EXISTS property_brand_visibility (
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  reason TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (property_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_property_brand_visibility_brand
  ON property_brand_visibility (brand_id, visible);

CREATE INDEX IF NOT EXISTS idx_property_brand_visibility_property
  ON property_brand_visibility (property_id);

ALTER TABLE property_brand_visibility ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'property_brand_visibility'
      AND policyname = 'Allow all on property_brand_visibility'
  ) THEN
    CREATE POLICY "Allow all on property_brand_visibility"
      ON property_brand_visibility FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
