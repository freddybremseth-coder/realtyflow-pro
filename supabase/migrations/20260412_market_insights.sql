-- Market insights table for manual intelligence input (paste from Perplexity/Gemini)
CREATE TABLE IF NOT EXISTS market_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  summary TEXT,
  details TEXT NOT NULL,
  sources TEXT[] DEFAULT '{}',
  source_type TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE market_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON market_insights FOR ALL
  USING (true) WITH CHECK (true);
