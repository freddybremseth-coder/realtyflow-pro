-- ============================================================================
-- Business Financial Events
-- Shared finance ledger for Business Overview across CRM, KDP, SaaS and Olivia.
-- ============================================================================

CREATE TABLE IF NOT EXISTS business_financial_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('crm', 'kdp', 'saas', 'olivia', 'manual')),
  source_id TEXT NOT NULL,
  stream TEXT NOT NULL CHECK (stream IN (
    'commission',
    'sale_value',
    'kdp_royalty',
    'saas_revenue',
    'saas_mrr',
    'olive_harvest',
    'olive_subsidy',
    'olive_expense',
    'manual_adjustment'
  )),
  direction TEXT NOT NULL CHECK (direction IN ('income', 'expense', 'metric')),
  status TEXT DEFAULT 'recognized' CHECK (status IN ('pending', 'recognized', 'paid', 'cancelled')),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_financial_events_unique_source
  ON business_financial_events(source_type, source_id, stream);

CREATE INDEX IF NOT EXISTS idx_business_financial_events_brand
  ON business_financial_events(brand_id);

CREATE INDEX IF NOT EXISTS idx_business_financial_events_date
  ON business_financial_events(event_date DESC);

CREATE INDEX IF NOT EXISTS idx_business_financial_events_stream
  ON business_financial_events(stream);

ALTER TABLE business_financial_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on business_financial_events') THEN
    CREATE POLICY "Allow all on business_financial_events" ON business_financial_events FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
