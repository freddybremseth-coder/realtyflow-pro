-- Optional, manually maintained developer facts for each property.
-- Separate from XML source_description and AI-generated editorial copy.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS additional_information text;

COMMENT ON COLUMN public.properties.additional_information IS
  'Internal free-text information entered manually from the developer: inclusions, project phase, plot choices, estimated delivery, optional upgrades and other verified facts. Never overwritten by property feed imports; not published automatically.';
