-- User image bank — lets users save images across sessions for reuse in
-- Neural Beat video slideshows, logos, and custom thumbnails.
CREATE TABLE IF NOT EXISTS user_image_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL DEFAULT 'system',        -- brand_id / user identifier
  url TEXT NOT NULL,                            -- Supabase Storage public URL
  name TEXT,                                    -- original filename or user label
  kind TEXT NOT NULL DEFAULT 'image',           -- 'image' | 'logo' | 'thumbnail'
  tags TEXT[] DEFAULT '{}',                     -- user-supplied tags for filtering
  size_bytes BIGINT,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  use_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_user_image_bank_owner ON user_image_bank(owner);
CREATE INDEX IF NOT EXISTS idx_user_image_bank_kind ON user_image_bank(kind);
CREATE INDEX IF NOT EXISTS idx_user_image_bank_created_at ON user_image_bank(created_at DESC);

-- RLS: service-role only for now (Anon read/write handled via service key from Next API).
ALTER TABLE user_image_bank ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_image_bank' AND policyname = 'user_image_bank_service_all') THEN
    CREATE POLICY "user_image_bank_service_all" ON user_image_bank FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
