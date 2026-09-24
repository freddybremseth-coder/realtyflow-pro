-- Owner-configured workspace access plans. These are PREVIEW/DRAFT records only.
-- They never enable login, create core.brand_workspace_memberships, or grant data access.
-- A separate audited activation workflow can be added only after legacy APIs are scoped.
create table if not exists core.brand_workspace_access_plans (
  brand_id uuid not null references core.brands(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  permissions text[] not null default '{}'::text[]
    check (permissions <@ array[
      'crm.read', 'crm.write', 'properties.catalog.read',
      'marketing.read', 'marketing.draft', 'marketing.publish'
    ]::text[]),
  status text not null default 'draft' check (status in ('draft', 'discarded')),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (brand_id, email)
);
create table if not exists core.brand_workspace_access_plan_audit (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  email text not null,
  action text not null check (action in ('draft_saved', 'draft_discarded')),
  permissions text[] not null,
  actor_email text not null,
  at timestamptz not null default now()
);
create or replace function core.audit_brand_workspace_access_plan()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into core.brand_workspace_access_plan_audit
    (brand_id,email,action,permissions,actor_email)
  values
    (new.brand_id,new.email,
     case when new.status = 'discarded' then 'draft_discarded' else 'draft_saved' end,
     new.permissions,new.updated_by);
  return new;
end; $$;
drop trigger if exists trg_brand_workspace_access_plan_audit on core.brand_workspace_access_plans;
create trigger trg_brand_workspace_access_plan_audit
 after insert or update on core.brand_workspace_access_plans
 for each row execute function core.audit_brand_workspace_access_plan();
alter table core.brand_workspace_access_plans enable row level security;
alter table core.brand_workspace_access_plan_audit enable row level security;
revoke all on core.brand_workspace_access_plans, core.brand_workspace_access_plan_audit from anon, authenticated;
grant select, insert, update, delete on core.brand_workspace_access_plans to service_role;
grant select on core.brand_workspace_access_plan_audit to service_role;
comment on table core.brand_workspace_access_plans is 'Owner-designated access drafts only: never used in authorization.';
