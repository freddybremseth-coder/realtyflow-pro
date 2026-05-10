-- Document hub: drafts, archive, channel routing, scheduling
-- Adds workflow columns to market_reports so generated documents can live as
-- drafts (not visible to clients), be archived, and target specific channels.

ALTER TABLE market_reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'portal',
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_topic TEXT,
  ADD COLUMN IF NOT EXISTS audience_label TEXT,
  ADD COLUMN IF NOT EXISTS ai_model TEXT;

-- Allowed values:
--   status:  draft | published | archived
--   channel: portal | email | newsletter | knowledge_base | attachment
ALTER TABLE market_reports
  DROP CONSTRAINT IF EXISTS market_reports_status_check;
ALTER TABLE market_reports
  ADD CONSTRAINT market_reports_status_check
  CHECK (status IN ('draft', 'published', 'archived'));

ALTER TABLE market_reports
  DROP CONSTRAINT IF EXISTS market_reports_channel_check;
ALTER TABLE market_reports
  ADD CONSTRAINT market_reports_channel_check
  CHECK (channel IN ('portal', 'email', 'newsletter', 'knowledge_base', 'attachment'));

CREATE INDEX IF NOT EXISTS idx_market_reports_status ON market_reports(status);
CREATE INDEX IF NOT EXISTS idx_market_reports_channel ON market_reports(channel);
CREATE INDEX IF NOT EXISTS idx_market_reports_scheduled ON market_reports(scheduled_for) WHERE scheduled_for IS NOT NULL;

-- Backfill: existing rows with recipients='portal_all' are already published to portal.
UPDATE market_reports
SET status = 'published',
    channel = 'portal',
    published_at = COALESCE(published_at, generated_at, created_at)
WHERE status = 'draft' AND recipients = 'portal_all';
