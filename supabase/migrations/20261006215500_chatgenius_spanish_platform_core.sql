-- ChatGenius Spanish on RealtyFlow Platform Core
-- Adds Spanish as a sellable app while keeping learning data isolated and server-only.

create schema if not exists chatgenius;
create schema if not exists chatgenius_private;

revoke all on schema chatgenius from public, anon, authenticated;
grant usage on schema chatgenius to service_role;
revoke all on schema chatgenius_private from public, anon, authenticated;
grant usage on schema chatgenius_private to service_role;

create table if not exists chatgenius.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source_lang text not null default 'no' check (source_lang in ('no','en','de','ru')),
  cefr_level text not null default 'A1' check (cefr_level in ('A1','A2','B1','B2','C1','C2')),
  daily_goal_xp integer not null default 50 check (daily_goal_xp between 1 and 10000),
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chatgenius.learning_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table chatgenius.user_settings enable row level security;
alter table chatgenius.learning_state enable row level security;

revoke all on chatgenius.user_settings, chatgenius.learning_state from public, anon, authenticated;
grant select, insert, update, delete on chatgenius.user_settings, chatgenius.learning_state to service_role;

drop policy if exists chatgenius_user_settings_deny_browser on chatgenius.user_settings;
create policy chatgenius_user_settings_deny_browser
  on chatgenius.user_settings for all
  to anon, authenticated
  using (false) with check (false);

drop policy if exists chatgenius_learning_state_deny_browser on chatgenius.learning_state;
create policy chatgenius_learning_state_deny_browser
  on chatgenius.learning_state for all
  to anon, authenticated
  using (false) with check (false);

create table if not exists core.app_invitations (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references core.apps(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  access_kind text not null default 'manual'
    check (access_kind in ('manual','family','partner','promo','lifetime')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','claimed','revoked')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index if not exists core_app_invitations_app_email_idx
  on core.app_invitations (app_id, lower(email), status, created_at desc);
create index if not exists core_app_invitations_created_by_idx
  on core.app_invitations (created_by) where created_by is not null;
create index if not exists core_app_invitations_claimed_by_idx
  on core.app_invitations (claimed_by) where claimed_by is not null;

alter table core.app_invitations enable row level security;
revoke all on core.app_invitations from public, anon, authenticated;
grant select, insert, update, delete on core.app_invitations to service_role;

drop policy if exists core_app_invitations_deny_browser on core.app_invitations;
create policy core_app_invitations_deny_browser
  on core.app_invitations for all
  to anon, authenticated
  using (false) with check (false);

insert into core.apps (
  slug, name, description, product_type, status, domain, icon, is_sellable, sort_order, metadata
)
values (
  'spanish',
  'Spanish ChatGenius',
  'AI-støttet spansklæring med progresjon, samtaletrening og personlig læringsflyt.',
  'standalone',
  'active',
  'spanish.chatgenius.pro',
  'Languages',
  true,
  25,
  '{"brand":"chatgenius","category":"education","consumer_app":true}'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  product_type = excluded.product_type,
  status = excluded.status,
  domain = excluded.domain,
  icon = excluded.icon,
  is_sellable = excluded.is_sellable,
  sort_order = excluded.sort_order,
  metadata = core.apps.metadata || excluded.metadata,
  updated_at = now();

insert into core.modules (
  slug, name, description, category, module_type, status, version, icon, is_core, sort_order, metadata
)
values (
  'language-learning',
  'Language Learning',
  'Leksjoner, ordforråd, samtaletrening, repetisjon, CEFR og læringsprogresjon.',
  'vertical',
  'vertical',
  'active',
  '1.0',
  'Languages',
  false,
  115,
  '{"brand":"chatgenius","app":"spanish"}'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  module_type = excluded.module_type,
  status = excluded.status,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  metadata = core.modules.metadata || excluded.metadata,
  updated_at = now();

insert into core.app_modules (app_id, module_id, enabled_by_default, configurable, settings)
select a.id, m.id, true, false, '{}'::jsonb
from core.apps a
join core.modules m on m.slug in (
  'platform-core','language-learning','payments-subscriptions','analytics','communications'
)
where a.slug='spanish'
on conflict (app_id,module_id) do update set enabled_by_default=true;

insert into core.plans (
  app_id, slug, name, description, status, currency,
  monthly_price_minor, yearly_price_minor, trial_days, is_public, metadata
)
select
  a.id, 'premium', 'Spanish Premium',
  'Full tilgang til Spanish ChatGenius.',
  'active', 'EUR', 799, 7191, 7, true,
  '{"luna_included":false,"ai_server_managed":true}'::jsonb
from core.apps a
where a.slug='spanish'
on conflict (app_id,slug) do update set
  name=excluded.name,
  description=excluded.description,
  status=excluded.status,
  currency=excluded.currency,
  monthly_price_minor=excluded.monthly_price_minor,
  yearly_price_minor=excluded.yearly_price_minor,
  trial_days=excluded.trial_days,
  is_public=excluded.is_public,
  metadata=core.plans.metadata || excluded.metadata,
  updated_at=now();

insert into core.plan_modules (plan_id, module_id, enabled, limits)
select p.id, m.id, true,
  case when m.slug='language-learning'
    then '{"ai_tasks":"plan_controlled","luna_live":false}'::jsonb
    else '{}'::jsonb
  end
from core.plans p
join core.apps a on a.id=p.app_id and a.slug='spanish'
join core.modules m on m.slug in (
  'platform-core','language-learning','payments-subscriptions','analytics','communications'
)
where p.slug='premium'
on conflict (plan_id,module_id) do update set
  enabled=true,
  limits=excluded.limits;

insert into public.saas_apps (
  slug, name, domain, description, category, tech_stack, status,
  pricing_model, price_monthly, price_yearly, currency,
  repo_url, live_url, dev_platform, version
)
values (
  'spanish',
  'Spanish ChatGenius',
  'spanish.chatgenius.pro',
  'AI-støttet spansklæring under ChatGenius.',
  'education',
  array['react','supabase','vercel','gemini'],
  'live',
  'subscription',
  7.99,
  71.91,
  'EUR',
  'https://github.com/freddybremseth-coder/Cyberlingo',
  'https://spanish.chatgenius.pro',
  'chatgenius',
  '3.0'
)
on conflict (slug) do update set
  name=excluded.name,
  domain=excluded.domain,
  description=excluded.description,
  category=excluded.category,
  tech_stack=excluded.tech_stack,
  status=excluded.status,
  pricing_model=excluded.pricing_model,
  price_monthly=excluded.price_monthly,
  price_yearly=excluded.price_yearly,
  currency=excluded.currency,
  repo_url=excluded.repo_url,
  live_url=excluded.live_url,
  dev_platform=excluded.dev_platform,
  version=excluded.version,
  updated_at=now();
