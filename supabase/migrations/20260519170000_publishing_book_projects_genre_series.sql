ALTER TABLE public.publishing_book_projects
  ADD COLUMN IF NOT EXISTS genre TEXT,
  ADD COLUMN IF NOT EXISTS series_name TEXT;

CREATE INDEX IF NOT EXISTS idx_publishing_book_projects_series_name
  ON public.publishing_book_projects (series_name);
