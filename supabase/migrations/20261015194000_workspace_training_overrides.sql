-- Versioned-by-upsert training content overrides; packaged guides are never deleted or rewritten.
-- Only the owner admin endpoint can write to this table. Team members see only their
-- active brand through the independently verified workspace capabilities endpoint.
create table if not exists public.workspace_training_overrides (
  brand_key text not null check (brand_key in ('zeneco','pinosoecolife')),
  article_id text not null check (article_id ~ '^[a-z][a-z0-9-]{1,79}$'),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (brand_key, article_id)
);
create index if not exists workspace_training_overrides_brand_idx on public.workspace_training_overrides(brand_key);
alter table public.workspace_training_overrides enable row level security;
revoke all on public.workspace_training_overrides from public, anon, authenticated;
grant select, insert, update, delete on public.workspace_training_overrides to service_role;
comment on table public.workspace_training_overrides is
  'Owner-controlled, brand-specific staff onboarding guide content. Original shipped training remains available as fallback.';
