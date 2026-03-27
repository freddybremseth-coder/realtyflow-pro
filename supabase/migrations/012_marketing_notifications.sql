-- ============================================================================
-- 012_marketing_notifications.sql
-- Proactive AI marketing notifications for stale properties
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketing_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id TEXT NOT NULL,
  property_title TEXT,
  days_listed INTEGER,
  views INTEGER DEFAULT 0,
  urgency TEXT CHECK (urgency IN ('low', 'medium', 'high')),
  diagnosis TEXT,
  action_plan JSONB DEFAULT '[]',
  new_headline TEXT,
  price_suggestion TEXT,
  recommended_campaign_type TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  actioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_marketing_notifications_status ON marketing_notifications(status);
CREATE INDEX idx_marketing_notifications_property ON marketing_notifications(property_id);
CREATE INDEX idx_marketing_notifications_urgency ON marketing_notifications(urgency);

-- RLS
ALTER TABLE marketing_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on marketing_notifications" ON marketing_notifications FOR ALL USING (true) WITH CHECK (true);
