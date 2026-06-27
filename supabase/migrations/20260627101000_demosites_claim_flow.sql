-- DemoSites claim / expiry flow
-- Adds fields needed for temporary demo previews that must be claimed or purchased.

ALTER TABLE demo_site_orders
  ADD COLUMN IF NOT EXISTS claim_token TEXT,
  ADD COLUMN IF NOT EXISTS claim_url TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_site_orders_claim_token
  ON demo_site_orders(claim_token)
  WHERE claim_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_demo_site_orders_expires_at
  ON demo_site_orders(expires_at);

ALTER TABLE demo_site_orders
  DROP CONSTRAINT IF EXISTS demo_site_orders_status_check;

ALTER TABLE demo_site_orders
  ADD CONSTRAINT demo_site_orders_status_check CHECK (status IN (
    'lead',
    'draft_preview',
    'ordered',
    'in_setup',
    'preview_ready',
    'approved',
    'deployed',
    'paused',
    'expired',
    'cancelled'
  ));
