-- Norwegian feed editorial enrichment for imported properties.
-- Raw source facts are preserved separately from generated copy.

alter table public.properties
  add column if not exists source_description text,
  add column if not exists floor_label text,
  add column if not exists orientation_source text,
  add column if not exists amenities_no text[],
  add column if not exists editorial_no jsonb,
  add column if not exists editorial_no_approved boolean not null default false;

comment on column public.properties.source_description is
  'Full source/feed description used as factual input for editorial generation. Never overwritten by AI.';
comment on column public.properties.floor_label is
  'Floor/level exactly as supplied by the property source when available.';
comment on column public.properties.orientation_source is
  'Orientation exactly as supplied by the property source when available.';
comment on column public.properties.amenities_no is
  'Norwegian/source-supported property features used as factual editorial input.';
comment on column public.properties.editorial_no is
  'Stable Norwegian editorial JSON: headline_no, intro_no, bullets_no, orientation_no, source_hash, generated_at and model.';
comment on column public.properties.editorial_no_approved is
  'Manual approval gate for editorial content that is classified as requiring Freddy review (level A).';

-- Repeated feed imports must update the same property row so approvals,
-- visibility rules, shortlist links and analytics keep their stable UUID.
-- PostgreSQL UNIQUE permits NULL, so manually created rows without a ref remain valid.
create unique index if not exists idx_properties_ref_unique
  on public.properties (ref);

-- Preserve the best source text currently available for existing imported rows.
update public.properties
set source_description = description
where source_description is null
  and coalesce(source, '') in ('redsp', 'xml', 'csv')
  and nullif(btrim(coalesce(description, '')), '') is not null;

create or replace function public.preserve_property_feed_source()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if coalesce(new.source, '') not in ('redsp', 'xml', 'csv') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if nullif(btrim(coalesce(new.source_description, '')), '') is null then
      new.source_description := new.description;
    end if;
  elsif new.source_description is null then
    -- Never replace a previously preserved full source description with the
    -- client's shortened display description. A fresh full source value, when
    -- available, is attached by the import cache before the upsert.
    new.source_description := coalesce(old.source_description, new.description);
  end if;

  return new;
end;
$function$;

revoke all on function public.preserve_property_feed_source() from public;

drop trigger if exists properties_preserve_feed_source on public.properties;
create trigger properties_preserve_feed_source
before insert or update of description, source_description, source
on public.properties
for each row
execute function public.preserve_property_feed_source();

-- Durable short-lived bridge between the XML proxy and the chunked property
-- POST requests. This avoids losing the full feed description when the browser
-- intentionally keeps only a shortened display description.
create table if not exists public.property_feed_source_cache (
  ref text primary key,
  source_description text,
  amenities_no text[] not null default '{}',
  floor_label text,
  orientation_source text,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_property_feed_source_cache_expires
  on public.property_feed_source_cache (expires_at);

comment on table public.property_feed_source_cache is
  'Service-only short-lived raw XML facts keyed by property ref for chunked feed imports.';

alter table public.property_feed_source_cache enable row level security;
revoke all on table public.property_feed_source_cache from anon, authenticated;

create table if not exists public.property_editorial_jobs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'retry', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id)
);

create index if not exists idx_property_editorial_jobs_ready
  on public.property_editorial_jobs (status, available_at);

comment on table public.property_editorial_jobs is
  'Service-only queue for import-time Norwegian property editorial enrichment with retry.';

alter table public.property_editorial_jobs enable row level security;
revoke all on table public.property_editorial_jobs from anon, authenticated;

create or replace function public.queue_property_editorial_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  -- Only feed-imported rows belong to the automatic level-B editorial flow.
  if coalesce(new.source, '') not in ('redsp', 'xml', 'csv') then
    return new;
  end if;

  insert into public.property_editorial_jobs (
    property_id,
    status,
    attempts,
    available_at,
    last_error,
    updated_at
  ) values (
    new.id,
    'queued',
    0,
    now(),
    null,
    now()
  )
  on conflict (property_id) do update
  set status = 'queued',
      attempts = 0,
      available_at = now(),
      last_error = null,
      updated_at = now();

  return new;
end;
$function$;

revoke all on function public.queue_property_editorial_job() from public;

-- Queue work when factual feed fields are inserted or changed. The worker only
-- writes title_no/description_no/editorial_no, so its own writes cannot loop
-- back into this trigger.
drop trigger if exists properties_queue_editorial_job on public.properties;
create trigger properties_queue_editorial_job
after insert or update of
  source_description,
  description,
  property_type,
  bedrooms,
  bathrooms,
  location,
  built_area,
  floor_label,
  amenities_no,
  energy_rating,
  price,
  orientation_source,
  pool,
  garage
on public.properties
for each row
execute function public.queue_property_editorial_job();
