CREATE TABLE IF NOT EXISTS public.publishing_market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL DEFAULT 'freddypublishing',
  source TEXT NOT NULL DEFAULT 'amazon_search',
  query TEXT NOT NULL,
  marketplace TEXT NOT NULL DEFAULT 'amazon.com',
  total_results_estimate INTEGER,
  top_results JSONB NOT NULL DEFAULT '[]',
  summary JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_publishing_market_snapshots_created
  ON public.publishing_market_snapshots (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_publishing_market_snapshots_query_created
  ON public.publishing_market_snapshots (query, created_at DESC);

ALTER TABLE public.publishing_market_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'publishing_market_snapshots'
      AND policyname = 'Allow all on publishing_market_snapshots'
  ) THEN
    CREATE POLICY "Allow all on publishing_market_snapshots"
      ON public.publishing_market_snapshots
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
