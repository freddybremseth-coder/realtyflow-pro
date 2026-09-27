-- Brand membership is distinct from tenant membership. A tenant may hold multiple
-- brands; tenant membership alone must never authorise a brand-private CRM record.
-- Additive migration: no user is granted access and no existing data is moved.
create table if not exists core.brand_workspace_memberships (
  brand_id uuid not null references core.brands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%@%'),
  status text not null default 'disabled'
    check (status in ('active', 'disabled', 'revoked')),
  permissions text[] not null default '{}'::text[]
    check (permissions <@ array[
      'crm.read', 'crm.write', 'crm.joint.read', 'crm.joint.write',
      'tasks.joint.read', 'tasks.joint.write', 'properties.catalog.read',
      'marketing.read', 'marketing.draft', 'marketing.publish'
    ]::text[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (brand_id, user_id),
  unique (brand_id, email)
);
create index if not exists brand_workspace_memberships_user_status_idx
  on core.brand_workspace_memberships (user_id, status);
alter table core.brand_workspace_memberships enable row level security;

-- Append-only lifecycle audit for any future activation/permission/revocation.
-- It contains staff identity and permission metadata only, never CRM/customer data.
create table if not exists core.brand_workspace_membership_audit (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  user_id uuid not null,
  email text not null,
  action text not null check (action in ('created','updated')),
  old_status text,
  new_status text not null,
  old_permissions text[],
  new_permissions text[] not null,
  db_actor text not null default current_user,
  at timestamptz not null default now()
);
alter table core.brand_workspace_membership_audit enable row level security;

create or replace function core.audit_brand_workspace_membership()
returns trigger language plpgsql security definer set search_path = '' as $workspace_membership_audit$
begin
  insert into core.brand_workspace_membership_audit
    (brand_id,user_id,email,action,old_status,new_status,old_permissions,new_permissions,db_actor)
  values (
    new.brand_id,new.user_id,new.email,
    case when tg_op='INSERT' then 'created' else 'updated' end,
    case when tg_op='UPDATE' then old.status else null end,
    new.status,
    case when tg_op='UPDATE' then old.permissions else null end,
    new.permissions,
    current_user
  );
  return new;
end; $workspace_membership_audit$;

drop trigger if exists trg_brand_workspace_membership_audit on core.brand_workspace_memberships;
create trigger trg_brand_workspace_membership_audit
after insert or update on core.brand_workspace_memberships
for each row execute function core.audit_brand_workspace_membership();

-- No browser-facing policies. Server checks the signed app session AND the
-- membership using a service client, and verifies its auth.users identity.
revoke all on core.brand_workspace_memberships, core.brand_workspace_membership_audit
  from public, anon, authenticated;
-- Memberships may be inserted, changed to disabled/revoked, or re-enabled by a
-- future audited owner workflow. Hard DELETE is intentionally not granted so a
-- grant cannot be erased without leaving its lifecycle history.
revoke all on core.brand_workspace_memberships, core.brand_workspace_membership_audit
  from service_role;
grant select, insert, update on core.brand_workspace_memberships to service_role;
grant select on core.brand_workspace_membership_audit to service_role;
revoke execute on function core.audit_brand_workspace_membership()
  from public, anon, authenticated, service_role;

comment on table core.brand_workspace_memberships is
  'Explicit per-brand grants; core.tenant_memberships does not imply CRM access.';
comment on table core.brand_workspace_membership_audit is
  'Append-only lifecycle audit for future workspace grant activation, changes and revocation.';
