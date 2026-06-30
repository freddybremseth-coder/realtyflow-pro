-- DemoSites website import history
-- Stores analyzed public website profiles for manual review/reuse in DemoSites CRM.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.demo_site_imports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  website_url TEXT NOT NULL,
  company_name TEXT,
  detected_industry TEXT,
  recommended_template_slug TEXT,
  confidence_score NUMERIC,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  editable_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_order_id UUID REFERENCES public.demo_site_orders(id) ON DELETE SET NULL,
  applied_order_id UUID REFERENCES public.demo_site_orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'analyzed' CHECK (status IN ('analyzed', 'created_demo', 'applied_to_demo', 'discarded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_site_imports_website_url
  ON public.demo_site_imports(website_url);

CREATE INDEX IF NOT EXISTS idx_demo_site_imports_company_name
  ON public.demo_site_imports(company_name);

CREATE INDEX IF NOT EXISTS idx_demo_site_imports_created_at
  ON public.demo_site_imports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_demo_site_imports_template_slug
  ON public.demo_site_imports(recommended_template_slug);

DROP TRIGGER IF EXISTS update_demo_site_imports_updated_at ON public.demo_site_imports;
CREATE TRIGGER update_demo_site_imports_updated_at
BEFORE UPDATE ON public.demo_site_imports
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.demo_site_imports ENABLE ROW LEVEL SECURITY;
