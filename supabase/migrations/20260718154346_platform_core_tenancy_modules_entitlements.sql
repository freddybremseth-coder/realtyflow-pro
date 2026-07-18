-- RealtyFlow Platform Core v1
--
-- Evolves the existing core tenant/app foundation into a sellable modular
-- platform without moving or duplicating existing brand data. Tenant-owned
-- data remains protected by RLS; all administration RPCs are server-only.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Existing tenant, membership and app records gain the fields required for
-- customer onboarding and commercial packaging. These changes are additive.
-- ---------------------------------------------------------------------------

alter table core.tenants
  add column if not exists customer_type text not null default 'internal',
  add column if not exists contact_email text,
  add column if not exists default_locale text not null default 'nb-NO',
  add column if not exists default_currency text not null default 'EUR',
  add column if not exists timezone text not null default 'Europe/Madrid',
  add column if not exists data_region text not null default 'eu',
  add column if not exists created_by_email text,
  add column if not exists updated_by_email text;

alter table core.tenants
  drop constraint if exists core_tenants_customer_type_check,
  add constraint core_tenants_customer_type_check
    check (customer_type in ('internal', 'customer', 'partner', 'reseller')),
  drop constraint if exists core_tenants_default_currency_check,
  add constraint core_tenants_default_currency_check
    check (default_currency ~ '^[A-Z]{3}$');

alter table core.tenant_memberships
  alter column user_id drop not null,
  add column if not exists user_email text,
  add column if not exists status text not null default 'active',
  add column if not exists invited_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update core.tenant_memberships tm
set user_email = lower(u.email)
from auth.users u
where tm.user_id = u.id
  and tm.user_email is null;

alter table core.tenant_memberships
  drop constraint if exists core_tenant_memberships_identity_check,
  add constraint core_tenant_memberships_identity_check
    check (user_id is not null or nullif(btrim(user_email), '') is not null),
  drop constraint if exists core_tenant_memberships_status_check,
  add constraint core_tenant_memberships_status_check
    check (status in ('invited', 'active', 'suspended', 'revoked'));

create unique index if not exists core_tenant_memberships_email_key
  on core.tenant_memberships (tenant_id, lower(user_email))
  where user_email is not null;
create index if not exists core_tenant_memberships_user_status_idx
  on core.tenant_memberships (user_id, status)
  where user_id is not null;
create index if not exists core_profiles_default_tenant_idx
  on core.profiles (default_tenant_id)
  where default_tenant_id is not null;
create index if not exists core_tenant_apps_app_idx on core.tenant_apps (app_id);
create index if not exists core_brands_tenant_idx on core.brands (tenant_id);

alter table core.apps
  add column if not exists product_type text not null default 'suite',
  add column if not exists status text not null default 'active',
  add column if not exists domain text,
  add column if not exists icon text,
  add column if not exists is_sellable boolean not null default false,
  add column if not exists sort_order integer not null default 100,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table core.apps
  drop constraint if exists core_apps_product_type_check,
  add constraint core_apps_product_type_check
    check (product_type in ('suite', 'standalone', 'vertical', 'integration')),
  drop constraint if exists core_apps_status_check,
  add constraint core_apps_status_check
    check (status in ('draft', 'active', 'paused', 'retired'));

alter table core.tenant_apps
  add column if not exists status text not null default 'active',
  add column if not exists source text not null default 'legacy',
  add column if not exists starts_at timestamptz not null default now(),
  add column if not exists ends_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table core.tenant_apps
  drop constraint if exists core_tenant_apps_status_check,
  add constraint core_tenant_apps_status_check
    check (status in ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
  drop constraint if exists core_tenant_apps_source_check,
  add constraint core_tenant_apps_source_check
    check (source in ('legacy', 'manual', 'plan', 'stripe', 'partner'));

-- ---------------------------------------------------------------------------
-- Commercial module catalog and package composition.
-- ---------------------------------------------------------------------------

create table core.modules (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null,
  description text,
  category text not null default 'business',
  module_type text not null default 'business',
  status text not null default 'active',
  version text not null default '1.0',
  icon text,
  route_prefix text,
  is_core boolean not null default false,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint core_modules_category_check
    check (category in ('platform', 'sales', 'finance', 'operations', 'content', 'marketing', 'vertical', 'infrastructure')),
  constraint core_modules_type_check
    check (module_type in ('platform', 'business', 'vertical', 'integration')),
  constraint core_modules_status_check
    check (status in ('draft', 'active', 'paused', 'retired'))
);

create table core.module_dependencies (
  module_id uuid not null references core.modules(id) on delete cascade,
  depends_on_module_id uuid not null references core.modules(id) on delete restrict,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (module_id, depends_on_module_id),
  constraint core_module_dependencies_not_self check (module_id <> depends_on_module_id)
);
create index core_module_dependencies_dependency_idx
  on core.module_dependencies (depends_on_module_id);

create table core.app_modules (
  app_id uuid not null references core.apps(id) on delete cascade,
  module_id uuid not null references core.modules(id) on delete restrict,
  enabled_by_default boolean not null default false,
  configurable boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (app_id, module_id)
);
create index core_app_modules_module_idx on core.app_modules (module_id);

create table core.plans (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references core.apps(id) on delete cascade,
  slug text not null check (slug = lower(slug) and slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null,
  description text,
  status text not null default 'draft',
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  monthly_price_minor bigint check (monthly_price_minor is null or monthly_price_minor >= 0),
  yearly_price_minor bigint check (yearly_price_minor is null or yearly_price_minor >= 0),
  trial_days integer not null default 0 check (trial_days between 0 and 365),
  is_public boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, slug),
  constraint core_plans_status_check check (status in ('draft', 'active', 'archived'))
);
create index core_plans_status_idx on core.plans (status, is_public);

create table core.plan_modules (
  plan_id uuid not null references core.plans(id) on delete cascade,
  module_id uuid not null references core.modules(id) on delete restrict,
  enabled boolean not null default true,
  limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (plan_id, module_id)
);
create index core_plan_modules_module_idx on core.plan_modules (module_id);

-- ---------------------------------------------------------------------------
-- Tenant subscriptions, module access and fine-grained entitlements.
-- ---------------------------------------------------------------------------

create table core.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  app_id uuid not null references core.apps(id) on delete restrict,
  plan_id uuid references core.plans(id) on delete set null,
  status text not null default 'active',
  provider text not null default 'manual',
  external_customer_id text,
  external_subscription_id text,
  trial_ends_at timestamptz,
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, app_id),
  constraint core_tenant_subscriptions_status_check
    check (status in ('trialing', 'active', 'past_due', 'suspended', 'cancelled', 'expired')),
  constraint core_tenant_subscriptions_provider_check
    check (provider in ('manual', 'stripe', 'partner', 'legacy'))
);
create index core_tenant_subscriptions_app_idx on core.tenant_subscriptions (app_id);
create index core_tenant_subscriptions_plan_idx on core.tenant_subscriptions (plan_id);
create index core_tenant_subscriptions_status_idx on core.tenant_subscriptions (status);
create unique index core_tenant_subscriptions_external_key
  on core.tenant_subscriptions (provider, external_subscription_id)
  where external_subscription_id is not null;

