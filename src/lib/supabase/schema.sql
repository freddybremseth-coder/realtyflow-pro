-- =============================================
-- RealtyFlow Pro - Unified Database Schema
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- BRANDS
-- =============================================
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('real_estate', 'saas', 'agriculture', 'personal', 'music')),
  description TEXT,
  color VARCHAR(7),
  logo_url TEXT,
  website TEXT,
  email VARCHAR(200),
  contact_phone VARCHAR(30),
  tone TEXT,
  target_audience TEXT,
  specialties TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- LEADS & CRM (from RealtyFlow)
-- =============================================
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  email VARCHAR(200),
  phone VARCHAR(30),
  source VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'CONTACT', 'QUALIFIED', 'VIEWING', 'NEGOTIATION', 'WON', 'ON_HOLD', 'LOST')),
  budget NUMERIC(12, 2),
  currency VARCHAR(3) DEFAULT 'EUR',
  location TEXT,
  notes TEXT,
  sentiment_score NUMERIC(5, 2),
  urgency_score NUMERIC(5, 2),
  intent_score NUMERIC(5, 2),
  personality_profile TEXT,
  viewing_scheduled_date TIMESTAMPTZ,
  nurture_sequence_step INTEGER DEFAULT 0,
  brand_id UUID REFERENCES brands(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_brand ON leads(brand_id);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200),
  phone VARCHAR(30),
  nationality VARCHAR(50),
  location TEXT,
  budget NUMERIC(12, 2),
  status VARCHAR(20) DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'VIP', 'INACTIVE', 'CLOSED')),
  customer_type VARCHAR(20) DEFAULT 'BUYER'
    CHECK (customer_type IN ('BUYER', 'SELLER', 'INVESTOR', 'RENTER')),
  properties_interested TEXT[],
  transaction_history TEXT,
  notes TEXT,
  last_contact TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PROPERTIES (from RealtyFlow)
-- =============================================
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ref VARCHAR(50) UNIQUE,
  price NUMERIC(12, 2) NOT NULL,
  property_type VARCHAR(30),
  location TEXT NOT NULL,
  town VARCHAR(100),
  lat NUMERIC(10, 7),
  lng NUMERIC(10, 7),
  bedrooms INTEGER,
  bathrooms INTEGER,
  plot_size NUMERIC(10, 2),
  built_area NUMERIC(10, 2),
  terrace_size NUMERIC(10, 2),
  solarium BOOLEAN DEFAULT FALSE,
  pool BOOLEAN DEFAULT FALSE,
  -- Multilingual fields (NO, EN, ES, DE, FR, RU)
  title_no TEXT,
  title_en TEXT,
  title_es TEXT,
  title_de TEXT,
  title_fr TEXT,
  title_ru TEXT,
  description_no TEXT,
  description_en TEXT,
  description_es TEXT,
  description_de TEXT,
  description_fr TEXT,
  description_ru TEXT,
  amenities_no TEXT[],
  amenities_en TEXT[],
  amenities_es TEXT[],
  primary_image TEXT,
  gallery TEXT[],
  floorplans TEXT[],
  energy_rating VARCHAR(5),
  date_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_properties_ref ON properties(ref);
CREATE INDEX idx_properties_town ON properties(town);
CREATE INDEX idx_properties_type ON properties(property_type);
CREATE INDEX idx_properties_price ON properties(price);

