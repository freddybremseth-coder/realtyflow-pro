-- ============================================================================
-- 003_email_automation.sql
-- Email automation system: brand configs, messages, AI drafts
-- ============================================================================

-- Brand email configurations (IMAP/SMTP credentials, encrypted)
CREATE TABLE IF NOT EXISTS brand_email_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id TEXT NOT NULL,
  email_address TEXT NOT NULL,
  display_name TEXT,
  -- IMAP settings
  imap_host TEXT NOT NULL,
  imap_port INTEGER DEFAULT 993,
  imap_secure BOOLEAN DEFAULT true,
  -- SMTP settings
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER DEFAULT 587,
  smtp_secure BOOLEAN DEFAULT true,
  -- Credentials (encrypted with AES-256-GCM, server-side only)
  encrypted_password TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  -- Settings
  auto_fetch BOOLEAN DEFAULT true,
  fetch_interval_minutes INTEGER DEFAULT 5,
  ai_auto_draft BOOLEAN DEFAULT true,
  signature TEXT,
  is_active BOOLEAN DEFAULT true,
  last_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email messages (incoming and outgoing)
CREATE TABLE IF NOT EXISTS email_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id TEXT NOT NULL,
  message_id TEXT UNIQUE, -- IMAP Message-ID header
  thread_id TEXT, -- for grouping conversations
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_address TEXT NOT NULL,
  from_name TEXT,
  to_addresses TEXT[] NOT NULL,
  cc_addresses TEXT[],
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  attachments JSONB DEFAULT '[]',
  -- AI analysis
  ai_summary TEXT,
  ai_intent TEXT, -- inquiry, viewing_request, offer, complaint, follow_up, general
  ai_language TEXT, -- detected language
  ai_urgency TEXT CHECK (ai_urgency IN ('low', 'medium', 'high', 'critical')),
  ai_sentiment TEXT CHECK (ai_sentiment IN ('positive', 'neutral', 'negative')),
  ai_suggested_action TEXT,
  -- Matching
  matched_lead_id TEXT,
  matched_customer_id TEXT,
  matched_property_ids TEXT[],
  matched_plot_ids TEXT[],
  -- Status
  is_read BOOLEAN DEFAULT false,
  is_starred BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  has_draft_reply BOOLEAN DEFAULT false,
  replied_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI-generated draft replies
CREATE TABLE IF NOT EXISTS email_drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email_message_id UUID REFERENCES email_messages(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL,
  to_addresses TEXT[] NOT NULL,
  subject TEXT,
  body_text TEXT NOT NULL,
  body_html TEXT,
  -- AI metadata
  ai_model TEXT DEFAULT 'claude-sonnet-4',
  ai_context JSONB, -- what data was used to generate
  ai_confidence REAL, -- 0-1 confidence score
  tone TEXT, -- professional, friendly, urgent
  language TEXT DEFAULT 'no',
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'discarded')),
  edited_by_user BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_email_messages_brand ON email_messages(brand_id);
CREATE INDEX idx_email_messages_thread ON email_messages(thread_id);
CREATE INDEX idx_email_messages_intent ON email_messages(ai_intent);
CREATE INDEX idx_email_messages_urgency ON email_messages(ai_urgency);
CREATE INDEX idx_email_messages_unread ON email_messages(brand_id, is_read) WHERE NOT is_read;
CREATE INDEX idx_email_messages_received ON email_messages(received_at DESC);
CREATE INDEX idx_email_drafts_message ON email_drafts(email_message_id);
CREATE INDEX idx_email_drafts_status ON email_drafts(status);
CREATE INDEX idx_brand_email_configs_brand ON brand_email_configs(brand_id);

-- Enable Row Level Security
ALTER TABLE brand_email_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;

-- RLS policies (allow all for authenticated users - single-tenant app)
CREATE POLICY "Allow all on brand_email_configs" ON brand_email_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on email_messages" ON email_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on email_drafts" ON email_drafts FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger function (reuse if exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at timestamps
CREATE TRIGGER set_brand_email_configs_updated_at
  BEFORE UPDATE ON brand_email_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_email_drafts_updated_at
  BEFORE UPDATE ON email_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
