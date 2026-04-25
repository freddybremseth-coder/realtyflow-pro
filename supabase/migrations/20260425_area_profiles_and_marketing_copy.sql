-- ============================================================================
-- 20260425_area_profiles_and_marketing_copy.sql
--
-- Adds two pieces for the AI-driven property prospect copy:
--
--   1. properties.marketing_description TEXT
--      AI-generated selling copy for a single property. Lives next to (not in
--      place of) `description` so the agent can keep raw notes separately.
--      The PDF prefers `marketing_description` when present.
--
--   2. area_profiles  (new table)
--      Reusable per-area write-ups (Calpe, Altea, Pinoso, …) that the agent
--      can grow over time, AI-assisted. The PDF endpoint matches a property's
--      `location` field against `area_profiles.name` / `slug` for the same
--      brand and injects the area copy into the document.
--
--      Fields:
--        id            UUID         primary key
--        brand_id      TEXT         which brand owns this profile
--        name          TEXT         display name ("Calpe")
--        slug          TEXT         lowercased + ascii-folded for matching
--        country       TEXT         optional ("Spain")
--        region        TEXT         optional ("Costa Blanca")
--        hero_blurb    TEXT         one-liner / tagline
--        description   TEXT         long-form, multi-paragraph (markdown ok)
--        highlights    JSONB        array of bullet strings
--        climate       TEXT         optional one-paragraph climate summary
--        lifestyle     TEXT         optional one-paragraph lifestyle summary
--        photo_url     TEXT         optional cover photo for the area
--        created_at    TIMESTAMPTZ
--        updated_at    TIMESTAMPTZ
--
--      Unique (brand_id, slug) so each brand has at most one profile per area
--      but two brands may keep their own version of "Calpe".
-- ============================================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS marketing_description TEXT;

COMMENT ON COLUMN properties.marketing_description IS
  'AI-generated selling copy. Used by the PDF prospect generator in preference to description.';

CREATE TABLE IF NOT EXISTS area_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  country     TEXT,
  region      TEXT,
  hero_blurb  TEXT,
  description TEXT,
  highlights  JSONB DEFAULT '[]'::jsonb,
  climate     TEXT,
  lifestyle   TEXT,
  photo_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT area_profiles_brand_slug_unique UNIQUE (brand_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_area_profiles_brand   ON area_profiles (brand_id);
CREATE INDEX IF NOT EXISTS idx_area_profiles_slug    ON area_profiles (slug);
CREATE INDEX IF NOT EXISTS idx_area_profiles_name    ON area_profiles (lower(name));

COMMENT ON TABLE area_profiles IS
  'Reusable per-area write-ups injected into property PDFs by location match.';
