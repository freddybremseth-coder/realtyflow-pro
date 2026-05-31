-- ============================================================================
-- 20260531_safe_rls_skip_views.sql
-- Safe RLS/grants for Data Health tables.
-- Important: ENABLE ROW SECURITY is only valid for tables/partitioned tables,
-- not views. This migration skips views such as family.economy_monthly when it
-- already exists as a view.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS olivia;
CREATE SCHEMA IF NOT EXISTS family;

GRANT USAGE ON SCHEMA olivia TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA family TO anon, authenticated, service_role;

-- Grant read access to both tables and views. Views are included in ALL TABLES.
GRANT SELECT ON ALL TABLES IN SCHEMA olivia TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA family TO anon, authenticated, service_role;

-- Write access for app/server roles on real tables.
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA olivia TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA family TO authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA olivia TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA family TO anon, authenticated, service_role;

-- Enable RLS only on ordinary tables and partitioned tables. Skip views/materialized views.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS relation_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('olivia', 'family')
      AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schema_name, r.relation_name);
  END LOOP;
END $$;

-- Create simple authenticated read/write policies only for real tables where missing.
DO $$
DECLARE
  r RECORD;
  policy_name TEXT;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS relation_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('olivia', 'family')
      AND c.relkind IN ('r', 'p')
  LOOP
    policy_name := 'authenticated_all_' || r.relation_name;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = r.schema_name
        AND tablename = r.relation_name
        AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        policy_name,
        r.schema_name,
        r.relation_name
      );
    END IF;
  END LOOP;
END $$;

-- Service role bypasses RLS in Supabase, but grant everything explicitly.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA olivia TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA family TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA olivia TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA family TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA olivia GRANT SELECT ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA family GRANT SELECT ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA olivia GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA family GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
