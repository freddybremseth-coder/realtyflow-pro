-- Re-Master Freddy + Olivia minimum foundation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  artist TEXT DEFAULT 'Re-Master Freddy',
  genre TEXT, mood TEXT, bpm INTEGER, duration INTEGER,
  file_url TEXT, status TEXT DEFAULT 'ready', youtube_url TEXT,
  youtube_channel_id TEXT, brand TEXT DEFAULT 'neural-beat',
  tags TEXT[] DEFAULT '{}', steps JSONB DEFAULT '[]', airtable_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_songs_brand ON songs(brand);
CREATE INDEX IF NOT EXISTS idx_songs_created_at ON songs(created_at DESC);

CREATE TABLE IF NOT EXISTS farm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_name TEXT DEFAULT 'Dona Anna', currency TEXT DEFAULT 'EUR',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parcels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, area NUMERIC, municipality TEXT,
  crop_type TEXT DEFAULT 'olive', tree_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS harvest_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id UUID REFERENCES parcels(id) ON DELETE SET NULL,
  harvest_date DATE DEFAULT CURRENT_DATE, season TEXT,
  kilograms NUMERIC DEFAULT 0, price_per_kg NUMERIC DEFAULT 0,
  total_revenue NUMERIC, currency TEXT DEFAULT 'EUR', notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS farm_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id UUID REFERENCES parcels(id) ON DELETE SET NULL,
  date DATE DEFAULT CURRENT_DATE, category TEXT DEFAULT 'Annet',
  amount NUMERIC NOT NULL DEFAULT 0, currency TEXT DEFAULT 'EUR',
  vendor TEXT, description TEXT, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subsidy_income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE DEFAULT CURRENT_DATE, category TEXT DEFAULT 'Subsidy',
  amount NUMERIC NOT NULL DEFAULT 0, currency TEXT DEFAULT 'EUR',
  description TEXT, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_harvest_records_date ON harvest_records(harvest_date DESC);
CREATE INDEX IF NOT EXISTS idx_farm_expenses_date ON farm_expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_subsidy_income_date ON subsidy_income(date DESC);

INSERT INTO farm_settings (farm_name, currency)
SELECT 'Dona Anna', 'EUR' WHERE NOT EXISTS (SELECT 1 FROM farm_settings);

INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true), ('neural-beat', 'neural-beat', true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvest_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE subsidy_income ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['songs','farm_settings','parcels','harvest_records','farm_expenses','subsidy_income'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'Allow all on ' || t) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true)', 'Allow all on ' || t, t);
    END IF;
  END LOOP;
END $$;
