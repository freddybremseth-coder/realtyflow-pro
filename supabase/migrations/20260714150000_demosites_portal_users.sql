-- ─── DemoSites seller portal users ──────────────────────────────────────────
--
-- Sellers log in on chatgenius.pro (the public frontend) — NOT in RealtyFlow,
-- which contains every internal business area. Accounts are created and
-- managed from the RealtyFlow DemoSites CRM; chatgenius.pro authenticates
-- against /api/saas/demosites/portal/login and receives a signed stateless
-- token (HMAC, REALTYFLOW_SESSION_SECRET).

create table if not exists demosites_portal_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  role text not null default 'seller' check (role in ('seller')),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table demosites_portal_users is
  'Login accounts for the chatgenius.pro seller portal. Managed from the RealtyFlow DemoSites CRM; passwords are scrypt hashes (see src/lib/demosites-portal.ts).';

alter table demosites_portal_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'demosites_portal_users' and policyname = 'Allow all'
  ) then
    create policy "Allow all" on demosites_portal_users for all using (true) with check (true);
  end if;
end $$;
