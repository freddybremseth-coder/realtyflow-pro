-- ============================================================================
-- Advisor Playbooks
-- Verified advisory snippets, checklists and customer-safe wording for agents.
-- ============================================================================

CREATE TABLE IF NOT EXISTS advisor_playbooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id TEXT NOT NULL DEFAULT 'zeneco',
  title TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT 'buyer_advice',
  region TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  confidence TEXT NOT NULL DEFAULT 'verified' CHECK (confidence IN ('draft', 'needs_review', 'verified')),
  summary TEXT DEFAULT '',
  customer_message TEXT DEFAULT '',
  internal_notes TEXT DEFAULT '',
  checklist JSONB DEFAULT '[]',
  sources JSONB DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  next_review_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advisor_playbooks_brand ON advisor_playbooks(brand_id);
CREATE INDEX IF NOT EXISTS idx_advisor_playbooks_topic ON advisor_playbooks(topic);
CREATE INDEX IF NOT EXISTS idx_advisor_playbooks_status ON advisor_playbooks(status);
CREATE INDEX IF NOT EXISTS idx_advisor_playbooks_tags ON advisor_playbooks USING GIN(tags);

ALTER TABLE advisor_playbooks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on advisor_playbooks') THEN
    CREATE POLICY "Allow all on advisor_playbooks" ON advisor_playbooks FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
