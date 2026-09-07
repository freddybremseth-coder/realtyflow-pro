-- Norwegian feed editorial enrichment for imported properties.
-- Additive only: raw source facts are preserved separately from generated copy.

alter table public.properties
  add column if not exists source_description text,
  add column if not exists floor_label text,
  add column if not exists orientation_source text,
  add column if not exists editorial_no jsonb,
  add column if not exists editorial_no_approved boolean not null default false;

comment on column public.properties.source_description is
  'Full source/feed description used as factual input for editorial generation. Never overwritten by AI.';
comment on column public.properties.floor_label is
  'Floor/level exactly as supplied by the property source when available.';
comment on column public.properties.orientation_source is
  'Orientation exactly as supplied by the property source when available.';
comment on column public.properties.editorial_no is
  'Stable Norwegian editorial JSON: headline_no, intro_no, bullets_no, orientation_no, source_hash, generated_at and model.';
comment on column public.properties.editorial_no_approved is
  'Manual approval gate for editorial content that is classified as requiring Freddy review (level A).';

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