create table core.tenant_modules (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  module_id uuid not null references core.modules(id) on delete restrict,
  plan_id uuid references core.plans(id) on delete set null,
  status text not null default 'active',
  source text not null default 'manual',
  settings jsonb not null default '{}'::jsonb,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, module_id),
  constraint core_tenant_modules_status_check
    check (status in ('trialing', 'active', 'disabled', 'suspended', 'expired')),
  constraint core_tenant_modules_source_check
    check (source in ('legacy', 'manual', 'plan', 'partner')),
  constraint core_tenant_modules_dates_check check (ends_at is null or ends_at > starts_at)
);
create index core_tenant_modules_module_idx on core.tenant_modules (module_id);
create index core_tenant_modules_plan_idx on core.tenant_modules (plan_id);
create index core_tenant_modules_status_idx on core.tenant_modules (tenant_id, status);

create table core.tenant_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  module_id uuid references core.modules(id) on delete cascade,
  entitlement_key text not null check (entitlement_key ~ '^[a-z0-9][a-z0-9._-]{1,126}$'),
  value jsonb not null default 'true'::jsonb,
  status text not null default 'active',
  source text not null default 'manual',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, entitlement_key),
  constraint core_tenant_entitlements_status_check check (status in ('active', 'revoked', 'expired')),
  constraint core_tenant_entitlements_source_check check (source in ('module', 'plan', 'manual', 'partner')),
  constraint core_tenant_entitlements_dates_check check (ends_at is null or ends_at > starts_at)
);
create index core_tenant_entitlements_module_idx on core.tenant_entitlements (module_id);
create index core_tenant_entitlements_active_idx
  on core.tenant_entitlements (tenant_id, entitlement_key)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- White-label identity, domains and links to legal invoicing entities.
-- ---------------------------------------------------------------------------

create table core.tenant_branding (
  tenant_id uuid primary key references core.tenants(id) on delete cascade,
  app_name text,
  logo_url text,
  favicon_url text,
  primary_color text not null default '#06b6d4',
  accent_color text not null default '#8b5cf6',
  support_email text,
  email_from_name text,
  locale text,
  custom_css text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint core_tenant_branding_primary_color_check check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint core_tenant_branding_accent_color_check check (accent_color ~ '^#[0-9A-Fa-f]{6}$')
);

create table core.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  app_id uuid references core.apps(id) on delete cascade,
  hostname text not null unique check (hostname = lower(hostname) and hostname ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'),
  domain_type text not null default 'custom',
  status text not null default 'pending',
  is_primary boolean not null default false,
  verification_token text not null default encode(gen_random_bytes(18), 'hex'),
  verification_details jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint core_tenant_domains_type_check check (domain_type in ('subdomain', 'custom')),
  constraint core_tenant_domains_status_check check (status in ('pending', 'verified', 'active', 'failed', 'disabled'))
);
create index core_tenant_domains_tenant_idx on core.tenant_domains (tenant_id);
create index core_tenant_domains_app_idx on core.tenant_domains (app_id);
create unique index core_tenant_domains_primary_key
  on core.tenant_domains (tenant_id, app_id)
  where is_primary;

create table core.tenant_billing_organizations (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  billing_organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  relationship text not null default 'operator',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (tenant_id, billing_organization_id),
  constraint core_tenant_billing_organizations_relationship_check
    check (relationship in ('owner', 'operator', 'seller', 'buyer'))
);
create index core_tenant_billing_organizations_organization_idx
  on core.tenant_billing_organizations (billing_organization_id);
create unique index core_tenant_billing_organizations_default_key
  on core.tenant_billing_organizations (tenant_id)
  where is_default;

-- ---------------------------------------------------------------------------
-- Append-only metering and administrative audit log.
-- ---------------------------------------------------------------------------

create table core.tenant_usage_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  module_id uuid references core.modules(id) on delete set null,
  meter_key text not null check (meter_key ~ '^[a-z0-9][a-z0-9._-]{1,126}$'),
  quantity numeric(20,6) not null default 1 check (quantity > 0),
  idempotency_key text not null unique,
  dimensions jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index core_tenant_usage_events_tenant_meter_idx
  on core.tenant_usage_events (tenant_id, meter_key, occurred_at desc);
create index core_tenant_usage_events_module_idx on core.tenant_usage_events (module_id);

