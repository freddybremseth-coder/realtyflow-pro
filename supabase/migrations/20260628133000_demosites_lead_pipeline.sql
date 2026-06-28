-- DemoSites lead pipeline
-- Stores crawler/prospecting leads, website audit results, demo links and approved outreach status.

CREATE TABLE IF NOT EXISTS demo_site_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  website_url TEXT,
  domain TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  country TEXT DEFAULT 'ES',
  city TEXT,
  industry TEXT,
  source TEXT DEFAULT 'manual',
  source_query TEXT,
  lead_status TEXT NOT NULL DEFAULT 'new',
  demo_order_id UUID REFERENCES demo_site_orders(id) ON DELETE SET NULL,
  demo_preview_url TEXT,
  demo_claim_url TEXT,
  demo_expires_at TIMESTAMPTZ,
  outreach_status TEXT NOT NULL DEFAULT 'not_prepared',
  outreach_channel TEXT,
  outreach_subject TEXT,
  outreach_body TEXT,
  outreach_approved_at TIMESTAMPTZ,
  outreach_sent_at TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  last_scanned_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demo_site_leads_status_check CHECK (lead_status IN (
    'new',
    'queued',
    'scanned',
    'qualified',
    'demo_created',
    'outreach_ready',
    'contacted',
    'responded',
    'converted',
    'not_fit',
    'opted_out',
    'archived'
  )),
  CONSTRAINT demo_site_leads_outreach_status_check CHECK (outreach_status IN (
    'not_prepared',
    'drafted',
    'needs_review',
    'approved',
    'sent',
    'replied',
    'declined',
    'opted_out'
  ))
);

CREATE TABLE IF NOT EXISTS demo_site_lead_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES demo_site_leads(id) ON DELETE CASCADE,
  website_url TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  mobile_score INTEGER,
  performance_score INTEGER,
  design_score INTEGER,
  seo_score INTEGER,
  trust_score INTEGER,
  issue_count INTEGER NOT NULL DEFAULT 0,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  improvements JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  logo_url TEXT,
  image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  brand_colors JSONB NOT NULL DEFAULT '{}'::jsonb,
  audit_status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demo_site_lead_audits_status_check CHECK (audit_status IN (
    'draft',
    'completed',
    'failed',
    'ignored'
  ))
);

CREATE TABLE IF NOT EXISTS demo_site_lead_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES demo_site_leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_site_leads_domain_unique
  ON demo_site_leads(domain)
  WHERE domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_demo_site_leads_status
  ON demo_site_leads(lead_status, outreach_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_demo_site_lead_audits_lead_id
  ON demo_site_lead_audits(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_demo_site_lead_events_lead_id
  ON demo_site_lead_events(lead_id, created_at DESC);

ALTER TABLE demo_site_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_site_lead_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_site_lead_events ENABLE ROW LEVEL SECURITY;
