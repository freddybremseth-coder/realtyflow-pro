-- ============================================================================
-- Phase 2: Tenant/brand mapping + tenant_id backfill (non-breaking)
-- ============================================================================

CREATE OR REPLACE FUNCTION core.normalize_brand_slug(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN input IS NULL OR btrim(input) = '' THEN ''
    ELSE
      replace(
        replace(
          replace(
            lower(regexp_replace(split_part(input, '(', 1), '[^a-z0-9-]+', '', 'g')),
            'zen-eco-homes', 'zeneco'
          ),
          'dona-anna', 'donaanna'
        ),
        'pinoso-ecolife', 'pinosoecolife'
      )
  END;
$$;

-- 1) Normalize noisy brand slugs in existing tables
UPDATE brand_settings
SET brand_id = core.normalize_brand_slug(brand_id)
WHERE brand_id <> core.normalize_brand_slug(brand_id);

UPDATE content_publications
SET brand_id = core.normalize_brand_slug(brand_id)
WHERE brand_id <> core.normalize_brand_slug(brand_id);

UPDATE ad_campaigns
SET brand_id = core.normalize_brand_slug(brand_id)
WHERE brand_id <> core.normalize_brand_slug(brand_id);

UPDATE publishing_books
SET brand_id = core.normalize_brand_slug(brand_id)
WHERE brand_id <> core.normalize_brand_slug(brand_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'social_accounts'
      AND column_name = 'brand'
  ) THEN
    EXECUTE '
      UPDATE social_accounts
      SET brand = core.normalize_brand_slug(brand)
      WHERE brand <> core.normalize_brand_slug(brand)
    ';
  END IF;
END $$;

-- 2) Create tenants from brand_settings brands
INSERT INTO core.tenants (slug, name, status, plan)
SELECT
  core.normalize_brand_slug(bs.brand_id) AS slug,
  initcap(replace(core.normalize_brand_slug(bs.brand_id), '-', ' ')) AS name,
  'active' AS status,
  'pro' AS plan
FROM brand_settings bs
WHERE core.normalize_brand_slug(bs.brand_id) <> ''
  AND core.normalize_brand_slug(bs.brand_id) <> '_system'
ON CONFLICT (slug) DO NOTHING;

-- 3) Create brand map
INSERT INTO core.brands (tenant_id, brand_key, display_name, app_slug, metadata)
SELECT
  t.id AS tenant_id,
  t.slug AS brand_key,
  t.name AS display_name,
  CASE
    WHEN t.slug IN ('zeneco', 'soleada', 'pinosoecolife') THEN 'realtyflow'
    WHEN t.slug IN ('donaanna') THEN 'olivia'
    WHEN t.slug IN ('chatgenius', 'neuralbeat', 'remasterfreddy') THEN 'chatgenius'
    WHEN t.slug IN ('freddypublishing', 'freddyb') THEN 'publishing'
    ELSE 'realtyflow'
  END AS app_slug,
  jsonb_build_object('source', 'brand_settings_seed') AS metadata
FROM core.tenants t
ON CONFLICT (brand_key) DO NOTHING;

-- 4) Add tenant_id columns (non-breaking)
ALTER TABLE content_publications ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE publishing_books ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS tenant_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'social_accounts'
      AND column_name = 'brand'
  ) THEN
    EXECUTE 'ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS tenant_id UUID';
  END IF;
END $$;

-- 5) Backfill tenant_id by brand map
UPDATE brand_settings bs
SET tenant_id = b.tenant_id
FROM core.brands b
WHERE b.brand_key = core.normalize_brand_slug(bs.brand_id)
  AND bs.tenant_id IS NULL;

UPDATE content_publications cp
SET tenant_id = b.tenant_id
FROM core.brands b
WHERE b.brand_key = core.normalize_brand_slug(cp.brand_id)
  AND cp.tenant_id IS NULL;

UPDATE ad_campaigns ac
SET tenant_id = b.tenant_id
FROM core.brands b
WHERE b.brand_key = core.normalize_brand_slug(ac.brand_id)
  AND ac.tenant_id IS NULL;

UPDATE publishing_books pb
SET tenant_id = b.tenant_id
FROM core.brands b
WHERE b.brand_key = core.normalize_brand_slug(pb.brand_id)
  AND pb.tenant_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'social_accounts'
      AND column_name = 'brand'
  ) THEN
    EXECUTE '
      UPDATE social_accounts sa
      SET tenant_id = b.tenant_id
      FROM core.brands b
      WHERE b.brand_key = core.normalize_brand_slug(sa.brand)
        AND sa.tenant_id IS NULL
    ';
  END IF;
END $$;

-- 6) Add foreign keys + indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'content_publications'
      AND constraint_name = 'content_publications_tenant_id_fkey'
  ) THEN
    ALTER TABLE content_publications
      ADD CONSTRAINT content_publications_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'ad_campaigns'
      AND constraint_name = 'ad_campaigns_tenant_id_fkey'
  ) THEN
    ALTER TABLE ad_campaigns
      ADD CONSTRAINT ad_campaigns_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'publishing_books'
      AND constraint_name = 'publishing_books_tenant_id_fkey'
  ) THEN
    ALTER TABLE publishing_books
      ADD CONSTRAINT publishing_books_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'brand_settings'
      AND constraint_name = 'brand_settings_tenant_id_fkey'
  ) THEN
    ALTER TABLE brand_settings
      ADD CONSTRAINT brand_settings_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_content_publications_tenant ON content_publications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_tenant ON ad_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_publishing_books_tenant ON publishing_books(tenant_id);
CREATE INDEX IF NOT EXISTS idx_brand_settings_tenant ON brand_settings(tenant_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'social_accounts'
      AND column_name = 'tenant_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_social_accounts_tenant ON social_accounts(tenant_id)';
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'social_accounts'
        AND constraint_name = 'social_accounts_tenant_id_fkey'
    ) THEN
      EXECUTE '
        ALTER TABLE social_accounts
        ADD CONSTRAINT social_accounts_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE SET NULL
      ';
    END IF;
  END IF;
END $$;

