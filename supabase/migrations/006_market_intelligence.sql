-- ============================================================================
-- 006_market_intelligence.sql
-- Market Intelligence: reports, data snapshots, recipient lists
-- ============================================================================

-- Market data snapshots (nightly fetched external data)
CREATE TABLE IF NOT EXISTS market_data_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Exchange rates
  eur_nok REAL,
  eur_nok_7d_change REAL,
  eur_sek REAL,
  eur_gbp REAL,
  -- ECB rate
  ecb_rate REAL,
  ecb_rate_previous REAL,
  -- Idealista news (JSON array)
  idealista_news JSONB DEFAULT '[]',
  -- Internal metrics snapshot
  internal_metrics JSONB DEFAULT '{}',
  -- Raw data for debugging
  raw_data JSONB DEFAULT '{}',
  -- Metadata
  sources TEXT[] DEFAULT '{}',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated market reports
CREATE TABLE IF NOT EXISTS market_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id TEXT NOT NULL, -- tall-og-trender, det-store-bildet, brand-spotlight, intern-ukesoppsummering, dona-anna-sesong
  title TEXT NOT NULL,
  subtitle TEXT,
  summary TEXT, -- 2-3 sentence summary
  content_html TEXT, -- Full HTML content
  content_text TEXT, -- Plain text version
  -- Structured data
  key_metrics JSONB DEFAULT '[]', -- [{label, value, change}]
  sections JSONB DEFAULT '[]', -- [{heading, content}]
  data_sources TEXT[] DEFAULT '{}',
  -- Template-specific
  theme TEXT, -- For "det-store-bildet" template
  brand TEXT, -- For "brand-spotlight" template
  -- Distribution
  recipients TEXT DEFAULT 'internal', -- all, investors, leads, internal, donaanna
  sent_at TIMESTAMPTZ,
  sent_to TEXT[], -- email addresses sent to
  -- Market data snapshot reference
  snapshot_id UUID REFERENCES market_data_snapshots(id),
  -- Timestamps
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recipient lists for reports
CREATE TABLE IF NOT EXISTS report_recipients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  group_name TEXT NOT NULL DEFAULT 'internal', -- internal, investors, leads, all, donaanna
  brand TEXT, -- optional brand filter
  language TEXT DEFAULT 'no', -- no, en, es
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Official market statistics (quarterly from ECVI, Registradores etc.)
CREATE TABLE IF NOT EXISTS official_market_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL, -- ecvi, registradores, notariado, ecb, idealista
  geo_level TEXT NOT NULL, -- country, province, municipality
  geo_code TEXT, -- province code or municipality code
  geo_name TEXT NOT NULL, -- "Alicante", "Murcia", "Spain"
  metric TEXT NOT NULL, -- avg_price_m2, transactions, rental_index, median_price
  value REAL NOT NULL,
  previous_value REAL,
  change_pct REAL,
  period TEXT NOT NULL, -- "2026-Q1", "2026-03", "2026"
  period_type TEXT DEFAULT 'quarterly', -- daily, monthly, quarterly, yearly
  raw_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_market_snapshots_date ON market_data_snapshots(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_reports_template ON market_reports(template_id);
CREATE INDEX IF NOT EXISTS idx_market_reports_date ON market_reports(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_recipients_group ON report_recipients(group_name);
CREATE INDEX IF NOT EXISTS idx_official_stats_source ON official_market_stats(source, geo_code);
CREATE INDEX IF NOT EXISTS idx_official_stats_period ON official_market_stats(period DESC);

-- RLS
ALTER TABLE market_data_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_market_stats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on market_data_snapshots') THEN
    CREATE POLICY "Allow all on market_data_snapshots" ON market_data_snapshots FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on market_reports') THEN
    CREATE POLICY "Allow all on market_reports" ON market_reports FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on report_recipients') THEN
    CREATE POLICY "Allow all on report_recipients" ON report_recipients FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on official_market_stats') THEN
    CREATE POLICY "Allow all on official_market_stats" ON official_market_stats FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed: Add Freddy as default recipient
INSERT INTO report_recipients (name, email, group_name, language) VALUES
  ('Freddy Bremseth', 'freddy@soleada.no', 'internal', 'no')
ON CONFLICT DO NOTHING;
