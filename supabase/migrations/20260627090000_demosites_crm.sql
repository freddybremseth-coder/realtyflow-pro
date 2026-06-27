-- ============================================================================
-- DemoSites CRM
-- Productized website sales pipeline for ChatGenius.pro
-- ============================================================================

CREATE TABLE IF NOT EXISTS demo_site_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'service',
  description TEXT DEFAULT '',
  repo_url TEXT DEFAULT 'https://github.com/freddybremseth-coder/demosites',
  repo_path TEXT,
  preview_url TEXT,
  editable_fields TEXT[] DEFAULT ARRAY[
    'logo', 'brand_color', 'address', 'contact_info', 'prices', 'services',
    'products', 'hero_text', 'about_text', 'section_texts', 'opening_hours', 'images'
  ],
  placeholder_map JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS demo_site_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'ordered' CHECK (status IN (
    'lead', 'ordered', 'in_setup', 'preview_ready', 'approved', 'deployed', 'paused', 'cancelled'
  )),
  billing_status TEXT DEFAULT 'not_invoiced' CHECK (billing_status IN (
    'not_invoiced', 'pending', 'paid', 'overdue', 'cancelled'
  )),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  company_name TEXT NOT NULL,
  company_org_number TEXT,
  industry TEXT,
  website_url TEXT,
  source_url TEXT,
  package_id TEXT NOT NULL CHECK (package_id IN ('basis', 'standard', 'premium')),
  setup_fee_nok NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_fee_nok NUMERIC(12,2) NOT NULL DEFAULT 0,
  setup_cost_nok NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_cost_nok NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NOK',
  subscription_started_at TIMESTAMPTZ,
  subscription_renews_at TIMESTAMPTZ,
  template_slug TEXT REFERENCES demo_site_templates(slug),
  target_subdomain TEXT,
  preview_url TEXT,
  production_url TEXT,
  deployment_target TEXT DEFAULT 'subdomain.chatgenius.pro',
  app_id UUID REFERENCES saas_apps(id) ON DELETE SET NULL,
  logo_url TEXT,
  brand_color TEXT,
  extracted_profile JSONB DEFAULT '{}'::jsonb,
  editable_fields JSONB DEFAULT '{}'::jsonb,
  requested_changes JSONB DEFAULT '{}'::jsonb,
  provisioning_log JSONB DEFAULT '[]'::jsonb,
  sales_rep TEXT,
  notes TEXT,
  approved_at TIMESTAMPTZ,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS demo_site_order_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES demo_site_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_site_orders_status ON demo_site_orders(status);
CREATE INDEX IF NOT EXISTS idx_demo_site_orders_billing_status ON demo_site_orders(billing_status);
CREATE INDEX IF NOT EXISTS idx_demo_site_orders_package ON demo_site_orders(package_id);
CREATE INDEX IF NOT EXISTS idx_demo_site_orders_created_at ON demo_site_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_site_events_order ON demo_site_order_events(order_id, created_at DESC);

ALTER TABLE demo_site_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_site_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_site_order_events ENABLE ROW LEVEL SECURITY;

INSERT INTO demo_site_templates (slug, name, category, description, repo_url, preview_url)
VALUES
  ('local-service', 'Lokal servicebedrift', 'service', 'Rask mal for håndverkere, flyttebyrå, verksted, renhold og lokale tjenestebedrifter.', 'https://github.com/freddybremseth-coder/demosites', 'https://local-service.chatgenius.pro'),
  ('restaurant-cafe', 'Restaurant / kafé', 'hospitality', 'Mat, meny, åpningstider, bordbestilling og enkel leadfangst.', 'https://github.com/freddybremseth-coder/demosites', 'https://restaurant-cafe.chatgenius.pro'),
  ('real-estate-agent', 'Eiendomsmegler / rådgiver', 'real-estate', 'Profil, områder, tjenester, boligønskeskjema og ChatGenius lead-assistent.', 'https://github.com/freddybremseth-coder/demosites', 'https://real-estate-agent.chatgenius.pro')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  repo_url = EXCLUDED.repo_url,
  preview_url = EXCLUDED.preview_url,
  updated_at = NOW();

INSERT INTO saas_apps (
  slug, name, domain, description, category, tech_stack, status, color,
  pricing_model, price_monthly, currency, repo_url, live_url, dev_platform
)
VALUES (
  'demosites',
  'ChatGenius DemoSites',
  'demosites.chatgenius.pro',
  'Produktisert nettsidepakke med demo-maler, bestillingsskjema, CRM, preview-URL og abonnement/MRR-oppfølging.',
  'marketing',
  ARRAY['next.js', 'supabase', 'chatgenius', 'demosites'],
  'live',
  '#8b5cf6',
  'subscription',
  490,
  'NOK',
  'https://github.com/freddybremseth-coder/demosites',
  'https://chatgenius.pro/demosites',
  'codex'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  tech_stack = EXCLUDED.tech_stack,
  status = EXCLUDED.status,
  color = EXCLUDED.color,
  pricing_model = EXCLUDED.pricing_model,
  price_monthly = EXCLUDED.price_monthly,
  currency = EXCLUDED.currency,
  repo_url = EXCLUDED.repo_url,
  live_url = EXCLUDED.live_url,
  dev_platform = EXCLUDED.dev_platform,
  updated_at = NOW();
