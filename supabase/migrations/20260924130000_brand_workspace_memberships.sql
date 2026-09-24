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
      'crm.read', 'crm.write', 'properties.catalog.read',
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
-- No browser-facing policies. Server checks the signed app session AND the
-- membership using a service client, and verifies its auth.users identity.
revoke all on core.brand_workspace_memberships from anon, authenticated;
grant select, insert, update, delete on core.brand_workspace_memberships to service_role;
comment on table core.brand_workspace_memberships is
  'Explicit per-brand grants; core.tenant_memberships does not imply CRM access.';
