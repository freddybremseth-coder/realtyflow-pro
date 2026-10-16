-- Disposable CI database only. NEVER apply this fixture to RealtyFlowPRO.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA core;
-- Superset needed by Altovena owner RPC and Nexus reference integrity.
CREATE TABLE auth.users (
 id uuid PRIMARY KEY,
 email text NOT NULL UNIQUE,
 email_confirmed_at timestamptz
);
CREATE TABLE core.brands (
 id uuid PRIMARY KEY,
 brand_key text UNIQUE NOT NULL
);
CREATE TABLE core.brand_workspace_memberships (
 brand_id uuid NOT NULL REFERENCES core.brands(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 status text NOT NULL,
 permissions text[] NOT NULL DEFAULT '{}',
 PRIMARY KEY (brand_id,user_id)
);
