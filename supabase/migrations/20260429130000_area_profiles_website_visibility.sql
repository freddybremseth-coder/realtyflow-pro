-- Allow RealtyFlow area profiles to be selectively shown on public websites.

ALTER TABLE area_profiles
  ADD COLUMN IF NOT EXISTS show_on_website BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_area_profiles_show_on_website
  ON area_profiles (brand_id, show_on_website);

COMMENT ON COLUMN area_profiles.show_on_website IS
  'When true, this area profile can be shown on the public brand website.';
