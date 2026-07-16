-- ─── AI Forfatterstudio ──────────────────────────────────────────────────────
--
-- Forfatterstudioet jobber på publishing_book_projects som manuskript-beholder.
-- To nye koblinger:
--   - source_book_id: prosjektet er manuskriptet til en utgitt bok
--     (publishing_books) som er hentet inn for forbedring/reutgivelse.
--   - parent_project_id: prosjektet er en språkutgave (oversettelse) av et
--     annet prosjekt.

alter table public.publishing_book_projects
  add column if not exists source_book_id uuid references public.publishing_books(id) on delete set null,
  add column if not exists parent_project_id uuid references public.publishing_book_projects(id) on delete set null;

create index if not exists idx_publishing_book_projects_source_book
  on public.publishing_book_projects (source_book_id);

create index if not exists idx_publishing_book_projects_parent
  on public.publishing_book_projects (parent_project_id);

comment on column public.publishing_book_projects.source_book_id is
  'Utgitt bok (publishing_books) dette prosjektet er manuskript for — satt når boken hentes inn i Forfatterstudioet.';

comment on column public.publishing_book_projects.parent_project_id is
  'Prosjektet dette er en språkutgave (oversettelse) av.';
