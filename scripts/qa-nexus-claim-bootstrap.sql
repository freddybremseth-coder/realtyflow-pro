-- Dedicated ephemeral CI PostgreSQL fixture; NEVER run against RealtyFlow data.
create role anon nologin;
create role authenticated nologin;
-- Match Supabase's service_role RLS bypass semantics in this disposable test DB.
create role service_role nologin bypassrls;
create schema auth;
create schema core;
create table auth.users (id uuid primary key);
create table core.brands (id uuid primary key, brand_key text unique not null);
create table core.brand_workspace_memberships (
  brand_id uuid not null references core.brands(id),
  user_id uuid not null references auth.users(id),
  status text not null,
  permissions text[] not null default '{}',
  primary key (brand_id,user_id)
);
