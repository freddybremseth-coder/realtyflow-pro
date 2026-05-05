-- ============================================================================
-- Publishing Books
-- Book Growth Dashboard foundation for KDP/Amazon and owned publishing funnels.
-- ============================================================================

CREATE TABLE IF NOT EXISTS publishing_books (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id TEXT NOT NULL DEFAULT 'freddypublishing',
  title TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  asin TEXT,
  format TEXT DEFAULT 'kindle' CHECK (format IN ('kindle', 'paperback', 'hardcover', 'audio', 'lead_magnet', 'other')),
  marketplace TEXT DEFAULT 'amazon.com',
  amazon_url TEXT,
  niche TEXT DEFAULT 'olive_oil_mediterranean',
  series_name TEXT DEFAULT '',
  role TEXT DEFAULT 'support' CHECK (role IN ('front_product', 'support', 'next_launch', 'lead_magnet', 'parked')),
  status TEXT DEFAULT 'audit' CHECK (status IN ('audit', 'optimize', 'launch', 'active', 'paused', 'parked')),
  price NUMERIC(10,2),
  currency TEXT DEFAULT 'USD',
  reviews_count INTEGER DEFAULT 0,
  average_rating NUMERIC(3,2),
  best_sellers_rank INTEGER,
  main_category TEXT DEFAULT '',
  keywords TEXT[] DEFAULT '{}',
  ad_spend NUMERIC(10,2) DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  orders INTEGER DEFAULT 0,
  royalties NUMERIC(10,2) DEFAULT 0,
  acos NUMERIC(6,2),
  next_action TEXT DEFAULT '',
  priority INTEGER DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
  notes TEXT DEFAULT '',
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_publishing_books_asin_marketplace
  ON publishing_books(asin, marketplace)
  WHERE asin IS NOT NULL AND asin <> '';

CREATE INDEX IF NOT EXISTS idx_publishing_books_brand ON publishing_books(brand_id);
CREATE INDEX IF NOT EXISTS idx_publishing_books_status ON publishing_books(status);
CREATE INDEX IF NOT EXISTS idx_publishing_books_role ON publishing_books(role);
CREATE INDEX IF NOT EXISTS idx_publishing_books_priority ON publishing_books(priority DESC);

ALTER TABLE publishing_books ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on publishing_books') THEN
    CREATE POLICY "Allow all on publishing_books" ON publishing_books FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
