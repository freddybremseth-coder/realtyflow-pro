-- CI ONLY: minimal, schema-faithful constraints needed for Altovena's real migration.
-- No Supabase or production database is used.
create role service_role bypassrls;
create role anon;
create role authenticated;
create schema core;
create table core.tenants(
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active',
  plan text not null default 'pro',
  metadata jsonb not null default '{}'::jsonb
);
create table core.brands(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id),
  brand_key text not null unique,
  display_name text not null,
  app_slug text not null,
  metadata jsonb not null default '{}'::jsonb
);
create table public.contacts(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text default '',
  company text default '',
  type text default 'buyer',
  source text default 'manual',
  brand text default 'soleada',
  brand_id text default 'soleada',
  pipeline_status text default 'NEW',
  pipeline_value real default 0,
  notes text default '',
  interactions jsonb default '[]'::jsonb,
  ai_auto_followup boolean default false,
  nurture_status text default 'eligible'
    check (nurture_status in ('eligible','enrolled','paused','completed','stopped','active','opted_out')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  next_followup timestamptz
);
create table public.work_items(
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'TO_DO'
    check (status in ('TO_DO','IN_PROGRESS','REVIEW','DONE','CANCELLED')),
  priority text not null default 'MEDIUM'
    check (priority in ('CRITICAL','HIGH','MEDIUM','LOW')),
  due_date date,
  brand_id text,
  source_type text not null default 'manual'
    check (source_type in ('manual','crm','content','automation','ai_agent','website_lead','chatbot','saas','publishing','kdp','brand','property','market_intelligence')),
  source_id text,
  assigned_agent text,
  next_action text,
  ai_score integer default 0 check (ai_score between 0 and 100),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint altovena_ci_failure_simulation check (title not like '%REJECT_TASK_%')
);
grant usage on schema core,public to service_role;
grant select on core.tenants,core.brands to service_role;
grant select,insert,update on public.contacts,public.work_items to service_role;
-- Same email may exist in a second brand and must remain distinct.
insert into public.contacts(name,email,company,brand,brand_id)
values('Other Brand Example','shared@example.invalid','Other Ltd','zeneco','zeneco');