-- =============================================
-- APPOINTMENTS (from RealtyFlow)
-- =============================================
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(200) NOT NULL,
  type VARCHAR(20) NOT NULL
    CHECK (type IN ('VIEWING', 'MEETING', 'CALL', 'VALUATION', 'SIGNING', 'OTHER')),
  date DATE NOT NULL,
  time TIME,
  duration INTEGER DEFAULT 60,
  location TEXT,
  contact_email VARCHAR(200),
  contact_phone VARCHAR(30),
  notes TEXT,
  status VARCHAR(20) DEFAULT 'PENDING'
    CHECK (status IN ('CONFIRMED', 'PENDING', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- MARKETING (from RealtyFlow)
-- =============================================
CREATE TABLE marketing_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  platform VARCHAR(30),
  status VARCHAR(20) DEFAULT 'TO_DO'
    CHECK (status IN ('TO_DO', 'IN_PROGRESS', 'REVIEW', 'DONE')),
  priority VARCHAR(10) DEFAULT 'MEDIUM'
    CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
  due_date DATE,
  tags TEXT[],
  brand_id UUID REFERENCES brands(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  headline TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  objective TEXT,
  platform VARCHAR(30),
  viral_impact_score NUMERIC(4, 2),
  brand_id UUID REFERENCES brands(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- VALUATIONS (from RealtyFlow)
-- =============================================
CREATE TABLE saved_valuations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_ref VARCHAR(50),
  estimated_price_low NUMERIC(12, 2),
  estimated_price_agent NUMERIC(12, 2),
  estimated_price_high NUMERIC(12, 2),
  comparable_properties JSONB,
  market_analysis TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- MARKET ANALYSES (from RealtyFlow)
-- =============================================
CREATE TABLE market_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location TEXT,
  theme VARCHAR(20) CHECK (theme IN ('PRICING', 'INFRASTRUCTURE', 'LEGAL', 'GENERAL')),
  analysis_data JSONB,
  date_created TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PROFILES & SETTINGS (from RealtyFlow)
-- =============================================
CREATE TABLE advisor_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(30),
  location TEXT,
  specializations TEXT[],
  expertise_areas TEXT[],
  signature TEXT
);

CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE,
  language VARCHAR(2) DEFAULT 'NO',
  market_pulse_enabled BOOLEAN DEFAULT FALSE,
  brand_identity_guard_enabled BOOLEAN DEFAULT FALSE,
  social_sync_enabled BOOLEAN DEFAULT FALSE,
  lead_nurture_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SOCIAL MEDIA POSTS (from Social Media Hub)
-- =============================================
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content TEXT NOT NULL,
  media_urls TEXT[],
  platforms VARCHAR(20)[],
  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  brand_id UUID REFERENCES brands(id),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  virality_score NUMERIC(4, 2),
  engagement JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_scheduled ON posts(scheduled_at);
CREATE INDEX idx_posts_brand ON posts(brand_id);

-- =============================================
-- CONTENT GENERATIONS (from Social Media Hub)
-- =============================================
CREATE TABLE content_generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID REFERENCES brands(id),
  platform VARCHAR(20),
  content TEXT NOT NULL,
  variants TEXT[],
  hashtags TEXT[],
  agent_used VARCHAR(50),
  virality_score NUMERIC(4, 2),
  tone VARCHAR(30),
  goal VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- YOUTUBE VIDEOS (from Social Media Hub)
-- =============================================
CREATE TABLE youtube_videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  youtube_url TEXT,
  youtube_id VARCHAR(20),
  tags TEXT[],
  thumbnail_url TEXT,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  brand_id UUID REFERENCES brands(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PIPELINE RUNS (from Social Media Hub)
-- =============================================
CREATE TABLE pipeline_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('neural_beat', 'brand_video')),
  status VARCHAR(20) DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  steps_completed TEXT[],
  current_step VARCHAR(100),
  error TEXT,
  song_name VARCHAR(200),
  youtube_url TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- =============================================
-- AUTOMATION LOGS (from Social Media Hub)
-- =============================================
CREATE TABLE automation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action VARCHAR(100) NOT NULL,
  agent_name VARCHAR(50),
  status VARCHAR(20) DEFAULT 'success',
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- AGENT COMMANDS (from Social Media Hub)
-- =============================================
CREATE TABLE agent_commands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_name VARCHAR(50) NOT NULL,
  command TEXT NOT NULL,
  result TEXT,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- =============================================
-- CONTENT CALENDAR (new - unified)
-- =============================================
CREATE TABLE content_calendar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(200) NOT NULL,
  type VARCHAR(20) NOT NULL
    CHECK (type IN ('appointment', 'post', 'campaign', 'video', 'task')),
  date DATE NOT NULL,
  time TIME,
  brand_id UUID REFERENCES brands(id),
  linked_id UUID,
  color VARCHAR(7),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calendar_date ON content_calendar(date);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (single-user app)
CREATE POLICY "Allow all for authenticated" ON brands FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON leads FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON customers FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON properties FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON appointments FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON marketing_tasks FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON marketing_campaigns FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON saved_valuations FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON market_analyses FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON advisor_profiles FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON settings FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON posts FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON content_generations FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON youtube_videos FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON pipeline_runs FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON automation_logs FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON agent_commands FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated" ON content_calendar FOR ALL TO authenticated USING (true);
