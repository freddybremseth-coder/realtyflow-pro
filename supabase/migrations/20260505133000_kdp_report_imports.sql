-- ============================================================================
-- KDP Report Imports
-- Import history for CSV/TSV reports downloaded from Amazon KDP Reports.
-- ============================================================================

CREATE TABLE IF NOT EXISTS kdp_report_imports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,
  rows_total INTEGER DEFAULT 0,
  rows_imported INTEGER DEFAULT 0,
  books_touched INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  total_royalties NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  summary JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kdp_report_imports_created ON kdp_report_imports(created_at DESC);

ALTER TABLE kdp_report_imports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on kdp_report_imports') THEN
    CREATE POLICY "Allow all on kdp_report_imports" ON kdp_report_imports FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
