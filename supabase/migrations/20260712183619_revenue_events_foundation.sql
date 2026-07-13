-- Revenue Events Foundation
-- Shared customer/revenue memory for AI, automations and human actions.
-- This table is intentionally append-first: it records what happened without
-- making automatic customer-facing decisions.

CREATE TABLE IF NOT EXISTS revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  brand_id TEXT,
  source_system TEXT NOT NULL DEFAULT 'manual',
  source_type TEXT,
  source_id TEXT,
  actor_type TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('human', 'ai', 'automation', 'system', 'customer', 'external')),
  actor_id TEXT,
  confidence_score INTEGER
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100)),
  revenue_impact_eur NUMERIC(14, 2),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dedupe_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_revenue_events_dedupe_key
  ON revenue_events(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_revenue_events_contact_occurred
  ON revenue_events(contact_id, occurred_at DESC)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_revenue_events_brand_occurred
  ON revenue_events(brand_id, occurred_at DESC)
  WHERE brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_revenue_events_type_occurred
  ON revenue_events(event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_events_source
  ON revenue_events(source_system, source_type, source_id);

ALTER TABLE revenue_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "revenue_events_authenticated_rw" ON revenue_events;
CREATE POLICY "revenue_events_authenticated_rw" ON revenue_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON revenue_events TO authenticated, service_role;

COMMENT ON TABLE revenue_events IS
  'Append-first customer/revenue event ledger used as shared memory for AI, automations and human sales work.';

COMMENT ON COLUMN revenue_events.dedupe_key IS
  'Optional idempotency key. When present, the same event should only be inserted once.';
