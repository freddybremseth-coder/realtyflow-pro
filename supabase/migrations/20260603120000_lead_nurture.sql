-- Lead Nurture Engine
-- Aktiverer automatisk oppfølging av innkommende leads (web + booking).
-- Bruker eksisterende `contacts` som kilde (next_followup/ai_auto_followup var
-- forberedt i 008_persistence_and_crm.sql men aldri koblet til en motor).
-- Idempotent: hver sekvens-steg sendes maks én gang per kontakt.

-- 1. Nurture-status på kontakten (additivt, trygt å kjøre flere ganger)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS nurture_status TEXT DEFAULT 'active'
  CHECK (nurture_status IN ('active', 'paused', 'completed', 'opted_out'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS nurture_sequence TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS nurture_enrolled_at TIMESTAMPTZ;

-- 2. Logg over hver sendt (eller dry-run) nurture-berøring
CREATE TABLE IF NOT EXISTS lead_nurture_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  brand_id TEXT DEFAULT '',
  sequence_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  channel TEXT DEFAULT 'email',
  subject TEXT DEFAULT '',
  body_preview TEXT DEFAULT '',
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'dry_run', 'skipped', 'failed')),
  dry_run BOOLEAN DEFAULT true,
  error TEXT,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotens: ett reelt utsendt steg per kontakt+sekvens+steg.
-- (dry-run skal kunne gjentas, derfor partial unique index på status != 'dry_run')
CREATE UNIQUE INDEX IF NOT EXISTS uniq_nurture_real_send
  ON lead_nurture_events (contact_id, sequence_id, step_id)
  WHERE status IN ('sent', 'queued');

CREATE INDEX IF NOT EXISTS idx_nurture_contact ON lead_nurture_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_nurture_brand ON lead_nurture_events(brand_id);
CREATE INDEX IF NOT EXISTS idx_nurture_created ON lead_nurture_events(created_at DESC);

-- 3. RLS (servicerolle i cron bypasser dette; policy for app-tilgang)
ALTER TABLE lead_nurture_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nurture_events_rw" ON lead_nurture_events;
CREATE POLICY "nurture_events_rw" ON lead_nurture_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON lead_nurture_events TO authenticated, service_role;
