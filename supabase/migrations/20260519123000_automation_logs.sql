-- ============================================================================
-- Automation logs table (used by automation engine + cron autopilots)
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  agent_name TEXT,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error')),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_created_at ON automation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_status ON automation_logs(status);
CREATE INDEX IF NOT EXISTS idx_automation_logs_agent ON automation_logs(agent_name);

ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on automation_logs') THEN
    CREATE POLICY "Allow all on automation_logs" ON automation_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

