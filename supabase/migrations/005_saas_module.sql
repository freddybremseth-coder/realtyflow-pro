-- ============================================================================
-- 005_saas_module.sql
-- SaaS management: apps, subscriptions, analytics for ChatGenius.pro
-- ============================================================================

-- SaaS applications (each subdomain is an app)
CREATE TABLE IF NOT EXISTS saas_apps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE, -- subdomain: "astro", "olivia", etc.
  name TEXT NOT NULL, -- display name: "Astro AI", "Olivia AI"
  domain TEXT NOT NULL, -- full domain: "astro.chatgenius.pro"
  description TEXT,
  category TEXT, -- ai-chat, real-estate, music, social, productivity
  tech_stack TEXT[], -- next.js, astro, react, etc.
  status TEXT DEFAULT 'development' CHECK (status IN ('development', 'beta', 'live', 'paused', 'archived')),
  -- Branding
  logo_url TEXT,
  color TEXT, -- hex color
  screenshot_url TEXT,
  -- Pricing
  pricing_model TEXT DEFAULT 'freemium' CHECK (pricing_model IN ('free', 'freemium', 'subscription', 'one-time', 'usage-based')),
  price_monthly REAL,
  price_yearly REAL,
  currency TEXT DEFAULT 'USD',
  -- Metrics (updated periodically)
  total_users INTEGER DEFAULT 0,
  active_users_30d INTEGER DEFAULT 0,
  total_revenue REAL DEFAULT 0,
  mrr REAL DEFAULT 0, -- Monthly Recurring Revenue
  arr REAL DEFAULT 0, -- Annual Recurring Revenue
  churn_rate REAL DEFAULT 0,
  -- Links
  repo_url TEXT,
  live_url TEXT,
  docs_url TEXT,
  -- Development
  dev_platform TEXT, -- gemini, claude-code, ai-studio, manual
  last_deploy_at TIMESTAMPTZ,
  version TEXT,
  -- Timestamps
  launched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SaaS subscriptions / customers
CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id UUID REFERENCES saas_apps(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  plan TEXT DEFAULT 'free', -- free, basic, pro, enterprise
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
  amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly', 'one-time')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  next_billing_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SaaS analytics events (daily rollups)
CREATE TABLE IF NOT EXISTS saas_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id UUID REFERENCES saas_apps(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  page_views INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  signups INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  revenue REAL DEFAULT 0,
  churn INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  avg_session_duration REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(app_id, date)
);

-- Indexes
CREATE INDEX idx_saas_apps_status ON saas_apps(status);
CREATE INDEX idx_saas_apps_slug ON saas_apps(slug);
CREATE INDEX idx_saas_subscriptions_app ON saas_subscriptions(app_id);
CREATE INDEX idx_saas_subscriptions_status ON saas_subscriptions(status);
CREATE INDEX idx_saas_analytics_app_date ON saas_analytics(app_id, date DESC);

-- RLS
ALTER TABLE saas_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on saas_apps" ON saas_apps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on saas_subscriptions" ON saas_subscriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on saas_analytics" ON saas_analytics FOR ALL USING (true) WITH CHECK (true);
