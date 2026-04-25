-- ============================================================================
-- 20260425_property_floorplans_and_agent.sql
--
-- Adds two pieces needed for the PDF property-prospect feature:
--   1. properties.floorplans TEXT[]   — image URLs the agent has flagged as
--      floor plans (separated from `gallery` so the PDF can render them in
--      their own section).
--   2. brand_settings.settings.agent_*  — extends the existing JSONB blob with
--      agent profile fields (name, photo, email, phone, bio). Stored in the
--      JSONB so we don't need a new table for one row per brand.
--
-- The settings JSONB extension is documented but not enforced at the DB level
-- — it's just a schema convention. New keys:
--   agent_name        TEXT   "Freddy Bremseth"
--   agent_title       TEXT   "Eiendomsmegler"
--   agent_photo_url   TEXT   "https://.../freddy.jpg"
--   agent_email       TEXT   "freddy@zenecohomes.com"
--   agent_phone       TEXT   "+47 ..."
--   agent_bio         TEXT   short paragraph for the PDF back-page
-- ============================================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS floorplans TEXT[] DEFAULT '{}';

-- The inventory page already maps `floorplans` round-trip in the app code; this
-- migration just makes the DB accept the writes without dropping the column.

COMMENT ON COLUMN properties.floorplans IS
  'Image URLs flagged as floor plans (separate from gallery). Used by the PDF prospect generator.';