create table core.platform_audit_events (
  id bigint generated always as identity primary key,
  tenant_id uuid references core.tenants(id) on delete set null,
  actor_email text not null,
  action text not null,
  resource_type text not null,
  resource_id text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index core_platform_audit_events_tenant_idx
  on core.platform_audit_events (tenant_id, created_at desc);
create index core_platform_audit_events_action_idx
  on core.platform_audit_events (action, created_at desc);

create or replace function core.prevent_platform_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Platform usage and audit events are append-only';
end;
$$;

create trigger trg_core_tenant_usage_events_immutable
  before update or delete on core.tenant_usage_events
  for each row execute function core.prevent_platform_event_mutation();
create trigger trg_core_platform_audit_events_immutable
  before update or delete on core.platform_audit_events
  for each row execute function core.prevent_platform_event_mutation();

-- Keep updated_at reliable on all mutable platform tables.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenants', 'tenant_memberships', 'apps', 'tenant_apps', 'modules', 'plans',
    'tenant_subscriptions', 'tenant_modules', 'tenant_entitlements',
    'tenant_branding', 'tenant_domains'
  ]
  loop
    execute format('drop trigger if exists %I on core.%I', 'trg_core_' || table_name || '_updated_at', table_name);
    execute format(
      'create trigger %I before update on core.%I for each row execute function core.touch_updated_at()',
      'trg_core_' || table_name || '_updated_at',
      table_name
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalog seed. Prices are intentionally not invented: commercial plans can
-- be added once packaging and pricing have been decided.
-- ---------------------------------------------------------------------------

insert into core.modules (
  slug, name, description, category, module_type, icon, route_prefix, is_core, sort_order
)
values
  ('platform-core', 'Platformkjerne', 'Tenant, tilgang, moduler, white-label og audit.', 'platform', 'platform', 'Boxes', '/platform', true, 10),
  ('crm', 'CRM & kunder', 'Kunder, leads, pipeline og oppfølging.', 'sales', 'business', 'Users', '/customers', false, 20),
  ('billing', 'Fakturering', 'Tilbud, faktura, kreditnota, betaling og avgift.', 'finance', 'business', 'FileText', '/billing', false, 30),
  ('commissions', 'Provisjon', 'Provisjonsgrunnlag, opptjening og avstemming.', 'finance', 'business', 'Banknote', '/commissions', false, 40),
  ('real-estate', 'Eiendom', 'Eiendommer, områder, tomter og salgsprosess.', 'vertical', 'vertical', 'Building2', '/inventory', false, 50),
  ('lead-intelligence', 'Lead Intelligence', 'AI-analyse, matching, shortlist og presentasjon.', 'sales', 'business', 'Sparkles', '/lead-intelligence', false, 60),
  ('content-studio', 'Content Studio', 'Innholdsproduksjon, publisering og medier.', 'content', 'business', 'Clapperboard', '/content-studio', false, 70),
  ('author-studio', 'Forfatterstudio', 'Bokproduksjon, metadata og publiseringsløp.', 'content', 'vertical', 'Feather', '/publishing/forfatterstudio', false, 80),
  ('automation', 'Automatisering', 'Regler, agenter, nurture og arbeidsflyt.', 'infrastructure', 'business', 'Zap', '/automation', false, 90),
  ('commerce-inventory', 'Handel & lager', 'Ordre, POS, lager, batch, landed cost og recall.', 'operations', 'vertical', 'Store', '/dona-anna', false, 100),
  ('demosites', 'DemoSites', 'Demo, publisering, salg og kundeportal for nettsider.', 'marketing', 'vertical', 'Globe', '/demosites', false, 110),
  ('payments-subscriptions', 'Betaling & abonnement', 'Checkout, abonnement og betalingsstatus.', 'finance', 'integration', 'CreditCard', null, false, 120),
  ('analytics', 'Analyse & rapportering', 'KPI, rapporter, helse og ledelsesinnsikt.', 'infrastructure', 'business', 'BarChart3', '/analytics', false, 130),
  ('communications', 'Kommunikasjon', 'E-post, meldinger og kundedialog.', 'sales', 'business', 'MessageSquareText', '/communications', false, 140),
  ('documents-contracts', 'Dokumenter & kontrakter', 'Dokumentflyt, signering og avtalegrunnlag.', 'operations', 'business', 'FolderLock', '/document-hub', false, 150),
  ('property-care', 'Property Care', 'Nøkkelhold, inspeksjoner og lokale tjenester.', 'vertical', 'vertical', 'KeyRound', '/service-revenue', false, 160),
  ('remaster-studio', 'Re-Master Studio', 'Musikkproduksjon, bibliotek og publiseringsflyt.', 'content', 'vertical', 'Music', '/neural-beat', false, 170)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  module_type = excluded.module_type,
  icon = excluded.icon,
  route_prefix = excluded.route_prefix,
  is_core = excluded.is_core,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into core.module_dependencies (module_id, depends_on_module_id, required)
select child.id, parent.id, true
from core.modules child
join core.modules parent on parent.slug = 'platform-core'
where child.slug <> 'platform-core'
on conflict (module_id, depends_on_module_id) do nothing;

update core.apps
set
  product_type = case slug
    when 'olivia' then 'vertical'
    when 'publishing' then 'vertical'
    else 'suite'
  end,
  status = 'active',
  domain = case slug
    when 'realtyflow' then 'realtyflow.chatgenius.pro'
    when 'olivia' then 'olivia.chatgenius.pro'
    when 'chatgenius' then 'chatgenius.pro'
    else domain
  end,
  icon = case slug
    when 'realtyflow' then 'Building2'
    when 'olivia' then 'Sprout'
    when 'chatgenius' then 'Bot'
    when 'publishing' then 'BookOpen'
    else icon
  end,
  sort_order = case slug
    when 'realtyflow' then 10
    when 'chatgenius' then 20
    when 'olivia' then 30
    when 'publishing' then 40
    else sort_order
  end,
  updated_at = now()
where slug in ('realtyflow', 'olivia', 'chatgenius', 'publishing');

insert into core.apps (slug, name, description, product_type, status, icon, is_sellable, sort_order)
values
  ('fakturering', 'Fakturering', 'Fakturering som selvstendig white-label SaaS.', 'standalone', 'active', 'FileText', true, 50),
  ('crm', 'CRM', 'CRM og kundeoppfølging som selvstendig white-label SaaS.', 'standalone', 'active', 'Users', true, 60),
  ('forfatterstudio', 'Forfatterstudio', 'Forfatter- og publiseringsverktøy som selvstendig SaaS.', 'vertical', 'active', 'Feather', true, 70),
  ('remaster-freddy', 'Re-Master Studio', 'Musikk- og publiseringsstudio som selvstendig SaaS.', 'vertical', 'active', 'Music', true, 80),
  ('commerce-operations', 'Commerce Operations', 'Handel, lager og sporbarhet som white-label modulapp.', 'vertical', 'active', 'Store', true, 90),
  ('demosites', 'DemoSites', 'Salg og levering av demo- og kundesider.', 'vertical', 'active', 'Globe', true, 100)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  product_type = excluded.product_type,
  status = excluded.status,
  icon = excluded.icon,
  is_sellable = excluded.is_sellable,
  sort_order = excluded.sort_order,
  updated_at = now();

with package(app_slug, module_slug, default_enabled) as (
  values
    ('realtyflow', 'platform-core', true), ('realtyflow', 'crm', true),
    ('realtyflow', 'billing', true), ('realtyflow', 'commissions', true),
    ('realtyflow', 'real-estate', true), ('realtyflow', 'lead-intelligence', true),
    ('realtyflow', 'content-studio', true), ('realtyflow', 'author-studio', true),
    ('realtyflow', 'automation', true), ('realtyflow', 'commerce-inventory', true),
    ('realtyflow', 'analytics', true), ('realtyflow', 'communications', true),
    ('realtyflow', 'documents-contracts', true), ('realtyflow', 'property-care', true),
    ('olivia', 'platform-core', true), ('olivia', 'commerce-inventory', true),
    ('olivia', 'automation', true), ('olivia', 'analytics', true),
    ('chatgenius', 'platform-core', true), ('chatgenius', 'crm', true),
    ('chatgenius', 'demosites', true), ('chatgenius', 'payments-subscriptions', true),
    ('chatgenius', 'automation', true), ('chatgenius', 'communications', true),
    ('chatgenius', 'analytics', true), ('chatgenius', 'remaster-studio', true),
    ('publishing', 'platform-core', true), ('publishing', 'author-studio', true),
    ('publishing', 'content-studio', true), ('publishing', 'payments-subscriptions', true),
    ('publishing', 'analytics', true),
    ('fakturering', 'platform-core', true), ('fakturering', 'billing', true),
    ('fakturering', 'payments-subscriptions', false), ('fakturering', 'analytics', false),
    ('crm', 'platform-core', true), ('crm', 'crm', true),
    ('crm', 'communications', true), ('crm', 'automation', false),
    ('crm', 'analytics', false),
    ('forfatterstudio', 'platform-core', true), ('forfatterstudio', 'author-studio', true),
    ('forfatterstudio', 'content-studio', true), ('forfatterstudio', 'payments-subscriptions', false),
    ('remaster-freddy', 'platform-core', true), ('remaster-freddy', 'remaster-studio', true),
    ('remaster-freddy', 'content-studio', true), ('remaster-freddy', 'analytics', false),
    ('commerce-operations', 'platform-core', true), ('commerce-operations', 'commerce-inventory', true),
    ('commerce-operations', 'billing', false), ('commerce-operations', 'analytics', false),
    ('demosites', 'platform-core', true), ('demosites', 'demosites', true),
    ('demosites', 'crm', true), ('demosites', 'payments-subscriptions', true),
    ('demosites', 'automation', false)
)
insert into core.app_modules (app_id, module_id, enabled_by_default)
select a.id, m.id, package.default_enabled
from package
join core.apps a on a.slug = package.app_slug
join core.modules m on m.slug = package.module_slug
on conflict (app_id, module_id) do update
set enabled_by_default = excluded.enabled_by_default;

-- Existing brand tenants receive the modules already implied by their app.
insert into core.tenant_apps (tenant_id, app_id, enabled, status, source, settings)
select distinct b.tenant_id, a.id, true, 'active', 'legacy', '{}'::jsonb
from core.brands b
join core.apps a on a.slug = b.app_slug
on conflict (tenant_id, app_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, status, source, settings)
select distinct b.tenant_id, am.module_id, 'active', 'legacy', '{}'::jsonb
from core.brands b
join core.apps a on a.slug = b.app_slug
join core.app_modules am on am.app_id = a.id and am.enabled_by_default
on conflict (tenant_id, module_id) do nothing;

-- ---------------------------------------------------------------------------
-- Tenant-aware RLS. Catalog data is readable; tenant data is visible only to
-- active members. Mutations remain server-side through service-role RPCs.
-- ---------------------------------------------------------------------------

create or replace function core.is_tenant_member(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from core.tenant_memberships tm
      where tm.tenant_id = target_tenant
        and tm.status = 'active'
        and (
          tm.user_id = (select auth.uid())
          or (
            tm.user_email is not null
            and lower(tm.user_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
          )
        )
    );
$$;

revoke execute on function core.is_tenant_member(uuid) from public, anon;
grant execute on function core.is_tenant_member(uuid) to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'modules', 'module_dependencies', 'app_modules', 'plans', 'plan_modules',
    'tenant_subscriptions', 'tenant_modules', 'tenant_entitlements',
    'tenant_branding', 'tenant_domains', 'tenant_billing_organizations',
    'tenant_usage_events', 'platform_audit_events'
  ]
  loop
    execute format('alter table core.%I enable row level security', table_name);
  end loop;
end;
$$;

create policy core_modules_catalog_read on core.modules
  for select to anon, authenticated using (status = 'active');
create policy core_module_dependencies_catalog_read on core.module_dependencies
  for select to anon, authenticated using (true);
create policy core_app_modules_catalog_read on core.app_modules
  for select to anon, authenticated using (true);
create policy core_plans_catalog_read on core.plans
  for select to anon, authenticated using (status = 'active' and is_public);
create policy core_plan_modules_catalog_read on core.plan_modules
  for select to anon, authenticated using (
    exists (
      select 1 from core.plans p
      where p.id = plan_id and p.status = 'active' and p.is_public
    )
  );

create policy core_tenant_subscriptions_member_read on core.tenant_subscriptions
  for select to authenticated using ((select core.is_tenant_member(tenant_id)));
create policy core_tenant_modules_member_read on core.tenant_modules
  for select to authenticated using ((select core.is_tenant_member(tenant_id)));
create policy core_tenant_entitlements_member_read on core.tenant_entitlements
  for select to authenticated using ((select core.is_tenant_member(tenant_id)));
create policy core_tenant_branding_member_read on core.tenant_branding
  for select to authenticated using ((select core.is_tenant_member(tenant_id)));
create policy core_tenant_domains_member_read on core.tenant_domains
  for select to authenticated using ((select core.is_tenant_member(tenant_id)));
create policy core_tenant_billing_organizations_member_read on core.tenant_billing_organizations
  for select to authenticated using ((select core.is_tenant_member(tenant_id)));
create policy core_tenant_usage_events_member_read on core.tenant_usage_events
  for select to authenticated using ((select core.is_tenant_member(tenant_id)));
create policy core_platform_audit_events_member_read on core.platform_audit_events
  for select to authenticated using (
    tenant_id is not null and (select core.is_tenant_member(tenant_id))
  );

drop policy if exists tenant_members_read_memberships on core.tenant_memberships;
create policy tenant_members_read_memberships on core.tenant_memberships
  for select to authenticated using ((select core.is_tenant_member(tenant_id)));

grant select on core.modules, core.module_dependencies, core.app_modules, core.plans, core.plan_modules
  to anon, authenticated, service_role;
grant select on core.tenant_subscriptions, core.tenant_modules, core.tenant_entitlements,
  core.tenant_branding, core.tenant_domains, core.tenant_billing_organizations,
  core.tenant_usage_events, core.platform_audit_events
  to authenticated, service_role;
grant insert, update, delete on core.tenants, core.tenant_memberships, core.apps, core.tenant_apps,
  core.modules, core.module_dependencies, core.app_modules, core.plans, core.plan_modules,
  core.tenant_subscriptions, core.tenant_modules, core.tenant_entitlements,
  core.tenant_branding, core.tenant_domains, core.tenant_billing_organizations
  to service_role;
grant insert on core.tenant_usage_events, core.platform_audit_events to service_role;
grant usage, select on sequence core.tenant_usage_events_id_seq,
  core.platform_audit_events_id_seq to service_role;
revoke insert, update, delete on core.modules, core.module_dependencies, core.app_modules,
  core.plans, core.plan_modules, core.tenant_subscriptions, core.tenant_modules,
  core.tenant_entitlements, core.tenant_branding, core.tenant_domains,
  core.tenant_billing_organizations, core.tenant_usage_events, core.platform_audit_events
  from public, anon, authenticated;
revoke update, delete on core.tenant_usage_events, core.platform_audit_events from service_role;

-- ---------------------------------------------------------------------------
-- Service-only administration RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.platform_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'generatedAt', now(),
    'summary', jsonb_build_object(
      'tenantCount', (select count(*) from core.tenants),
      'customerCount', (select count(*) from core.tenants where customer_type = 'customer'),
      'sellableAppCount', (select count(*) from core.apps where is_sellable and status = 'active'),
      'moduleCount', (select count(*) from core.modules where status = 'active'),
      'activeSubscriptionCount', (select count(*) from core.tenant_subscriptions where status in ('trialing', 'active'))
    ),
    'tenants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'slug', t.slug, 'name', t.name, 'status', t.status,
        'customerType', t.customer_type, 'plan', t.plan, 'contactEmail', t.contact_email,
        'defaultLocale', t.default_locale, 'defaultCurrency', t.default_currency,
        'timezone', t.timezone, 'dataRegion', t.data_region, 'metadata', t.metadata,
        'createdAt', t.created_at, 'updatedAt', t.updated_at
      ) order by t.name)
      from core.tenants t
    ), '[]'::jsonb),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tm.id, 'tenantId', tm.tenant_id, 'userId', tm.user_id,
        'userEmail', tm.user_email, 'role', tm.role, 'isOwner', tm.is_owner,
        'status', tm.status, 'invitedAt', tm.invited_at, 'acceptedAt', tm.accepted_at
      ) order by tm.created_at)
      from core.tenant_memberships tm
    ), '[]'::jsonb),
    'apps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'slug', a.slug, 'name', a.name, 'description', a.description,
        'productType', a.product_type, 'status', a.status, 'domain', a.domain,
        'icon', a.icon, 'isSellable', a.is_sellable, 'sortOrder', a.sort_order,
        'metadata', a.metadata
      ) order by a.sort_order, a.name)
      from core.apps a
    ), '[]'::jsonb),
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'slug', m.slug, 'name', m.name, 'description', m.description,
        'category', m.category, 'moduleType', m.module_type, 'status', m.status,
        'version', m.version, 'icon', m.icon, 'routePrefix', m.route_prefix,
        'isCore', m.is_core, 'sortOrder', m.sort_order, 'metadata', m.metadata
      ) order by m.sort_order, m.name)
      from core.modules m
    ), '[]'::jsonb),
    'appModules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appId', am.app_id, 'moduleId', am.module_id,
        'enabledByDefault', am.enabled_by_default, 'configurable', am.configurable,
        'settings', am.settings
      )) from core.app_modules am
    ), '[]'::jsonb),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'appId', p.app_id, 'slug', p.slug, 'name', p.name,
        'description', p.description, 'status', p.status, 'currency', p.currency,
        'monthlyPriceMinor', p.monthly_price_minor, 'yearlyPriceMinor', p.yearly_price_minor,
        'trialDays', p.trial_days, 'isPublic', p.is_public, 'metadata', p.metadata
      ) order by p.name) from core.plans p
    ), '[]'::jsonb),
    'planModules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'planId', pm.plan_id, 'moduleId', pm.module_id,
        'enabled', pm.enabled, 'limits', pm.limits
      )) from core.plan_modules pm
    ), '[]'::jsonb),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'tenantId', s.tenant_id, 'appId', s.app_id, 'planId', s.plan_id,
        'status', s.status, 'provider', s.provider,
        'externalCustomerId', s.external_customer_id,
        'externalSubscriptionId', s.external_subscription_id,
        'trialEndsAt', s.trial_ends_at, 'currentPeriodStartsAt', s.current_period_starts_at,
        'currentPeriodEndsAt', s.current_period_ends_at,
        'cancelAtPeriodEnd', s.cancel_at_period_end, 'metadata', s.metadata,
        'createdAt', s.created_at, 'updatedAt', s.updated_at
      ) order by s.created_at desc) from core.tenant_subscriptions s
    ), '[]'::jsonb),
    'tenantModules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tenantId', tm.tenant_id, 'moduleId', tm.module_id, 'planId', tm.plan_id,
        'status', tm.status, 'source', tm.source, 'settings', tm.settings,
        'startsAt', tm.starts_at, 'endsAt', tm.ends_at
      )) from core.tenant_modules tm
    ), '[]'::jsonb),
    'entitlements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'tenantId', e.tenant_id, 'moduleId', e.module_id,
        'entitlementKey', e.entitlement_key, 'value', e.value,
        'status', e.status, 'source', e.source,
        'startsAt', e.starts_at, 'endsAt', e.ends_at
      ) order by e.entitlement_key) from core.tenant_entitlements e
    ), '[]'::jsonb),
    'branding', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tenantId', b.tenant_id, 'appName', b.app_name, 'logoUrl', b.logo_url,
        'faviconUrl', b.favicon_url, 'primaryColor', b.primary_color,
        'accentColor', b.accent_color, 'supportEmail', b.support_email,
        'emailFromName', b.email_from_name, 'locale', b.locale,
        'customCss', b.custom_css, 'settings', b.settings
      )) from core.tenant_branding b
    ), '[]'::jsonb),
    'domains', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'tenantId', d.tenant_id, 'appId', d.app_id,
        'hostname', d.hostname, 'domainType', d.domain_type, 'status', d.status,
        'isPrimary', d.is_primary, 'verificationToken', d.verification_token,
        'verificationDetails', d.verification_details, 'verifiedAt', d.verified_at
      ) order by d.hostname) from core.tenant_domains d
    ), '[]'::jsonb),
    'usage30d', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tenantId', u.tenant_id, 'meterKey', u.meter_key,
        'quantity', u.quantity
      ))
      from (
        select tenant_id, meter_key, sum(quantity) as quantity
        from core.tenant_usage_events
        where occurred_at >= now() - interval '30 days'
        group by tenant_id, meter_key
      ) u
    ), '[]'::jsonb)
  );
