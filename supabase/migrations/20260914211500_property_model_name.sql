-- Optional developer/architect model name for imported or manually curated properties.
-- Examples: Alma. Never infer this value without source evidence.
alter table public.properties
  add column if not exists model_name text;

comment on column public.properties.model_name is
  'Developer or architect model name for a property/home model. Optional and source-grounded.';
