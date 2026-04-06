-- Chatbot conversation sessions for analytics and lead tracking
CREATE TABLE IF NOT EXISTS chatbot_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  brand_id TEXT,
  visitor_name TEXT,
  visitor_email TEXT,
  last_message TEXT,
  message_count INTEGER DEFAULT 0,
  last_page TEXT,
  lead_captured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_brand ON chatbot_sessions(brand_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_lead ON chatbot_sessions(lead_captured);
