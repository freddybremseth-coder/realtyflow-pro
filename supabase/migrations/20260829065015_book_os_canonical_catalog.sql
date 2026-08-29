-- RealtyFlow Book OS phase 2: one non-destructive canonical catalogue.
-- Existing source rows remain authoritative inputs until a human-approved
-- reconciliation explicitly links or merges them.

create table if not exists public.publishing_catalog_works (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null default 'freddy_publishing',
  work_key text not null,
  canonical_title text not null,
  series_name text,
  series_number integer,
  status text not null default 'needs_review'
    check (status in ('needs_review', 'active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, work_key)
);

create table if not exists public.publishing_catalog_editions (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.publishing_catalog_works(id) on delete cascade,
  edition_key text not null unique,
  title text not null,
  subtitle text,
  language text not null default 'en',
  format text not null default 'ebook'
    check (format in ('ebook', 'paperback', 'hardcover', 'audio', 'other')),
  status text not null default 'needs_review'
    check (status in ('needs_review', 'in_production', 'ready', 'published', 'retired')),
  canonical_project_id uuid references public.publishing_book_projects(id) on delete set null,
  canonical_book_id uuid references public.publishing_books(id) on delete set null,
  canonical_website_title_id uuid references public.book_titles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists publishing_catalog_editions_work_idx
  on public.publishing_catalog_editions (work_id, language, format);

create table if not exists public.publishing_catalog_revisions (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.publishing_catalog_editions(id) on delete cascade,
  project_id uuid references public.publishing_book_projects(id) on delete set null,
  revision_key text not null unique,
  revision_number integer not null default 1 check (revision_number > 0),
  status text not null default 'draft'
    check (status in ('draft', 'review', 'approved', 'superseded', 'withdrawn')),
  is_canonical boolean not null default false,
  manuscript_updated_at timestamptz,
  content_fingerprint text,
  approved_at timestamptz,
  approved_by text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, revision_number)
);

create unique index if not exists publishing_catalog_one_canonical_revision
  on public.publishing_catalog_revisions (edition_id)
  where is_canonical;

create table if not exists public.publishing_catalog_assets (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.publishing_catalog_editions(id) on delete cascade,
  revision_id uuid references public.publishing_catalog_revisions(id) on delete set null,
  asset_type text not null
    check (asset_type in ('source', 'manuscript_docx', 'epub', 'pdf', 'cover', 'sample', 'metadata', 'package_zip')),
  storage_bucket text,
  storage_path text,
  external_url text,
  fingerprint text,
  version integer not null default 1 check (version > 0),
  status text not null default 'candidate'
    check (status in ('candidate', 'verified', 'retired')),
  is_canonical boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(storage_path, external_url) >= 1)
);

create unique index if not exists publishing_catalog_one_canonical_asset
  on public.publishing_catalog_assets (edition_id, asset_type)
  where is_canonical and status <> 'retired';

create table if not exists public.publishing_catalog_identifiers (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.publishing_catalog_editions(id) on delete cascade,
  scheme text not null
    check (scheme in ('isbn_10', 'isbn_13', 'asin', 'apple_id', 'google_id', 'kobo_id', 'internal')),
  marketplace text not null default '',
  value text not null,
  verified boolean not null default false,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, scheme, marketplace),
  unique (scheme, marketplace, value)
);

create table if not exists public.publishing_catalog_source_links (
  id uuid primary key default gen_random_uuid(),
  source_type text not null
    check (source_type in ('book_title', 'book_growth_work', 'publishing_book', 'publishing_book_project')),
  source_id text not null,
  entity_type text not null check (entity_type in ('work', 'edition', 'revision')),
  entity_id uuid not null,
  relation_type text not null default 'canonical'
    check (relation_type in ('canonical', 'member', 'derived', 'legacy')),
  verified boolean not null default false,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id, entity_type)
);

create index if not exists publishing_catalog_source_links_entity_idx
  on public.publishing_catalog_source_links (entity_type, entity_id);

