-- Brand-specific editorial curation. Staff never gain global access to properties.
create table if not exists public.property_brand_curations (
  property_id uuid not null references public.properties(id) on delete cascade,
  brand_key text not null check (brand_key in ('zeneco','pinosoecolife')),
  recommended boolean not null default false,
  editor_description text,
  expected_completion_manual text,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (property_id, brand_key),
  constraint property_brand_curations_description_limit check (length(coalesce(editor_description,'')) <= 8000),
  constraint property_brand_curations_completion_limit check (length(coalesce(expected_completion_manual,'')) <= 200)
);
alter table public.property_brand_curations enable row level security;
revoke all on public.property_brand_curations from anon, authenticated;
create index if not exists property_brand_curations_featured on public.property_brand_curations (brand_key, recommended, updated_at desc);
