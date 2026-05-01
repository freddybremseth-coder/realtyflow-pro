-- Add explicit aspect_ratios column to ad_campaigns so the matrix
-- builder can respect the user's choice without reading from delivery JSONB.
alter table ad_campaigns
  add column if not exists aspect_ratios text[] default '{"1:1","9:16"}'::text[];
