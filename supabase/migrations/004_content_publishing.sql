-- ============================================================================
-- 004_content_publishing.sql
-- Content publishing system: publications, campaigns
-- ============================================================================

CREATE TABLE IF NOT EXISTS content_publications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  title TEXT,
  description TEXT,
  tags TEXT[],
  media_urls TEXT[],
  youtube_url TEXT,
  youtube_video_id TEXT,
  instagram_post_id TEXT,
  facebook_post_id TEXT,
  linkedin_post_id TEXT,
  tiktok_post_id TEXT,
  pinterest_pin_id TEXT,
  ai_generated BOOLEAN DEFAULT false,
  ai_title TEXT,
  ai_description TEXT,
  ai_tags TEXT[],
  ai_image_url TEXT,
  campaign_id UUID,
  total_views INTEGER DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  total_shares INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'published', 'scheduled', 'failed')),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id TEXT NOT NULL,
  name TEXT NOT NULL,
  goal TEXT,
  description TEXT,
  platforms TEXT[],
  content_types TEXT[],
  target_audience TEXT,
  strategy JSONB,
  content_calendar JSONB,
  kpis JSONB,
  status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'paused', 'completed')),
  start_date DATE,
  end_date DATE,
  total_reach INTEGER DEFAULT 0,
  total_engagement INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  roi REAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_publications_brand ON content_publications(brand_id);
CREATE INDEX idx_content_publications_status ON content_publications(status);
CREATE INDEX idx_content_publications_campaign ON content_publications(campaign_id);
CREATE INDEX idx_campaigns_brand ON campaigns(brand_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);

ALTER TABLE content_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on content_publications" ON content_publications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on campaigns" ON campaigns FOR ALL USING (true) WITH CHECK (true);