$$;

create or replace function public.platform_upsert_tenant(p_payload jsonb, p_actor_email text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tenant_id_value uuid;
  previous_row jsonb;
  slug_value text := lower(btrim(coalesce(p_payload ->> 'slug', '')));
  name_value text := btrim(coalesce(p_payload ->> 'name', ''));
begin
  if nullif(btrim(p_actor_email), '') is null then raise exception 'Actor email is required'; end if;
  if slug_value !~ '^[a-z0-9][a-z0-9-]{1,62}$' then raise exception 'Invalid tenant slug'; end if;
  if name_value = '' then raise exception 'Tenant name is required'; end if;

  if nullif(p_payload ->> 'id', '') is not null then
    tenant_id_value := (p_payload ->> 'id')::uuid;
    select to_jsonb(t) into previous_row from core.tenants t where t.id = tenant_id_value;
    if previous_row is null then raise exception 'Tenant not found'; end if;
    update core.tenants set
      slug = slug_value,
      name = name_value,
      status = coalesce(nullif(p_payload ->> 'status', ''), status),
      customer_type = coalesce(nullif(p_payload ->> 'customerType', ''), customer_type),
      contact_email = nullif(lower(btrim(p_payload ->> 'contactEmail')), ''),
      default_locale = coalesce(nullif(p_payload ->> 'defaultLocale', ''), default_locale),
      default_currency = upper(coalesce(nullif(p_payload ->> 'defaultCurrency', ''), default_currency)),
      timezone = coalesce(nullif(p_payload ->> 'timezone', ''), timezone),
      data_region = coalesce(nullif(p_payload ->> 'dataRegion', ''), data_region),
      metadata = coalesce(p_payload -> 'metadata', metadata),
      updated_by_email = lower(btrim(p_actor_email))
    where id = tenant_id_value;
  else
    insert into core.tenants (
      slug, name, status, plan, customer_type, contact_email, default_locale,
      default_currency, timezone, data_region, metadata, created_by_email, updated_by_email
    ) values (
      slug_value, name_value, coalesce(nullif(p_payload ->> 'status', ''), 'active'),
      coalesce(nullif(p_payload ->> 'plan', ''), 'custom'),
      coalesce(nullif(p_payload ->> 'customerType', ''), 'customer'),
      nullif(lower(btrim(p_payload ->> 'contactEmail')), ''),
      coalesce(nullif(p_payload ->> 'defaultLocale', ''), 'nb-NO'),
      upper(coalesce(nullif(p_payload ->> 'defaultCurrency', ''), 'EUR')),
      coalesce(nullif(p_payload ->> 'timezone', ''), 'Europe/Madrid'),
      coalesce(nullif(p_payload ->> 'dataRegion', ''), 'eu'),
      coalesce(p_payload -> 'metadata', '{}'::jsonb),
      lower(btrim(p_actor_email)), lower(btrim(p_actor_email))
    ) returning id into tenant_id_value;

    insert into core.tenant_modules (tenant_id, module_id, status, source)
    select tenant_id_value, id, 'active', 'manual'
    from core.modules where slug = 'platform-core'
    on conflict (tenant_id, module_id) do nothing;
  end if;

  insert into core.platform_audit_events (
    tenant_id, actor_email, action, resource_type, resource_id, before_state, after_state
  )
  select tenant_id_value, lower(btrim(p_actor_email)),
    case when previous_row is null then 'TENANT_CREATED' else 'TENANT_UPDATED' end,
    'tenant', tenant_id_value::text, previous_row, to_jsonb(t)
  from core.tenants t where t.id = tenant_id_value;

  return tenant_id_value;
end;
$$;

create or replace function public.platform_upsert_membership(p_payload jsonb, p_actor_email text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  membership_id_value uuid;
  tenant_id_value uuid := (p_payload ->> 'tenantId')::uuid;
  email_value text := nullif(lower(btrim(p_payload ->> 'userEmail')), '');
  previous_row jsonb;
begin
  if nullif(btrim(p_actor_email), '') is null then raise exception 'Actor email is required'; end if;
  if email_value is null then raise exception 'Member email is required'; end if;
  if not exists (select 1 from core.tenants where id = tenant_id_value) then raise exception 'Tenant not found'; end if;

  select id, to_jsonb(tm) into membership_id_value, previous_row
  from core.tenant_memberships tm
  where tm.tenant_id = tenant_id_value and lower(tm.user_email) = email_value;

  if membership_id_value is null then
    insert into core.tenant_memberships (
      tenant_id, user_email, role, is_owner, status, invited_at, accepted_at
    ) values (
      tenant_id_value, email_value, coalesce(nullif(p_payload ->> 'role', ''), 'member'),
      coalesce((p_payload ->> 'isOwner')::boolean, false),
      coalesce(nullif(p_payload ->> 'status', ''), 'invited'), now(),
      case when coalesce(nullif(p_payload ->> 'status', ''), 'invited') = 'active' then now() end
    ) returning id into membership_id_value;
  else
    update core.tenant_memberships set
      role = coalesce(nullif(p_payload ->> 'role', ''), role),
      is_owner = coalesce((p_payload ->> 'isOwner')::boolean, is_owner),
      status = coalesce(nullif(p_payload ->> 'status', ''), status),
      accepted_at = case
        when coalesce(nullif(p_payload ->> 'status', ''), status) = 'active' then coalesce(accepted_at, now())
        else accepted_at
      end
    where id = membership_id_value;
  end if;

  insert into core.platform_audit_events (
    tenant_id, actor_email, action, resource_type, resource_id, before_state, after_state
  )
  select tenant_id_value, lower(btrim(p_actor_email)),
    case when previous_row is null then 'MEMBERSHIP_CREATED' else 'MEMBERSHIP_UPDATED' end,
    'tenant_membership', membership_id_value::text, previous_row, to_jsonb(tm)
  from core.tenant_memberships tm where tm.id = membership_id_value;

  return membership_id_value;
end;
$$;

create or replace function public.platform_set_tenant_module(p_payload jsonb, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tenant_id_value uuid := (p_payload ->> 'tenantId')::uuid;
  module_row core.modules%rowtype;
  status_value text := coalesce(nullif(p_payload ->> 'status', ''), 'active');
  previous_row jsonb;
  result_row jsonb;
begin
  if nullif(btrim(p_actor_email), '') is null then raise exception 'Actor email is required'; end if;
  select * into module_row from core.modules where slug = p_payload ->> 'moduleSlug';
  if module_row.id is null then raise exception 'Module not found'; end if;
  if not exists (select 1 from core.tenants where id = tenant_id_value) then raise exception 'Tenant not found'; end if;
  if module_row.is_core and status_value <> 'active' then raise exception 'Core module cannot be disabled'; end if;

  select to_jsonb(tm) into previous_row
  from core.tenant_modules tm
  where tm.tenant_id = tenant_id_value and tm.module_id = module_row.id;

  insert into core.tenant_modules (
    tenant_id, module_id, status, source, settings, starts_at, ends_at
  ) values (
    tenant_id_value, module_row.id, status_value,
    coalesce(nullif(p_payload ->> 'source', ''), 'manual'),
    coalesce(p_payload -> 'settings', '{}'::jsonb), now(),
    case when nullif(p_payload ->> 'endsAt', '') is not null then (p_payload ->> 'endsAt')::timestamptz end
  )
  on conflict (tenant_id, module_id) do update set
    status = excluded.status,
    source = excluded.source,
    settings = excluded.settings,
    ends_at = excluded.ends_at
  returning to_jsonb(core.tenant_modules.*) into result_row;

  insert into core.platform_audit_events (
    tenant_id, actor_email, action, resource_type, resource_id, before_state, after_state
  ) values (
    tenant_id_value, lower(btrim(p_actor_email)), 'TENANT_MODULE_SET',
    'tenant_module', module_row.id::text, previous_row, result_row
  );

  return result_row;
end;
$$;

create or replace function public.platform_set_entitlement(p_payload jsonb, p_actor_email text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tenant_id_value uuid := (p_payload ->> 'tenantId')::uuid;
  module_id_value uuid;
  entitlement_id_value uuid;
  previous_row jsonb;
begin
  if nullif(btrim(p_actor_email), '') is null then raise exception 'Actor email is required'; end if;
  if coalesce(p_payload ->> 'entitlementKey', '') !~ '^[a-z0-9][a-z0-9._-]{1,126}$' then
    raise exception 'Invalid entitlement key';
  end if;
  if not exists (select 1 from core.tenants where id = tenant_id_value) then raise exception 'Tenant not found'; end if;
  if nullif(p_payload ->> 'moduleSlug', '') is not null then
    select id into module_id_value from core.modules where slug = p_payload ->> 'moduleSlug';
    if module_id_value is null then raise exception 'Module not found'; end if;
  end if;

  select to_jsonb(e) into previous_row
  from core.tenant_entitlements e
  where e.tenant_id = tenant_id_value and e.entitlement_key = p_payload ->> 'entitlementKey';

  insert into core.tenant_entitlements (
    tenant_id, module_id, entitlement_key, value, status, source, starts_at, ends_at
  ) values (
    tenant_id_value, module_id_value, p_payload ->> 'entitlementKey',
    coalesce(p_payload -> 'value', 'true'::jsonb),
    coalesce(nullif(p_payload ->> 'status', ''), 'active'),
    coalesce(nullif(p_payload ->> 'source', ''), 'manual'), now(),
    case when nullif(p_payload ->> 'endsAt', '') is not null then (p_payload ->> 'endsAt')::timestamptz end
  )
  on conflict (tenant_id, entitlement_key) do update set
    module_id = excluded.module_id,
    value = excluded.value,
    status = excluded.status,
    source = excluded.source,
    ends_at = excluded.ends_at
  returning id into entitlement_id_value;

  insert into core.platform_audit_events (
    tenant_id, actor_email, action, resource_type, resource_id, before_state, after_state
  )
  select tenant_id_value, lower(btrim(p_actor_email)), 'ENTITLEMENT_SET',
    'tenant_entitlement', entitlement_id_value::text, previous_row, to_jsonb(e)
  from core.tenant_entitlements e where e.id = entitlement_id_value;

  return entitlement_id_value;
end;
$$;

create or replace function public.platform_upsert_branding(p_payload jsonb, p_actor_email text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tenant_id_value uuid := (p_payload ->> 'tenantId')::uuid;
  previous_row jsonb;
begin
  if nullif(btrim(p_actor_email), '') is null then raise exception 'Actor email is required'; end if;
  if not exists (select 1 from core.tenants where id = tenant_id_value) then raise exception 'Tenant not found'; end if;
  select to_jsonb(b) into previous_row from core.tenant_branding b where b.tenant_id = tenant_id_value;

  insert into core.tenant_branding (
    tenant_id, app_name, logo_url, favicon_url, primary_color, accent_color,
    support_email, email_from_name, locale, custom_css, settings
  ) values (
    tenant_id_value, nullif(btrim(p_payload ->> 'appName'), ''),
    nullif(btrim(p_payload ->> 'logoUrl'), ''), nullif(btrim(p_payload ->> 'faviconUrl'), ''),
    coalesce(nullif(p_payload ->> 'primaryColor', ''), '#06b6d4'),
    coalesce(nullif(p_payload ->> 'accentColor', ''), '#8b5cf6'),
    nullif(lower(btrim(p_payload ->> 'supportEmail')), ''),
    nullif(btrim(p_payload ->> 'emailFromName'), ''), nullif(p_payload ->> 'locale', ''),
    nullif(p_payload ->> 'customCss', ''), coalesce(p_payload -> 'settings', '{}'::jsonb)
  )
  on conflict (tenant_id) do update set
    app_name = excluded.app_name,
    logo_url = excluded.logo_url,
    favicon_url = excluded.favicon_url,
    primary_color = excluded.primary_color,
    accent_color = excluded.accent_color,
    support_email = excluded.support_email,
    email_from_name = excluded.email_from_name,
    locale = excluded.locale,
    custom_css = excluded.custom_css,
    settings = excluded.settings;

  insert into core.platform_audit_events (
    tenant_id, actor_email, action, resource_type, resource_id, before_state, after_state
  )
  select tenant_id_value, lower(btrim(p_actor_email)), 'BRANDING_UPDATED',
    'tenant_branding', tenant_id_value::text, previous_row, to_jsonb(b)
  from core.tenant_branding b where b.tenant_id = tenant_id_value;

  return tenant_id_value;
end;
$$;

create or replace function public.platform_upsert_domain(p_payload jsonb, p_actor_email text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  domain_id_value uuid;
  tenant_id_value uuid := (p_payload ->> 'tenantId')::uuid;
  app_id_value uuid;
  hostname_value text := lower(btrim(coalesce(p_payload ->> 'hostname', '')));
  previous_row jsonb;
begin
  if nullif(btrim(p_actor_email), '') is null then raise exception 'Actor email is required'; end if;
  if hostname_value !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$' then
    raise exception 'Invalid hostname';
  end if;
  if not exists (select 1 from core.tenants where id = tenant_id_value) then raise exception 'Tenant not found'; end if;
  if nullif(p_payload ->> 'appSlug', '') is not null then
    select id into app_id_value from core.apps where slug = p_payload ->> 'appSlug';
    if app_id_value is null then raise exception 'App not found'; end if;
  end if;

  select id, to_jsonb(d) into domain_id_value, previous_row
  from core.tenant_domains d where d.hostname = hostname_value;
  if domain_id_value is not null and (previous_row ->> 'tenant_id')::uuid <> tenant_id_value then
    raise exception 'Hostname already belongs to another tenant';
  end if;

  if coalesce((p_payload ->> 'isPrimary')::boolean, false) then
    update core.tenant_domains set is_primary = false
    where tenant_id = tenant_id_value and app_id is not distinct from app_id_value;
  end if;

  insert into core.tenant_domains (
    tenant_id, app_id, hostname, domain_type, status, is_primary, verification_details, verified_at
  ) values (
    tenant_id_value, app_id_value, hostname_value,
    coalesce(nullif(p_payload ->> 'domainType', ''), 'custom'),
    coalesce(nullif(p_payload ->> 'status', ''), 'pending'),
    coalesce((p_payload ->> 'isPrimary')::boolean, false),
    coalesce(p_payload -> 'verificationDetails', '{}'::jsonb),
    case when p_payload ->> 'status' in ('verified', 'active') then now() end
  )
  on conflict (hostname) do update set
    app_id = excluded.app_id,
    domain_type = excluded.domain_type,
    status = excluded.status,
    is_primary = excluded.is_primary,
    verification_details = excluded.verification_details,
    verified_at = coalesce(core.tenant_domains.verified_at, excluded.verified_at)
  returning id into domain_id_value;

  insert into core.platform_audit_events (
    tenant_id, actor_email, action, resource_type, resource_id, before_state, after_state
  )
  select tenant_id_value, lower(btrim(p_actor_email)),
    case when previous_row is null then 'DOMAIN_CREATED' else 'DOMAIN_UPDATED' end,
    'tenant_domain', domain_id_value::text, previous_row, to_jsonb(d)
  from core.tenant_domains d where d.id = domain_id_value;

  return domain_id_value;
end;
$$;

create or replace function public.platform_upsert_subscription(p_payload jsonb, p_actor_email text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subscription_id_value uuid;
  tenant_id_value uuid := (p_payload ->> 'tenantId')::uuid;
  app_id_value uuid;
  plan_id_value uuid;
  status_value text := coalesce(nullif(p_payload ->> 'status', ''), 'active');
  previous_row jsonb;
begin
  if nullif(btrim(p_actor_email), '') is null then raise exception 'Actor email is required'; end if;
  if not exists (select 1 from core.tenants where id = tenant_id_value) then raise exception 'Tenant not found'; end if;
  select id into app_id_value from core.apps where slug = p_payload ->> 'appSlug';
  if app_id_value is null then raise exception 'App not found'; end if;
  if nullif(p_payload ->> 'planSlug', '') is not null then
    select id into plan_id_value from core.plans
    where app_id = app_id_value and slug = p_payload ->> 'planSlug';
    if plan_id_value is null then raise exception 'Plan not found for app'; end if;
  end if;

  select to_jsonb(s) into previous_row
  from core.tenant_subscriptions s
  where s.tenant_id = tenant_id_value and s.app_id = app_id_value;

  insert into core.tenant_subscriptions (
    tenant_id, app_id, plan_id, status, provider, external_customer_id,
    external_subscription_id, trial_ends_at, current_period_starts_at,
    current_period_ends_at, cancel_at_period_end, metadata
  ) values (
    tenant_id_value, app_id_value, plan_id_value, status_value,
    coalesce(nullif(p_payload ->> 'provider', ''), 'manual'),
    nullif(p_payload ->> 'externalCustomerId', ''),
    nullif(p_payload ->> 'externalSubscriptionId', ''),
    case when nullif(p_payload ->> 'trialEndsAt', '') is not null then (p_payload ->> 'trialEndsAt')::timestamptz end,
    case when nullif(p_payload ->> 'currentPeriodStartsAt', '') is not null then (p_payload ->> 'currentPeriodStartsAt')::timestamptz end,
    case when nullif(p_payload ->> 'currentPeriodEndsAt', '') is not null then (p_payload ->> 'currentPeriodEndsAt')::timestamptz end,
    coalesce((p_payload ->> 'cancelAtPeriodEnd')::boolean, false),
    coalesce(p_payload -> 'metadata', '{}'::jsonb)
  )
  on conflict (tenant_id, app_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    provider = excluded.provider,
    external_customer_id = excluded.external_customer_id,
    external_subscription_id = excluded.external_subscription_id,
    trial_ends_at = excluded.trial_ends_at,
    current_period_starts_at = excluded.current_period_starts_at,
    current_period_ends_at = excluded.current_period_ends_at,
    cancel_at_period_end = excluded.cancel_at_period_end,
    metadata = excluded.metadata
  returning id into subscription_id_value;

  insert into core.tenant_apps (tenant_id, app_id, enabled, status, source)
  values (
    tenant_id_value, app_id_value, status_value in ('trialing', 'active'),
    case when status_value = 'expired' then 'cancelled' else status_value end,
    case when coalesce(nullif(p_payload ->> 'provider', ''), 'manual') = 'stripe' then 'stripe' else 'plan' end
  )
  on conflict (tenant_id, app_id) do update set
    enabled = excluded.enabled,
    status = excluded.status,
    source = excluded.source;

  update core.tenant_modules tm
  set status = case when status_value in ('trialing', 'active') then 'disabled' else 'suspended' end
  where tm.tenant_id = tenant_id_value
    and tm.source = 'plan'
    and tm.module_id in (select am.module_id from core.app_modules am where am.app_id = app_id_value);

  if plan_id_value is not null and status_value in ('trialing', 'active') then
    insert into core.tenant_modules (tenant_id, module_id, plan_id, status, source, settings)
    select tenant_id_value, pm.module_id, plan_id_value,
      case when status_value = 'trialing' then 'trialing' else 'active' end,
      'plan', jsonb_build_object('limits', pm.limits)
    from core.plan_modules pm
    where pm.plan_id = plan_id_value and pm.enabled
    on conflict (tenant_id, module_id) do update set
      plan_id = excluded.plan_id,
      status = excluded.status,
      source = excluded.source,
      settings = excluded.settings,
      ends_at = null;
  end if;

  insert into core.platform_audit_events (
    tenant_id, actor_email, action, resource_type, resource_id, before_state, after_state
  )
  select tenant_id_value, lower(btrim(p_actor_email)), 'SUBSCRIPTION_UPSERTED',
    'tenant_subscription', subscription_id_value::text, previous_row, to_jsonb(s)
  from core.tenant_subscriptions s where s.id = subscription_id_value;

  return subscription_id_value;
end;
$$;

create or replace function public.platform_record_usage(p_payload jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  usage_id_value bigint;
  module_id_value uuid;
begin
  if not exists (select 1 from core.tenants where id = (p_payload ->> 'tenantId')::uuid) then
    raise exception 'Tenant not found';
  end if;
  if nullif(p_payload ->> 'moduleSlug', '') is not null then
    select id into module_id_value from core.modules where slug = p_payload ->> 'moduleSlug';
    if module_id_value is null then raise exception 'Module not found'; end if;
  end if;

  insert into core.tenant_usage_events (
    tenant_id, module_id, meter_key, quantity, idempotency_key, dimensions, occurred_at
  ) values (
    (p_payload ->> 'tenantId')::uuid, module_id_value, p_payload ->> 'meterKey',
    coalesce((p_payload ->> 'quantity')::numeric, 1), p_payload ->> 'idempotencyKey',
    coalesce(p_payload -> 'dimensions', '{}'::jsonb),
    coalesce((p_payload ->> 'occurredAt')::timestamptz, now())
  )
  on conflict (idempotency_key) do nothing
  returning id into usage_id_value;

  if usage_id_value is null then
    select id into usage_id_value
    from core.tenant_usage_events
    where idempotency_key = p_payload ->> 'idempotencyKey';
  end if;

  return usage_id_value;
end;
$$;

revoke execute on function public.platform_snapshot() from public, anon, authenticated;
revoke execute on function public.platform_upsert_tenant(jsonb, text) from public, anon, authenticated;
revoke execute on function public.platform_upsert_membership(jsonb, text) from public, anon, authenticated;
revoke execute on function public.platform_set_tenant_module(jsonb, text) from public, anon, authenticated;
revoke execute on function public.platform_set_entitlement(jsonb, text) from public, anon, authenticated;
revoke execute on function public.platform_upsert_branding(jsonb, text) from public, anon, authenticated;
revoke execute on function public.platform_upsert_domain(jsonb, text) from public, anon, authenticated;
revoke execute on function public.platform_upsert_subscription(jsonb, text) from public, anon, authenticated;
revoke execute on function public.platform_record_usage(jsonb) from public, anon, authenticated;

grant execute on function public.platform_snapshot() to service_role;
grant execute on function public.platform_upsert_tenant(jsonb, text) to service_role;
grant execute on function public.platform_upsert_membership(jsonb, text) to service_role;
grant execute on function public.platform_set_tenant_module(jsonb, text) to service_role;
grant execute on function public.platform_set_entitlement(jsonb, text) to service_role;
grant execute on function public.platform_upsert_branding(jsonb, text) to service_role;
grant execute on function public.platform_upsert_domain(jsonb, text) to service_role;
grant execute on function public.platform_upsert_subscription(jsonb, text) to service_role;
grant execute on function public.platform_record_usage(jsonb) to service_role;
