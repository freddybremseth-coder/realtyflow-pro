CREATE TABLE IF NOT EXISTS public.publishing_book_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL DEFAULT 'freddypublishing',
  title TEXT NOT NULL,
  subtitle TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  niche TEXT,
  audience TEXT,
  positioning TEXT,
  target_words INTEGER,
  target_pages INTEGER,
  seed_keywords TEXT[] DEFAULT '{}',
  model_hint TEXT DEFAULT 'seo+author',
  status TEXT NOT NULL DEFAULT 'draft',
  metadata_plan JSONB NOT NULL DEFAULT '{}',
  outline_plan JSONB NOT NULL DEFAULT '{}',
  chapter_drafts JSONB NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_publishing_book_projects_brand_created
  ON public.publishing_book_projects (brand_id, created_at DESC);

ALTER TABLE public.publishing_book_projects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'publishing_book_projects'
      AND policyname = 'Allow all on publishing_book_projects'
  ) THEN
    CREATE POLICY "Allow all on publishing_book_projects"
      ON public.publishing_book_projects
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
