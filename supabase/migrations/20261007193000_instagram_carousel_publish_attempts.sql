-- True Instagram carousel publishing support.
-- Child container IDs are persisted so retries resume safely instead of
-- recreating/publishing a second carousel.

alter table public.marketing_publish_attempts
  add column if not exists container_children jsonb not null default '[]'::jsonb;

comment on column public.marketing_publish_attempts.container_children is
  'Instagram carousel child container IDs. Persisted for idempotent retry/resume.';
