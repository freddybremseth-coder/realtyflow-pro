-- ─── Direct PDF book sales on freddybremseth.com ────────────────────────────
--
-- Books are sold as PDF downloads straight from the website (no Amazon):
-- 5 EUR per book, 50 EUR for unlimited downloads of everything. Payment
-- via the shared Stripe pipeline; delivery via signed URLs from a PRIVATE
-- storage bucket, unlocked by a purchase grant token.

-- 1. Where the PDF lives (path inside the private book-pdfs bucket).
alter table publishing_books
  add column if not exists pdf_path text;

comment on column publishing_books.pdf_path is
  'Storage path in the private book-pdfs bucket. Books with a path are sold as direct PDF downloads on freddybremseth.com.';

-- 2. Private storage bucket for the PDFs.
insert into storage.buckets (id, name, public)
values ('book-pdfs', 'book-pdfs', false)
on conflict (id) do nothing;

-- 3. Purchase grants: what a paid Stripe session unlocks.
create table if not exists book_download_grants (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  email text,
  scope text not null default 'single' check (scope in ('single', 'all')),
  book_id uuid references publishing_books(id) on delete set null,
  stripe_session_id text unique,
  download_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_downloaded_at timestamptz
);

comment on table book_download_grants is
  'One row per PDF purchase. scope=single unlocks one book, scope=all unlocks every book (50 EUR unlimited). The token goes into the customer''s download link and never expires.';

alter table book_download_grants enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'book_download_grants' and policyname = 'Allow all'
  ) then
    create policy "Allow all" on book_download_grants for all using (true) with check (true);
  end if;
end $$;
