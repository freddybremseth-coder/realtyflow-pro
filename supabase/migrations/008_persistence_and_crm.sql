-- ============================================================================
-- 008_persistence_and_crm.sql
-- Land plots, contacts (unified pipeline+CRM), properties persistence
-- ============================================================================

-- ========================================
-- 1. Land Plots (Tomtebase)
-- ========================================
CREATE TABLE IF NOT EXISTS land_plots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plot_number TEXT DEFAULT '',
  area REAL DEFAULT 0,
  price REAL DEFAULT 0,
  location TEXT DEFAULT '',
  municipality TEXT DEFAULT '',
  zoning TEXT DEFAULT 'rustico' CHECK (zoning IN ('urbano', 'rustico', 'urbanizable')),
  water BOOLEAN DEFAULT false,
  electricity BOOLEAN DEFAULT false,
  slope TEXT DEFAULT '',
  road_access BOOLEAN DEFAULT false,
  notes TEXT DEFAULT '',
  lat REAL DEFAULT 0,
  lng REAL DEFAULT 0,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_land_plots_municipality ON land_plots(municipality);
CREATE INDEX IF NOT EXISTS idx_land_plots_zoning ON land_plots(zoning);
CREATE INDEX IF NOT EXISTS idx_land_plots_price ON land_plots(price);
CREATE INDEX IF NOT EXISTS idx_land_plots_area ON land_plots(area);

-- ========================================
-- 2. Unified Contacts (Pipeline + CRM)
-- ========================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  type TEXT DEFAULT 'buyer' CHECK (type IN ('buyer', 'seller', 'investor', 'tenant', 'other')),

  -- Pipeline fields
  pipeline_status TEXT DEFAULT 'NEW' CHECK (pipeline_status IN (
    'NEW', 'CONTACT', 'QUALIFIED', 'VIEWING', 'NEGOTIATION', 'ON_HOLD',
    'WON', 'CUSTOMER', 'VIP', 'LOST'
  )),
  pipeline_value REAL DEFAULT 0,
  property_interest TEXT DEFAULT '',

  -- CRM fields
  company TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  sentiment TEXT DEFAULT 'neutral' CHECK (sentiment IN ('hot', 'warm', 'neutral', 'cold')),

  -- AI automation
  ai_auto_followup BOOLEAN DEFAULT false,
  ai_followup_interval_days INTEGER DEFAULT 7,
  last_ai_followup TIMESTAMPTZ,

  -- Interaction tracking
  interactions JSONB DEFAULT '[]',
  last_contact TIMESTAMPTZ,
  next_followup TIMESTAMPTZ,

  -- Source tracking
  source TEXT DEFAULT 'manual',
  brand TEXT DEFAULT 'soleada',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(pipeline_status);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(type);
CREATE INDEX IF NOT EXISTS idx_contacts_brand ON contacts(brand);
CREATE INDEX IF NOT EXISTS idx_contacts_sentiment ON contacts(sentiment);
CREATE INDEX IF NOT EXISTS idx_contacts_ai_followup ON contacts(ai_auto_followup) WHERE ai_auto_followup = true;

-- ========================================
-- 3. Properties table (if not exists from earlier)
-- ========================================
CREATE TABLE IF NOT EXISTS properties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'Villa',
  status TEXT DEFAULT 'active',
  price REAL DEFAULT 0,
  location TEXT DEFAULT '',
  bedrooms INTEGER DEFAULT 0,
  bathrooms INTEGER DEFAULT 0,
  area REAL DEFAULT 0,
  description TEXT DEFAULT '',
  features TEXT[] DEFAULT '{}',
  images TEXT[] DEFAULT '{}',
  source TEXT DEFAULT 'manual',
  external_id TEXT,
  external_url TEXT,
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(type);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);

-- ========================================
-- 4. Leads table (if not exists from earlier)
-- ========================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  source TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'NEW',
  property TEXT DEFAULT '',
  value REAL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- 5. Extra columns for Inventory page
-- ========================================
ALTER TABLE properties ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS image_color TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS year_built INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS garage BOOLEAN DEFAULT FALSE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS pool BOOLEAN DEFAULT FALSE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS energy_rating TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ref TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS primary_image TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS plot_size REAL DEFAULT 0;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS built_area REAL DEFAULT 0;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_type TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS title_no TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS description_no TEXT;

-- ========================================
-- 6. RLS Policies
-- ========================================
ALTER TABLE land_plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on land_plots') THEN
    CREATE POLICY "Allow all on land_plots" ON land_plots FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on contacts') THEN
    CREATE POLICY "Allow all on contacts" ON contacts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on properties') THEN
    CREATE POLICY "Allow all on properties" ON properties FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on leads') THEN
    CREATE POLICY "Allow all on leads" ON leads FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
