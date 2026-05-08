-- ============================================================================
-- Multi-tenant foundation (Phase 1, non-breaking)
-- One Supabase project, shared auth users, logical app isolation by schema.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS publishing;
CREATE SCHEMA IF NOT EXISTS growth;
CREATE SCHEMA IF NOT EXISTS integrations;
CREATE SCHEMA IF NOT EXISTS olivia;

CREATE TABLE IF NOT EXISTS core.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  plan TEXT NOT NULL DEFAULT 'pro',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  default_tenant_id UUID REFERENCES core.tenants(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  is_owner BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS core.apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.tenant_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES core.apps(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, app_id)
);

CREATE TABLE IF NOT EXISTS core.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  brand_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  app_slug TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO core.apps (slug, name, description)
VALUES
  ('realtyflow', 'RealtyFlow', 'Core CRM, content and growth hub'),
  ('olivia', 'Olivia', 'Farm and operations intelligence'),
  ('chatgenius', 'ChatGenius', 'AI assistants and automation'),
  ('publishing', 'Publishing Hub', 'Book publishing operations')
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION core.is_tenant_member(target_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM core.tenant_memberships tm
    WHERE tm.tenant_id = target_tenant
      AND tm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION core.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_core_tenants_updated_at'
  ) THEN
    CREATE TRIGGER trg_core_tenants_updated_at
      BEFORE UPDATE ON core.tenants
      FOR EACH ROW
      EXECUTE FUNCTION core.touch_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_core_profiles_updated_at'
  ) THEN
    CREATE TRIGGER trg_core_profiles_updated_at
      BEFORE UPDATE ON core.profiles
      FOR EACH ROW
      EXECUTE FUNCTION core.touch_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_core_brands_updated_at'
  ) THEN
    CREATE TRIGGER trg_core_brands_updated_at
      BEFORE UPDATE ON core.brands
      FOR EACH ROW
      EXECUTE FUNCTION core.touch_updated_at();
  END IF;
END $$;

ALTER TABLE core.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.tenant_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.brands ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'core' AND tablename = 'tenants' AND policyname = 'tenant_members_read_tenants'
  ) THEN
    CREATE POLICY tenant_members_read_tenants
      ON core.tenants
      FOR SELECT
      USING (core.is_tenant_member(id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'core' AND tablename = 'profiles' AND policyname = 'profiles_self_read_write'
  ) THEN
    CREATE POLICY profiles_self_read_write
      ON core.profiles
      FOR ALL
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'core' AND tablename = 'tenant_memberships' AND policyname = 'tenant_members_read_memberships'
  ) THEN
    CREATE POLICY tenant_members_read_memberships
      ON core.tenant_memberships
      FOR SELECT
      USING (core.is_tenant_member(tenant_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'core' AND tablename = 'apps' AND policyname = 'apps_read_all'
  ) THEN
    CREATE POLICY apps_read_all
      ON core.apps
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'core' AND tablename = 'tenant_apps' AND policyname = 'tenant_members_read_tenant_apps'
  ) THEN
    CREATE POLICY tenant_members_read_tenant_apps
      ON core.tenant_apps
      FOR SELECT
      USING (core.is_tenant_member(tenant_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'core' AND tablename = 'brands' AND policyname = 'tenant_members_read_brands'
  ) THEN
    CREATE POLICY tenant_members_read_brands
      ON core.brands
      FOR SELECT
      USING (core.is_tenant_member(tenant_id));
  END IF;
END $$;

GRANT USAGE ON SCHEMA core, publishing, growth, integrations, olivia TO authenticated, anon, service_role;
GRANT SELECT ON core.apps TO authenticated, anon, service_role;
GRANT SELECT ON core.tenants, core.profiles, core.tenant_memberships, core.tenant_apps, core.brands TO authenticated, service_role;

CREATE OR REPLACE VIEW public.brand_tenant_map AS
SELECT
  b.id,
  b.brand_key,
  b.display_name,
  b.app_slug,
  b.tenant_id,
  t.slug AS tenant_slug,
  t.name AS tenant_name
FROM core.brands b
JOIN core.tenants t ON t.id = b.tenant_id;

