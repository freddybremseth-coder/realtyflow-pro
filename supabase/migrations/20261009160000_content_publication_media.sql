-- Multi-image support for Content Hub. Existing ai_image_url remains the
-- single-image compatibility source; no existing publication is rewritten.
alter table public.content_publications
  add column if not exists visual_format text not null default 'single_image'
  check (visual_format in ('single_image','collage','carousel'));
alter table public.content_publications
  add column if not exists media_revision integer not null default 0;

create table if not exists public.content_publication_media (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.content_publications(id) on delete cascade,
  position integer not null check (position >= 0 and position < 10),
  media_type text not null default 'image' check (media_type = 'image'),
  source_url text not null check (length(source_url) > 0),
  thumbnail_url text,
  source_kind text not null default 'library'
    check (source_kind in ('property','openart','library','upload','website')),
  overlay_text text,
  alt_text text,
  processing_status text not null default 'ready'
    check (processing_status in ('pending','ready','failed')),
  created_at timestamptz not null default now(),
  unique (publication_id,position)
);
create index if not exists content_publication_media_publication_idx
 on public.content_publication_media(publication_id,position);
alter table public.content_publication_media enable row level security;
-- No public grants/policies: access only via existing authenticated server API.
