-- ============================================================================
-- Re-Master Freddy + Olivia foundation tables
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Re-Master Freddy expects this table through src/services/integrations/airtable-client.ts.
CREATE TABLE IF NOT EXISTS songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  artist TEXT DEFAULT 'Re-Master Freddy',
  genre TEXT,
  mood TEXT,
  bpm INTEGER,
  duration INTEGER,
  file_url TEXT,
  status TEXT DEFAULT 'ready',
  youtube_url TEXT,
  youtube_channel_id TEXT,
  youtube_video_id TEXT,
  brand TEXT DEFAULT 'neural-beat',
  tags TEXT[] DEFAULT '{}',
  steps JSONB DEFAULT '[]',
  style TEXT,
  energy TEXT,
  visual_style TEXT,
  image_url TEXT,
  ai_metadata JSONB DEFAULT '{}',
  error_message TEXT,
  thumbnail_url TEXT,
  airtable_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_songs_status ON songs(status);
CREATE INDEX IF NOT EXISTS idx_songs_youtube_url ON songs(youtube_url);
CREATE INDEX IF NOT EXISTS idx_songs_brand ON songs(brand);
CREATE INDEX IF NOT EXISTS idx_songs_created_at ON songs(created_at DESC);

CREATE TABLE IF NOT EXISTS genre_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  genre TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_genre_images_genre ON genre_images(genre);

-- Shared image/product bank used by Re-Master, Image Studio and Ad Campaigns.
CREATE TABLE IF NOT EXISTS user_image_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT DEFAULT 'system',
  url TEXT NOT NULL,
  name TEXT,
  kind TEXT DEFAULT 'image',
  tags TEXT[] DEFAULT '{}',
  width INTEGER,
  height INTEGER,
  size_bytes BIGINT,
  use_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_image_bank_owner ON user_image_bank(owner);
CREATE INDEX IF NOT EXISTS idx_user_image_bank_kind ON user_image_bank(kind);
CREATE INDEX IF NOT EXISTS idx_user_image_bank_created_at ON user_image_bank(created_at DESC);

-- Olivia / Dona Anna farm finance fallback tables for the main RealtyFlow DB.
CREATE TABLE IF NOT EXISTS farm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_name TEXT DEFAULT 'Dona Anna',
  currency TEXT DEFAULT 'EUR',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parcels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  area NUMERIC,
  municipality TEXT,
  crop_type TEXT DEFAULT 'olive',
  tree_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS harvest_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id UUID REFERENCES parcels(id) ON DELETE SET NULL,
  harvest_date DATE DEFAULT CURRENT_DATE,
  season TEXT,
  kilograms NUMERIC DEFAULT 0,
  price_per_kg NUMERIC DEFAULT 0,
  total_revenue NUMERIC,
  currency TEXT DEFAULT 'EUR',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS farm_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id UUID REFERENCES parcels(id) ON DELETE SET NULL,
  date DATE DEFAULT CURRENT_DATE,
  category TEXT DEFAULT 'Annet',
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  vendor TEXT,
  description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subsidy_income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE DEFAULT CURRENT_DATE,
  category TEXT DEFAULT 'Subsidy',
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_harvest_records_date ON harvest_records(harvest_date DESC);
CREATE INDEX IF NOT EXISTS idx_farm_expenses_date ON farm_expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_subsidy_income_date ON subsidy_income(date DESC);

INSERT INTO farm_settings (farm_name, currency)
SELECT 'Dona Anna', 'EUR'
WHERE NOT EXISTS (SELECT 1 FROM farm_settings);

-- Storage buckets used by the current code paths:
-- - assets: direct MP3/product uploads
-- - neural-beat: generated pipeline images
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('assets', 'assets', true),
  ('neural-beat', 'neural-beat', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE genre_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_image_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvest_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE subsidy_income ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'songs' AND policyname = 'Allow all on songs') THEN
    CREATE POLICY "Allow all on songs" ON songs FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'genre_images' AND policyname = 'Allow all on genre_images') THEN
    CREATE POLICY "Allow all on genre_images" ON genre_images FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_image_bank' AND policyname = 'Allow all on user_image_bank') THEN
    CREATE POLICY "Allow all on user_image_bank" ON user_image_bank FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'farm_settings' AND policyname = 'Allow all on farm_settings') THEN
    CREATE POLICY "Allow all on farm_settings" ON farm_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'parcels' AND policyname = 'Allow all on parcels') THEN
    CREATE POLICY "Allow all on parcels" ON parcels FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'harvest_records' AND policyname = 'Allow all on harvest_records') THEN
    CREATE POLICY "Allow all on harvest_records" ON harvest_records FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'farm_expenses' AND policyname = 'Allow all on farm_expenses') THEN
    CREATE POLICY "Allow all on farm_expenses" ON farm_expenses FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subsidy_income' AND policyname = 'Allow all on subsidy_income') THEN
    CREATE POLICY "Allow all on subsidy_income" ON subsidy_income FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public read assets') THEN
    CREATE POLICY "Public read assets" ON storage.objects FOR SELECT USING (bucket_id IN ('assets', 'neural-beat'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Service writes assets') THEN
    CREATE POLICY "Service writes assets" ON storage.objects FOR ALL USING (bucket_id IN ('assets', 'neural-beat')) WITH CHECK (bucket_id IN ('assets', 'neural-beat'));
  END IF;
END $$;
