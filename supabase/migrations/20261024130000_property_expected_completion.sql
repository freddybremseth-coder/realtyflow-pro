-- Completion status is optional, and manual information takes precedence over imported facts.
alter table public.properties
  add column if not exists expected_completion_source text,
  add column if not exists expected_completion_manual text;
comment on column public.properties.expected_completion_source is 'Source-supplied completion text, not a verified date';
comment on column public.properties.expected_completion_manual is 'Owner-entered completion text; takes precedence over imported value';
