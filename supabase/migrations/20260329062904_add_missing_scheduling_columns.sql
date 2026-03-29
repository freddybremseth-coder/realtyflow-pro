ALTER TABLE content_publications
  ADD COLUMN IF NOT EXISTS scheduled_platforms TEXT[],
  ADD COLUMN IF NOT EXISTS publish_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_publish_error TEXT,
  ADD COLUMN IF NOT EXISTS engagement JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_recommended_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_timing_reasoning TEXT;

CREATE INDEX IF NOT EXISTS idx_content_pub_scheduled ON content_publications(scheduled_at) WHERE status = 'scheduled';

CREATE TABLE IF NOT EXISTS engagement_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID REFERENCES content_publications(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,
  post_id TEXT,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  raw_data JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS scheduling_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL,
  platform VARCHAR(20) NOT NULL,
  day_of_week INTEGER,
  hour_utc INTEGER,
  avg_engagement_rate NUMERIC(6,4) DEFAULT 0,
  avg_reach INTEGER DEFAULT 0,
  sample_size INTEGER DEFAULT 0,
  best_hashtags TEXT[],
  best_content_types TEXT[],
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_insights_unique ON scheduling_insights(brand_id, platform, day_of_week, hour_utc);
