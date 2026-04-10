-- ============================================================================
-- 016_chatbot_messages.sql
-- Add full conversation history to chatbot_sessions
-- ============================================================================

-- Add messages column to store full conversation history
ALTER TABLE chatbot_sessions
  ADD COLUMN IF NOT EXISTS messages JSONB DEFAULT '[]';

-- Add index for faster queries by brand and date
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_updated ON chatbot_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_created ON chatbot_sessions(created_at DESC);
