alter table public.portal_users
  add column if not exists previous_login_at timestamptz;

create table if not exists public.portal_favorites (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  brand_id text not null default 'zeneco',
  source text not null default 'website',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, property_id)
);

create index if not exists idx_portal_favorites_contact
  on public.portal_favorites(contact_id, created_at desc);
create index if not exists idx_portal_favorites_property
  on public.portal_favorites(property_id);

alter table public.portal_favorites enable row level security;
drop policy if exists "Deny direct API access to portal favorites" on public.portal_favorites;
create policy "Deny direct API access to portal favorites"
  on public.portal_favorites for all to authenticated, anon
  using (false) with check (false);

create table if not exists public.portal_saved_searches (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  brand_id text not null default 'zeneco',
  name text not null default 'Mitt boligsøk',
  criteria jsonb not null default '{}'::jsonb,
  alerts_enabled boolean not null default true,
  last_checked_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, brand_id)
);

create index if not exists idx_portal_saved_searches_alerts
  on public.portal_saved_searches(brand_id, alerts_enabled, last_checked_at);

alter table public.portal_saved_searches enable row level security;
drop policy if exists "Deny direct API access to portal saved searches" on public.portal_saved_searches;
create policy "Deny direct API access to portal saved searches"
  on public.portal_saved_searches for all to authenticated, anon
  using (false) with check (false);
