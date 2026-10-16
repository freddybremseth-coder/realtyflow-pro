-- CI TEST FIXTURE ONLY. Canonical migration is in Altovena repository.
-- Altovena embedded schema v0.1
-- Installation target: RealtyflowPRO Supabase project (eu-central-1).
-- Entirely within the NEW altovena namespace. No public/RealtyFlow tables modified.
-- Future portable SaaS deployments may install this schema in their own databases.
-- Default-deny: no Data API grants, no user-facing RLS policies, no customer data.
BEGIN;

CREATE SCHEMA IF NOT EXISTS altovena;
REVOKE ALL ON SCHEMA altovena FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS altovena.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  external_ref text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_ref)
);

CREATE TABLE IF NOT EXISTS altovena.products (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9_-]{1,60}$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 150),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS altovena.tenant_products (
  tenant_id uuid NOT NULL REFERENCES altovena.tenants(id),
  product_slug text NOT NULL REFERENCES altovena.products(slug),
  status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial','active','suspended','cancelled')),
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, product_slug)
);

CREATE TABLE IF NOT EXISTS altovena.tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES altovena.tenants(id),
  user_id uuid NOT NULL,
  role text NOT NULL
    CHECK (role IN ('owner','admin','operator','viewer')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS altovena_memberships_user_active_idx
  ON altovena.tenant_memberships(user_id,tenant_id) WHERE active;

CREATE TABLE IF NOT EXISTS altovena.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES altovena.tenants(id),
  product_slug text NOT NULL DEFAULT 'command'
    REFERENCES altovena.products(slug),
  created_by uuid NOT NULL,
  goal text NOT NULL CHECK (length(btrim(goal)) BETWEEN 1 AND 4000),
  state text NOT NULL DEFAULT 'draft'
    CHECK (state IN (
      'draft','planned','running','awaiting_review','approved','executing',
      'verifying','completed','paused','rejected','cancelled','failed','partial'
    )),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  budget_cents bigint NOT NULL DEFAULT 0 CHECK (budget_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,product_slug)
    REFERENCES altovena.tenant_products(tenant_id,product_slug)
);

CREATE TABLE IF NOT EXISTS altovena.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  agent_id text NOT NULL CHECK (length(btrim(agent_id)) BETWEEN 1 AND 150),
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','running','completed','failed','awaiting_review','cancelled')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  result_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,mission_id,idempotency_key),
  UNIQUE (tenant_id,mission_id,id),
  FOREIGN KEY (tenant_id,mission_id)
    REFERENCES altovena.missions(tenant_id,id)
);

CREATE TABLE IF NOT EXISTS altovena.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  task_id uuid,
  event_type text NOT NULL CHECK(event_type ~ '^[a-z][a-z0-9_.-]{1,100}$'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,mission_id)
    REFERENCES altovena.missions(tenant_id,id),
  FOREIGN KEY (tenant_id,mission_id,task_id)
    REFERENCES altovena.tasks(tenant_id,mission_id,id)
);
CREATE INDEX IF NOT EXISTS altovena_events_mission_order_idx
  ON altovena.events(tenant_id,mission_id,occurred_at,id);

CREATE TABLE IF NOT EXISTS altovena.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  task_id uuid,
  action_type text NOT NULL CHECK (length(btrim(action_type)) BETWEEN 1 AND 120),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','expired','consumed')),
  requested_by uuid NOT NULL,
  reviewer_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reviewer_id IS NULL OR reviewer_id <> requested_by),
  FOREIGN KEY (tenant_id,mission_id)
    REFERENCES altovena.missions(tenant_id,id),
  FOREIGN KEY (tenant_id,mission_id,task_id)
    REFERENCES altovena.tasks(tenant_id,mission_id,id)
);
CREATE INDEX IF NOT EXISTS altovena_approvals_pending_idx
  ON altovena.approvals(tenant_id,status,expires_at);

CREATE OR REPLACE FUNCTION altovena.reject_event_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Altovena evidence events are append-only';
END;
$$;
REVOKE ALL ON FUNCTION altovena.reject_event_mutation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER altovena_events_append_only
  BEFORE UPDATE OR DELETE ON altovena.events
  FOR EACH ROW EXECUTE FUNCTION altovena.reject_event_mutation();

-- Every table starts inaccessible to API clients, including the service_role.
-- A separate, reviewed gateway/role will be introduced before real traffic.
REVOKE ALL ON ALL TABLES IN SCHEMA altovena
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA altovena
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA altovena
  FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE altovena.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE altovena.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE altovena.tenant_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE altovena.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE altovena.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE altovena.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE altovena.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE altovena.approvals ENABLE ROW LEVEL SECURITY;

-- Set schema-scoped defaults for the migration role. Global default grants,
-- if any, must still be considered when creating later tables; review grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA altovena
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA altovena
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA altovena
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO altovena.products(slug,display_name)
VALUES ('command','Altovena Command')
ON CONFLICT (slug) DO NOTHING;
COMMIT;
