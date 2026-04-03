-- Persist Victoria command center conversations and plans
CREATE TABLE IF NOT EXISTS command_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT DEFAULT '',
  messages JSONB DEFAULT '[]',
  active_plan JSONB,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_command_conversations_updated ON command_conversations(updated_at DESC);

ALTER TABLE command_conversations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'command_conversations' AND policyname = 'command_conversations_all') THEN
    CREATE POLICY "command_conversations_all" ON command_conversations USING (true) WITH CHECK (true);
  END IF;
END $$;
