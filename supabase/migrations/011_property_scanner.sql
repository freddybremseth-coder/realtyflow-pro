-- ============================================================================
-- 011_property_scanner.sql
-- Property scanner: scanned listings, scan runs, status tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS scanned_properties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Property data
  title TEXT NOT NULL,
  price TEXT,
  price_numeric REAL,
  location TEXT,
  municipality TEXT,
  province TEXT DEFAULT 'Alicante',
  size_m2 REAL,
  plot_m2 REAL,
  bedrooms INTEGER,
  bathrooms INTEGER,
  type TEXT, -- villa, apartment, townhouse, finca, plot, new_build, other
  description TEXT,
  -- Source
  source TEXT, -- Idealista, Kyero, ThinkSpain, etc.
  source_url TEXT,
  image_urls TEXT[] DEFAULT '{}',
  -- Details
  features TEXT[] DEFAULT '{}',
  is_new_build BOOLEAN DEFAULT false,
  developer TEXT,
  completion_date TEXT,
  energy_rating TEXT,
  ref_number TEXT,
  -- User workflow
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'interested', 'investigating', 'imported', 'rejected', 'archived')),
  user_notes TEXT,
  -- Timestamps
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS property_scan_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_type TEXT DEFAULT 'weekly', -- weekly, manual, cron
  properties_found INTEGER DEFAULT 0,
  sources_scanned TEXT[] DEFAULT '{}',
  by_source JSONB DEFAULT '{}',
  errors TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scanned_properties_status ON scanned_properties(status);
CREATE INDEX IF NOT EXISTS idx_scanned_properties_type ON scanned_properties(type);
CREATE INDEX IF NOT EXISTS idx_scanned_properties_municipality ON scanned_properties(municipality);
CREATE INDEX IF NOT EXISTS idx_scanned_properties_new_build ON scanned_properties(is_new_build);
CREATE INDEX IF NOT EXISTS idx_scanned_properties_price ON scanned_properties(price_numeric);
CREATE INDEX IF NOT EXISTS idx_scanned_properties_scraped ON scanned_properties(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_scan_runs_created ON property_scan_runs(created_at DESC);

-- RLS
ALTER TABLE scanned_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_scan_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on scanned_properties" ON scanned_properties FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on property_scan_runs" ON property_scan_runs FOR ALL USING (true) WITH CHECK (true);
