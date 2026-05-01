-- Scanner publishing + portal messaging

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS show_on_website BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS website_visible BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_properties_show_on_website
  ON properties (show_on_website, status);

CREATE TABLE IF NOT EXISTS portal_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  brand_id TEXT DEFAULT 'zeneco',
  sender_type TEXT NOT NULL DEFAULT 'customer'
    CHECK (sender_type IN ('customer', 'admin', 'system')),
  sender_name TEXT,
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  read_by_admin_at TIMESTAMPTZ,
  read_by_customer_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_messages_email ON portal_messages (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_messages_contact ON portal_messages (contact_id, created_at DESC);

ALTER TABLE portal_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on portal_messages') THEN
    CREATE POLICY "Allow all on portal_messages" ON portal_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
