alter table public.content_publications add column if not exists marketing_publication_id text;
alter table public.content_publications add column if not exists marketing_content_id text;

create unique index if not exists content_publications_marketing_publication_id_uidx
  on public.content_publications(marketing_publication_id)
  where marketing_publication_id is not null;

create index if not exists content_publications_marketing_content_id_idx
  on public.content_publications(marketing_content_id)
  where marketing_content_id is not null;
