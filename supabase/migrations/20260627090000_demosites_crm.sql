-- ============================================================================
-- DemoSites CRM
-- Productized website sales pipeline for ChatGenius.pro inside RealtyFlow
--
-- RLS is enabled. The Next.js API route must use SUPABASE_SERVICE_ROLE_KEY
-- server-side; the frontend should not access these tables directly with anon.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

DROP TRIGGER IF EXISTS update_demo_site_templates_updated_at ON demo_site_templates;
CREATE TRIGGER update_demo_site_templates_updated_at
BEFORE UPDATE ON demo_site_templates
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

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
  deployment_target TEXT DEFAULT 'realtyflow.chatgenius.pro',
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

DROP TRIGGER IF EXISTS update_demo_site_orders_updated_at ON demo_site_orders;
CREATE TRIGGER update_demo_site_orders_updated_at
BEFORE UPDATE ON demo_site_orders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

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
CREATE INDEX IF NOT EXISTS idx_demo_site_orders_customer_email ON demo_site_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_demo_site_orders_company_name ON demo_site_orders(company_name);
CREATE INDEX IF NOT EXISTS idx_demo_site_events_order ON demo_site_order_events(order_id, created_at DESC);

ALTER TABLE demo_site_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_site_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_site_order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read demo_site_templates" ON demo_site_templates;
DROP POLICY IF EXISTS "Allow public insert demo_site_orders" ON demo_site_orders;
DROP POLICY IF EXISTS "Allow public read demo_site_orders" ON demo_site_orders;
DROP POLICY IF EXISTS "Allow public update demo_site_orders" ON demo_site_orders;
DROP POLICY IF EXISTS "Allow public read demo_site_order_events" ON demo_site_order_events;
DROP POLICY IF EXISTS "Allow public insert demo_site_order_events" ON demo_site_order_events;

INSERT INTO demo_site_templates (slug, name, category, description, repo_url, preview_url)
VALUES
  ('local-service', 'Lokal servicebedrift', 'service', 'Rask mal for håndverkere, flyttebyrå, verksted, renhold og lokale tjenestebedrifter.', 'https://github.com/freddybremseth-coder/demosites', 'https://realtyflow.chatgenius.pro/saas?template=local-service'),
  ('restaurant-cafe', 'Restaurant / kafé', 'hospitality', 'Mat, meny, åpningstider, bordbestilling og enkel leadfangst.', 'https://github.com/freddybremseth-coder/demosites', 'https://realtyflow.chatgenius.pro/saas?template=restaurant-cafe'),
  ('real-estate-agent', 'Eiendomsmegler / rådgiver', 'real-estate', 'Profil, områder, tjenester, boligønskeskjema og ChatGenius lead-assistent.', 'https://github.com/freddybremseth-coder/demosites', 'https://realtyflow.chatgenius.pro/saas?template=real-estate-agent')
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
  'realtyflow.chatgenius.pro',
  'Produktisert nettsidepakke med demo-maler, bestillingsskjema, CRM, preview og abonnement/MRR-oppfølging inne i RealtyFlow.',
  'marketing',
  ARRAY['next.js', 'supabase', 'chatgenius', 'demosites'],
  'live',
  '#8b5cf6',
  'subscription',
  490,
  'NOK',
  'https://github.com/freddybremseth-coder/demosites',
  'https://realtyflow.chatgenius.pro/saas',
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
