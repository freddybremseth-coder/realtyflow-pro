-- Persistent pronunciation dictionary for Voice Studio.
-- Rules are tenant scoped and can optionally be limited to a brand and language.

create table if not exists public.media_voice_pronunciations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.tenants(id) on delete cascade,
  brand_id text,
  language text not null default 'Norwegian',
  term text not null,
  pronunciation text not null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, brand_id, language, term)
);

create index if not exists media_voice_pronunciations_lookup_idx
  on public.media_voice_pronunciations (organization_id, brand_id, language, active);

create trigger media_voice_pronunciations_touch_updated_at
before update on public.media_voice_pronunciations
for each row execute function public.media_studio_touch_updated_at();

alter table public.media_voice_pronunciations enable row level security;

create policy media_voice_pronunciations_select
on public.media_voice_pronunciations
for select
using (public.media_studio_can_access(organization_id));

create policy media_voice_pronunciations_insert
on public.media_voice_pronunciations
for insert
with check (public.media_studio_can_access(organization_id));

create policy media_voice_pronunciations_update
on public.media_voice_pronunciations
for update
using (public.media_studio_can_access(organization_id))
with check (public.media_studio_can_access(organization_id));

create policy media_voice_pronunciations_delete
on public.media_voice_pronunciations
for delete
using (public.media_studio_can_access(organization_id));

grant select, insert, update, delete on public.media_voice_pronunciations to authenticated, service_role;

-- Seed the known Doña Anna pronunciation for the default RealtyFlow tenant.
insert into public.media_voice_pronunciations (
  organization_id,
  brand_id,
  language,
  term,
  pronunciation,
  notes
)
select id, 'donaanna', 'Norwegian', 'Doña Anna', 'Donja Anna', 'Brand pronunciation'
from core.tenants
where slug = 'realtyflow'
on conflict (organization_id, brand_id, language, term) do update
set pronunciation = excluded.pronunciation,
    notes = excluded.notes,
    active = true,
    updated_at = now();

insert into public.media_voice_pronunciations (
  organization_id,
  brand_id,
  language,
  term,
  pronunciation,
  notes
)
select id, 'donaanna', 'Norwegian', 'Dona Anna', 'Donja Anna', 'ASCII spelling fallback'
from core.tenants
where slug = 'realtyflow'
on conflict (organization_id, brand_id, language, term) do update
set pronunciation = excluded.pronunciation,
    notes = excluded.notes,
    active = true,
    updated_at = now();
