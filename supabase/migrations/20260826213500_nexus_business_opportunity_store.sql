-- Nexus Business Opportunity Store
-- Normalized operational index across business-specific source systems.
-- Canonical data remains in each source (Revenue Today/contacts, Book Growth,
-- DemoSites, etc.). This table is an idempotent projection for Nexus Mission
-- Control, Pipeline Health and future orchestration.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nexus_business_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  brand_id TEXT NOT NULL,
  offer_id TEXT,
  pipeline_id TEXT NOT NULL CHECK (pipeline_id IN (
    'real_estate_sales',
    'publishing',
    'ai_products_services',
    'expert_advisory',
    'product_commerce',
    'creator_media'
  )),
  stage_id TEXT NOT NULL,
  lifecycle_phase TEXT NOT NULL CHECK (lifecycle_phase IN (
    'awareness',
    'engagement',
    'qualification',
    'consideration',
    'conversion',
    'delivery',
    'retention'
  )),
  opportunity_state TEXT NOT NULL DEFAULT 'active' CHECK (opportunity_state IN (
    'active', 'won', 'lost', 'archived'
  )),
  title TEXT NOT NULL,
  reason TEXT,
  next_action TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  priority_score INTEGER NOT NULL DEFAULT 50 CHECK (priority_score BETWEEN 0 AND 100),
  value NUMERIC(18,2),
  currency TEXT,
  route_confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (route_confidence IN ('high', 'medium', 'low', 'unknown')),
  route_reason TEXT,
  source_system TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_system, source_id, pipeline_id)
);

CREATE INDEX IF NOT EXISTS idx_nexus_business_opportunities_pipeline_stage
  ON nexus_business_opportunities(pipeline_id, stage_id, opportunity_state);

CREATE INDEX IF NOT EXISTS idx_nexus_business_opportunities_brand
  ON nexus_business_opportunities(brand_id, opportunity_state, priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_nexus_business_opportunities_contact
  ON nexus_business_opportunities(contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nexus_business_opportunities_source
  ON nexus_business_opportunities(source_system, source_id);

CREATE INDEX IF NOT EXISTS idx_nexus_business_opportunities_activity
  ON nexus_business_opportunities(last_activity_at DESC NULLS LAST, updated_at DESC);

CREATE OR REPLACE FUNCTION nexus_business_opportunity_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nexus_business_opportunity_updated_at ON nexus_business_opportunities;
CREATE TRIGGER trg_nexus_business_opportunity_updated_at
BEFORE UPDATE ON nexus_business_opportunities
FOR EACH ROW
EXECUTE FUNCTION nexus_business_opportunity_touch_updated_at();

ALTER TABLE nexus_business_opportunities ENABLE ROW LEVEL SECURITY;

-- Intentionally no anon/authenticated policies here. Server-side Nexus APIs use
-- the service role, matching other sensitive CRM/operational tables. Public
-- lead capture must go through controlled API routes rather than direct table access.

COMMENT ON TABLE nexus_business_opportunities IS
  'Idempotent normalized Nexus projection of business opportunities; canonical source data remains in source systems.';
COMMENT ON COLUMN nexus_business_opportunities.source_system IS
  'Canonical source adapter, e.g. revenue_today, book_growth, chatgenius_demosites.';
COMMENT ON COLUMN nexus_business_opportunities.source_id IS
  'Stable source-system identifier used with pipeline_id for idempotent upsert.';
