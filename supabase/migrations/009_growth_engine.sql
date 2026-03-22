-- ============================================================================
-- 009_growth_engine.sql
-- Autonomous Growth Engine: actions, lead magnets, A/B tests, insights
-- ============================================================================

-- ========================================
-- 1. Growth Actions (AI-generated tasks)
-- ========================================
CREATE TABLE IF NOT EXISTS growth_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'social_post',
  platform TEXT DEFAULT '',
  content TEXT DEFAULT '',
  content_b TEXT, -- A/B variant B
  hypothesis TEXT DEFAULT '',
  expected_outcome TEXT DEFAULT '',
  priority INTEGER DEFAULT 5,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'ready', 'published', 'completed', 'failed')),

  -- Performance metrics (variant A)
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  engagement_rate REAL DEFAULT 0,
  shares INTEGER DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,

  -- A/B metrics (variant B)
  impressions_b INTEGER DEFAULT 0,
  clicks_b INTEGER DEFAULT 0,
  conversions_b INTEGER DEFAULT 0,
  engagement_rate_b REAL DEFAULT 0,
  shares_b INTEGER DEFAULT 0,
  leads_generated_b INTEGER DEFAULT 0,
  ab_winner TEXT, -- 'a' or 'b'

  learnings TEXT,
  executed_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_growth_actions_brand ON growth_actions(brand);
CREATE INDEX IF NOT EXISTS idx_growth_actions_status ON growth_actions(status);
CREATE INDEX IF NOT EXISTS idx_growth_actions_type ON growth_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_growth_actions_priority ON growth_actions(priority DESC);
CREATE INDEX IF NOT EXISTS idx_growth_actions_created ON growth_actions(created_at DESC);

-- ========================================
-- 2. Lead Magnets
-- ========================================
CREATE TABLE IF NOT EXISTS lead_magnets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT DEFAULT 'guide' CHECK (type IN ('ebook', 'checklist', 'webinar', 'template', 'calculator', 'guide', 'quiz')),
  landing_page_headline TEXT DEFAULT '',
  landing_page_subheadline TEXT DEFAULT '',
  cta_text TEXT DEFAULT '',
  email_sequence JSONB DEFAULT '[]',
  target_audience TEXT DEFAULT '',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  downloads INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_magnets_brand ON lead_magnets(brand);
CREATE INDEX IF NOT EXISTS idx_lead_magnets_status ON lead_magnets(status);

-- ========================================
-- 3. Growth Insights (AI learnings)
-- ========================================
CREATE TABLE IF NOT EXISTS growth_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand TEXT,
  insight_type TEXT DEFAULT 'general',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  data JSONB DEFAULT '{}',
  confidence REAL DEFAULT 0.5,
  applied BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_growth_insights_brand ON growth_insights(brand);

-- ========================================
-- 4. Growth Cycles (audit log)
-- ========================================
CREATE TABLE IF NOT EXISTS growth_cycles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brands_targeted TEXT[] DEFAULT '{}',
  actions_generated INTEGER DEFAULT 0,
  actions_published INTEGER DEFAULT 0,
  insights_found INTEGER DEFAULT 0,
  summary TEXT DEFAULT '',
  duration_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- 5. RLS Policies
-- ========================================
ALTER TABLE growth_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_magnets ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_cycles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on growth_actions') THEN
    CREATE POLICY "Allow all on growth_actions" ON growth_actions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on lead_magnets') THEN
    CREATE POLICY "Allow all on lead_magnets" ON lead_magnets FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on growth_insights') THEN
    CREATE POLICY "Allow all on growth_insights" ON growth_insights FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on growth_cycles') THEN
    CREATE POLICY "Allow all on growth_cycles" ON growth_cycles FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
