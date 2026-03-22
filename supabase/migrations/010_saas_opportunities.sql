-- ============================================================================
-- 010_saas_opportunities.sql
-- SaaS opportunity discovery, refinement pipeline, and build tracking
-- ============================================================================

-- SaaS opportunities discovered by AI agent
CREATE TABLE IF NOT EXISTS saas_opportunities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Discovery
  title TEXT NOT NULL,
  slug TEXT,
  description TEXT NOT NULL,
  category TEXT, -- ai, productivity, finance, health, education, ecommerce, developer-tools, etc.
  problem_statement TEXT, -- What problem does it solve?
  target_audience TEXT,
  market_size TEXT, -- estimated TAM
  competitor_count INTEGER DEFAULT 0,
  competitors TEXT[], -- list of competitor names
  competitor_weakness TEXT, -- Where existing solutions fail
  opportunity_score INTEGER DEFAULT 0, -- 1-100, AI-calculated
  -- Pricing & Revenue model
  suggested_pricing TEXT, -- e.g. "freemium, $19/mo pro, $49/mo business"
  estimated_mrr_potential TEXT, -- e.g. "$5k-15k within 6 months"
  monetization_strategy TEXT,
  -- Technical
  tech_stack_suggestion TEXT[], -- suggested tech stack
  build_complexity TEXT CHECK (build_complexity IN ('simple', 'medium', 'complex')),
  estimated_build_days INTEGER,
  mvp_features TEXT[], -- minimum viable features
  differentiators TEXT[], -- what makes this unique
  -- Trend data
  trend_keywords TEXT[],
  trend_sources TEXT[], -- where the trend was spotted
  trend_momentum TEXT CHECK (trend_momentum IN ('rising', 'stable', 'peaking', 'declining')),
  search_volume_trend TEXT,
  -- Pipeline status
  status TEXT DEFAULT 'discovered' CHECK (status IN (
    'discovered',    -- AI found it
    'investigating', -- User wants more research
    'refining',      -- AI is perfecting the concept
    'approved',      -- User approved for build
    'building',      -- Being built
    'deployed',      -- Deployed to Vercel
    'testing',       -- User is testing
    'live',          -- Live with real users
    'rejected',      -- User rejected
    'archived'       -- No longer relevant
  )),
  -- Refinement
  refinement_notes TEXT, -- AI's refined analysis
  user_feedback TEXT, -- User's notes/requests
  business_plan TEXT, -- Full business plan (markdown)
  -- Build tracking
  repo_url TEXT,
  vercel_project_id TEXT,
  vercel_url TEXT,
  saas_app_id UUID REFERENCES saas_apps(id), -- linked saas_app once created
  -- Timestamps
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  build_started_at TIMESTAMPTZ,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Discovery runs log
CREATE TABLE IF NOT EXISTS saas_discovery_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_type TEXT DEFAULT 'weekly', -- weekly, manual
  opportunities_found INTEGER DEFAULT 0,
  categories_scanned TEXT[],
  ai_model TEXT,
  raw_analysis TEXT, -- full AI response for reference
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saas_opportunities_status ON saas_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_saas_opportunities_score ON saas_opportunities(opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_saas_opportunities_created ON saas_opportunities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saas_discovery_runs_created ON saas_discovery_runs(created_at DESC);

-- RLS
ALTER TABLE saas_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_discovery_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on saas_opportunities" ON saas_opportunities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on saas_discovery_runs" ON saas_discovery_runs FOR ALL USING (true) WITH CHECK (true);