create table if not exists public.publishing_catalog_reconciliation_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_key text not null unique,
  candidate_type text not null check (candidate_type in ('merge_works', 'link_source')),
  source_work_id uuid references public.publishing_catalog_works(id) on delete cascade,
  target_work_id uuid references public.publishing_catalog_works(id) on delete cascade,
  confidence numeric check (confidence between 0 and 1),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'applied', 'failed')),
  evidence jsonb not null default '{}'::jsonb,
  approved_by text,
  approved_at timestamptz,
  applied_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_work_id is null or target_work_id is null or source_work_id <> target_work_id)
);

create table if not exists public.publishing_catalog_merge_log (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.publishing_catalog_reconciliation_candidates(id) on delete restrict,
  source_work_id uuid not null,
  target_work_id uuid not null,
  moved_editions integer not null default 0,
  applied_by text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.publishing_book_projects
  add column if not exists catalog_work_id uuid references public.publishing_catalog_works(id) on delete set null,
  add column if not exists catalog_edition_id uuid references public.publishing_catalog_editions(id) on delete set null;

alter table public.publishing_books
  add column if not exists catalog_edition_id uuid references public.publishing_catalog_editions(id) on delete set null;

alter table public.book_titles
  add column if not exists catalog_edition_id uuid references public.publishing_catalog_editions(id) on delete set null;

alter table public.publishing_distribution_publications
  add column if not exists edition_id uuid references public.publishing_catalog_editions(id) on delete restrict,
  add column if not exists revision_id uuid references public.publishing_catalog_revisions(id) on delete restrict;

create index if not exists publishing_book_projects_catalog_work_idx on public.publishing_book_projects (catalog_work_id);
create index if not exists publishing_book_projects_catalog_edition_idx on public.publishing_book_projects (catalog_edition_id);
create index if not exists publishing_books_catalog_edition_idx on public.publishing_books (catalog_edition_id);
create index if not exists book_titles_catalog_edition_idx on public.book_titles (catalog_edition_id);
create index if not exists publishing_distribution_publications_edition_idx on public.publishing_distribution_publications (edition_id);

-- Seed the canonical work layer from the already verified website work map.
insert into public.publishing_catalog_works (id, brand_id, work_key, canonical_title, series_number, status, metadata, created_at, updated_at)
select id, 'freddy_publishing', 'growth:' || work_key, canonical_title, canonical_series_number,
       case when status = 'verified' then 'active' else 'needs_review' end,
       metadata || jsonb_build_object('legacy_growth_work_id', id), created_at, updated_at
from public.book_growth_works
on conflict do nothing;

insert into public.publishing_catalog_source_links
  (source_type, source_id, entity_type, entity_id, relation_type, verified, evidence)
select 'book_growth_work', id::text, 'work', id, 'legacy', status = 'verified', jsonb_build_object('work_key', work_key)
from public.book_growth_works
on conflict do nothing;

-- Website titles without an existing work receive an isolated needs-review work.
insert into public.publishing_catalog_works (id, work_key, canonical_title, status, metadata)
select md5('book-title-work:' || t.id::text)::uuid, 'website:' || t.slug, t.title, 'needs_review',
       jsonb_build_object('source', 'book_titles', 'source_id', t.id)
from public.book_titles t
left join public.book_growth_work_members m on m.book_id = t.id
where m.work_id is null
on conflict do nothing;

insert into public.publishing_catalog_editions
  (id, work_id, edition_key, title, subtitle, language, format, status, canonical_website_title_id, metadata)
select md5('book-title-edition:' || t.id::text)::uuid,
       coalesce(m.work_id, md5('book-title-work:' || t.id::text)::uuid),
       'website:' || t.id::text, t.title,
       coalesce(t.subtitle->>t.language, t.subtitle->>'en', t.subtitle->>'no'),
       coalesce(nullif(t.language, ''), 'en'), 'ebook',
       case when t.status in ('published', 'active') then 'published' else 'needs_review' end,
       t.id, jsonb_build_object('source', 'book_titles')
from public.book_titles t
left join public.book_growth_work_members m on m.book_id = t.id
on conflict do nothing;

insert into public.publishing_catalog_source_links
  (source_type, source_id, entity_type, entity_id, relation_type, verified, evidence)
select 'book_title', t.id::text, 'work', e.work_id, 'member', coalesce(m.verified, false),
       jsonb_build_object('legacy_member_id', m.id)
from public.book_titles t
join public.publishing_catalog_editions e on e.canonical_website_title_id = t.id
left join public.book_growth_work_members m on m.book_id = t.id
on conflict do nothing;

insert into public.publishing_catalog_source_links
  (source_type, source_id, entity_type, entity_id, relation_type, verified, evidence)
select 'book_title', t.id::text, 'edition', e.id, 'canonical', true, '{}'::jsonb
from public.book_titles t
join public.publishing_catalog_editions e on e.canonical_website_title_id = t.id
on conflict do nothing;

update public.book_titles t set catalog_edition_id = e.id
from public.publishing_catalog_editions e
where e.canonical_website_title_id = t.id and t.catalog_edition_id is distinct from e.id;

-- A root manuscript and its explicit child translations/revisions share a work.
insert into public.publishing_catalog_works (id, work_key, canonical_title, series_name, status, metadata)
select distinct on (coalesce(p.parent_project_id, p.id))
       md5('project-work:' || coalesce(p.parent_project_id, p.id)::text)::uuid,
       'project:' || coalesce(p.parent_project_id, p.id)::text,
       coalesce(root.title, p.title), coalesce(root.series_name, p.series_name),
       'needs_review', jsonb_build_object('source', 'publishing_book_projects')
from public.publishing_book_projects p
left join public.publishing_book_projects root on root.id = p.parent_project_id
order by coalesce(p.parent_project_id, p.id), p.created_at
on conflict do nothing;

insert into public.publishing_catalog_editions
  (id, work_id, edition_key, title, subtitle, language, format, status, canonical_project_id, metadata)
select md5('project-edition:' || p.id::text)::uuid,
       md5('project-work:' || coalesce(p.parent_project_id, p.id)::text)::uuid,
       'project:' || p.id::text, p.title, p.subtitle, coalesce(nullif(p.language, ''), 'en'), 'ebook',
       case when p.status = 'ready_for_export' then 'ready' else 'in_production' end,
       p.id, jsonb_build_object('source', 'publishing_book_projects')
from public.publishing_book_projects p
on conflict do nothing;

insert into public.publishing_catalog_revisions
  (id, edition_id, project_id, revision_key, revision_number, status, is_canonical, manuscript_updated_at, approved_at, approved_by, metadata)
select md5('project-revision:' || p.id::text)::uuid, e.id, p.id, 'project:' || p.id::text || ':1', 1,
       case when p.metadata_plan->'publication_approval'->>'status' = 'approved'
              and p.metadata_plan->'publication_approval'->>'approved_revision_at' = p.updated_at::text
            then 'approved' else 'draft' end,
       true, p.updated_at,
       nullif(p.metadata_plan->'publication_approval'->>'approved_at', '')::timestamptz,
       p.metadata_plan->'publication_approval'->>'approved_by',
       jsonb_build_object('source_status', p.status)
from public.publishing_book_projects p
join public.publishing_catalog_editions e on e.canonical_project_id = p.id
on conflict do nothing;

insert into public.publishing_catalog_source_links
  (source_type, source_id, entity_type, entity_id, relation_type, verified, evidence)
select 'publishing_book_project', p.id::text, 'work', e.work_id, 'member', true, '{}'::jsonb
from public.publishing_book_projects p join public.publishing_catalog_editions e on e.canonical_project_id = p.id
on conflict do nothing;

insert into public.publishing_catalog_source_links
  (source_type, source_id, entity_type, entity_id, relation_type, verified, evidence)
select 'publishing_book_project', p.id::text, 'edition', e.id, 'canonical', true, '{}'::jsonb
from public.publishing_book_projects p join public.publishing_catalog_editions e on e.canonical_project_id = p.id
on conflict do nothing;

insert into public.publishing_catalog_source_links
  (source_type, source_id, entity_type, entity_id, relation_type, verified, evidence)
select 'publishing_book_project', p.id::text, 'revision', r.id, 'canonical', true, '{}'::jsonb
from public.publishing_book_projects p join public.publishing_catalog_revisions r on r.project_id = p.id
on conflict do nothing;

update public.publishing_book_projects p
set catalog_work_id = e.work_id, catalog_edition_id = e.id
from public.publishing_catalog_editions e
where e.canonical_project_id = p.id
  and (p.catalog_work_id is distinct from e.work_id or p.catalog_edition_id is distinct from e.id);

-- Published/growth book rows become editions under their linked project work,
-- or isolated needs-review works when no explicit project link exists.
insert into public.publishing_catalog_works (id, work_key, canonical_title, series_name, status, metadata)
select md5('publishing-book-work:' || b.id::text)::uuid, 'publishing-book:' || b.id::text,
       b.title, b.series_name, 'needs_review', jsonb_build_object('source', 'publishing_books')
from public.publishing_books b
where b.source_project_id is null
on conflict do nothing;

insert into public.publishing_catalog_editions
  (id, work_id, edition_key, title, subtitle, language, format, status, canonical_book_id, metadata)
select md5('publishing-book-edition:' || b.id::text)::uuid,
       coalesce(p.catalog_work_id, md5('publishing-book-work:' || b.id::text)::uuid),
       'publishing-book:' || b.id::text, b.title, b.subtitle, coalesce(nullif(b.language, ''), 'en'),
       case when b.format in ('paperback', 'hardcover', 'audio') then b.format
            when b.format in ('kindle', 'epub', 'lead_magnet') then 'ebook' else 'other' end,
       case when b.published_at is not null or nullif(trim(b.asin), '') is not null then 'published' else 'needs_review' end,
       b.id, jsonb_build_object('source', 'publishing_books', 'marketplace', b.marketplace)
from public.publishing_books b
left join public.publishing_book_projects p on p.id = b.source_project_id
on conflict do nothing;

insert into public.publishing_catalog_source_links
  (source_type, source_id, entity_type, entity_id, relation_type, verified, evidence)
select 'publishing_book', b.id::text, 'work', e.work_id, 'member', b.source_project_id is not null,
       jsonb_build_object('source_project_id', b.source_project_id)
from public.publishing_books b join public.publishing_catalog_editions e on e.canonical_book_id = b.id
on conflict do nothing;

insert into public.publishing_catalog_source_links
  (source_type, source_id, entity_type, entity_id, relation_type, verified, evidence)
select 'publishing_book', b.id::text, 'edition', e.id, 'canonical', true, '{}'::jsonb
from public.publishing_books b join public.publishing_catalog_editions e on e.canonical_book_id = b.id
on conflict do nothing;

update public.publishing_books b set catalog_edition_id = e.id
from public.publishing_catalog_editions e
where e.canonical_book_id = b.id and b.catalog_edition_id is distinct from e.id;

-- Carry known assets forward as candidates; never silently replace a canonical file.
insert into public.publishing_catalog_assets
  (id, edition_id, asset_type, storage_path, external_url, status, is_canonical, metadata)
select md5('asset:book-title:epub:' || t.id::text)::uuid, t.catalog_edition_id, 'epub', t.ebook_file_path, null,
       'verified', true, jsonb_build_object('source', 'book_titles')
from public.book_titles t where t.catalog_edition_id is not null and nullif(trim(t.ebook_file_path), '') is not null
on conflict do nothing;

insert into public.publishing_catalog_assets
  (id, edition_id, asset_type, storage_path, external_url, status, is_canonical, metadata)
select md5('asset:book-title:cover:' || t.id::text)::uuid, t.catalog_edition_id, 'cover', null, t.cover_image_url,
       'verified', true, jsonb_build_object('source', 'book_titles')
from public.book_titles t where t.catalog_edition_id is not null and nullif(trim(t.cover_image_url), '') is not null
on conflict do nothing;

insert into public.publishing_catalog_assets
  (id, edition_id, asset_type, storage_path, external_url, status, is_canonical, metadata)
select md5('asset:publishing-book:epub:' || b.id::text)::uuid, b.catalog_edition_id, 'epub', b.epub_path, null,
       'candidate', false, jsonb_build_object('source', 'publishing_books')
from public.publishing_books b where b.catalog_edition_id is not null and nullif(trim(b.epub_path), '') is not null
on conflict do nothing;

insert into public.publishing_catalog_assets
  (id, edition_id, asset_type, storage_path, external_url, status, is_canonical, metadata)
select md5('asset:publishing-book:cover:' || b.id::text)::uuid, b.catalog_edition_id, 'cover', null, b.cover_url,
       'candidate', false, jsonb_build_object('source', 'publishing_books')
from public.publishing_books b where b.catalog_edition_id is not null and nullif(trim(b.cover_url), '') is not null
on conflict do nothing;

insert into public.publishing_catalog_identifiers
  (id, edition_id, scheme, marketplace, value, verified, source)
select md5('identifier:publishing-book:asin:' || b.id::text)::uuid, b.catalog_edition_id, 'asin', coalesce(b.marketplace, ''), upper(trim(b.asin)), true, 'publishing_books'
from public.publishing_books b where b.catalog_edition_id is not null and nullif(trim(b.asin), '') is not null
on conflict do nothing;

insert into public.publishing_catalog_identifiers
  (id, edition_id, scheme, marketplace, value, verified, source)
select md5('identifier:publishing-book:isbn:' || b.id::text)::uuid, b.catalog_edition_id,
       case when length(regexp_replace(b.isbn, '[^0-9Xx]', '', 'g')) = 10 then 'isbn_10' else 'isbn_13' end,
       '', upper(regexp_replace(b.isbn, '[^0-9Xx]', '', 'g')), true, 'publishing_books'
from public.publishing_books b where b.catalog_edition_id is not null and nullif(trim(b.isbn), '') is not null
on conflict do nothing;

insert into public.publishing_catalog_identifiers
  (id, edition_id, scheme, marketplace, value, verified, source)
select md5('identifier:book-title:isbn:' || t.id::text)::uuid, t.catalog_edition_id,
       case when length(regexp_replace(t.isbn, '[^0-9Xx]', '', 'g')) = 10 then 'isbn_10' else 'isbn_13' end,
       '', upper(regexp_replace(t.isbn, '[^0-9Xx]', '', 'g')), true, 'book_titles'
from public.book_titles t where t.catalog_edition_id is not null and nullif(trim(t.isbn), '') is not null
on conflict do nothing;

-- Link existing channel publications to the exact edition/revision used.
update public.publishing_distribution_publications d
set edition_id = p.catalog_edition_id,
    revision_id = r.id
from public.publishing_book_projects p
left join public.publishing_catalog_revisions r on r.project_id = p.id and r.is_canonical
where d.project_id = p.id
  and (d.edition_id is distinct from p.catalog_edition_id or d.revision_id is distinct from r.id);

-- Exact title matches are suggestions only. Human approval is required before merge.
insert into public.publishing_catalog_reconciliation_candidates
  (candidate_key, candidate_type, source_work_id, target_work_id, confidence, evidence)
select 'exact-title:' || least(a.id::text, b.id::text) || ':' || greatest(a.id::text, b.id::text),
       'merge_works', greatest(a.id, b.id), least(a.id, b.id), 0.95,
       jsonb_build_object('reason', 'exact_normalized_title', 'title', a.canonical_title)
from public.publishing_catalog_works a
join public.publishing_catalog_works b on a.id < b.id
where regexp_replace(lower(a.canonical_title), '[^a-z0-9]+', '', 'g') <> ''
  and regexp_replace(lower(a.canonical_title), '[^a-z0-9]+', '', 'g')
      = regexp_replace(lower(b.canonical_title), '[^a-z0-9]+', '', 'g')
on conflict do nothing;

create or replace function public.publishing_catalog_apply_merge_candidate(
  candidate_id uuid,
  actor text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.publishing_catalog_reconciliation_candidates%rowtype;
  moved integer := 0;
begin
  select * into candidate
  from public.publishing_catalog_reconciliation_candidates
  where id = candidate_id
  for update;

  if candidate.id is null then
    raise exception 'catalog merge candidate not found';
  end if;
  if candidate.status <> 'approved' or candidate.candidate_type <> 'merge_works' then
    raise exception 'catalog merge candidate must be approved before apply';
  end if;
  if candidate.source_work_id is null or candidate.target_work_id is null then
    raise exception 'catalog merge candidate is incomplete';
  end if;

  update public.publishing_catalog_editions
  set work_id = candidate.target_work_id, updated_at = now()
  where work_id = candidate.source_work_id;
  get diagnostics moved = row_count;

  update public.publishing_catalog_source_links
  set entity_id = candidate.target_work_id, updated_at = now()
  where entity_type = 'work' and entity_id = candidate.source_work_id;

  update public.publishing_book_projects
  set catalog_work_id = candidate.target_work_id
  where catalog_work_id = candidate.source_work_id;

  update public.publishing_catalog_works
  set status = 'archived',
      metadata = metadata || jsonb_build_object('merged_into', candidate.target_work_id, 'merged_at', now()),
      updated_at = now()
  where id = candidate.source_work_id;

  update public.publishing_catalog_reconciliation_candidates
  set status = 'applied', applied_at = now(), updated_at = now(),
      result = jsonb_build_object('moved_editions', moved, 'target_work_id', candidate.target_work_id)
  where id = candidate.id;

  insert into public.publishing_catalog_merge_log
    (candidate_id, source_work_id, target_work_id, moved_editions, applied_by, evidence)
  values (candidate.id, candidate.source_work_id, candidate.target_work_id, moved, actor, candidate.evidence);

  return jsonb_build_object('candidate_id', candidate.id, 'moved_editions', moved, 'target_work_id', candidate.target_work_id);
end;
$$;

revoke all on function public.publishing_catalog_apply_merge_candidate(uuid, text) from public, anon, authenticated;
grant execute on function public.publishing_catalog_apply_merge_candidate(uuid, text) to service_role;

do $$
declare
  table_name text;
  tables constant text[] := array[
    'publishing_catalog_works', 'publishing_catalog_editions', 'publishing_catalog_revisions',
    'publishing_catalog_assets', 'publishing_catalog_identifiers', 'publishing_catalog_source_links',
    'publishing_catalog_reconciliation_candidates', 'publishing_catalog_merge_log'
  ];
begin
  foreach table_name in array tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    execute format('drop policy if exists %I on public.%I', 'Deny direct API access to canonical Book OS data', table_name);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',
      'Deny direct API access to canonical Book OS data', table_name
    );
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'publishing_catalog_works', 'publishing_catalog_editions', 'publishing_catalog_revisions',
    'publishing_catalog_assets', 'publishing_catalog_identifiers', 'publishing_catalog_source_links',
    'publishing_catalog_reconciliation_candidates'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.book_set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
  end loop;
end $$;

comment on table public.publishing_catalog_works is 'Canonical intellectual works; never an edition, file, or channel listing.';
comment on table public.publishing_catalog_editions is 'Language and format editions belonging to one canonical work.';
comment on table public.publishing_catalog_revisions is 'Immutable production milestones for an edition; one selected canonical revision.';
comment on table public.publishing_catalog_assets is 'Versioned edition/revision assets with explicit canonical selection.';
comment on table public.publishing_catalog_identifiers is 'Verified ISBN, ASIN, retailer and internal identifiers attached to editions.';
comment on table public.publishing_catalog_source_links is 'Traceable links from legacy/source tables into the canonical catalogue.';

notify pgrst, 'reload schema';
