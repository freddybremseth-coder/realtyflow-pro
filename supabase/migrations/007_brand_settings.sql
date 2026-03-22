-- ============================================================================
-- 007_brand_settings.sql
-- Brand settings persistence (YouTube, social media, email, API keys)
-- ============================================================================

CREATE TABLE IF NOT EXISTS brand_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id TEXT NOT NULL UNIQUE,
  settings JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_settings_brand ON brand_settings(brand_id);

ALTER TABLE brand_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on brand_settings') THEN
    CREATE POLICY "Allow all on brand_settings" ON brand_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
