-- ============================================================================
-- Work Items HUB
-- One operational task engine for CRM, content, automations, website leads,
-- AI agents and manual work.
-- ============================================================================

CREATE TABLE IF NOT EXISTS work_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'TO_DO'
    CHECK (status IN ('TO_DO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  due_date DATE,
  brand_id TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN (
      'manual',
      'crm',
      'content',
      'automation',
      'ai_agent',
      'website_lead',
      'chatbot',
      'saas',
      'property',
      'market_intelligence'
    )),
  source_id TEXT,
  assigned_agent TEXT,
  next_action TEXT,
  ai_score INTEGER DEFAULT 0 CHECK (ai_score >= 0 AND ai_score <= 100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_items_priority ON work_items(priority);
CREATE INDEX IF NOT EXISTS idx_work_items_due_date ON work_items(due_date);
CREATE INDEX IF NOT EXISTS idx_work_items_source ON work_items(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_work_items_brand ON work_items(brand_id);

ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on work_items') THEN
    CREATE POLICY "Allow all on work_items" ON work_items FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  conditions JSONB DEFAULT '{}',
  actions JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'paused' CHECK (status IN ('active', 'paused', 'disabled')),
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  failure_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id UUID REFERENCES automation_rules(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error', 'cancelled')),
  input JSONB DEFAULT '{}',
  output JSONB DEFAULT '{}',
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on automation_rules') THEN
    CREATE POLICY "Allow all on automation_rules" ON automation_rules FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on automation_runs') THEN
    CREATE POLICY "Allow all on automation_runs" ON automation_runs FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
