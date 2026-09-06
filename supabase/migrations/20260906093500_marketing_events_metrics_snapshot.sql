-- Keep the production marketing_events constraint aligned with MARKETING_EVENT_TYPES.
-- `metrics_snapshot` is the canonical cumulative channel-measurement event used by Growth OS.

alter table public.marketing_events
  drop constraint if exists marketing_events_event_type_check;

alter table public.marketing_events
  add constraint marketing_events_event_type_check
  check (event_type = any (array[
    'content_created'::text,
    'content_approved'::text,
    'content_published'::text,
    'content_viewed'::text,
    'content_clicked'::text,
    'metrics_snapshot'::text,
    'lead_attributed'::text,
    'qualified_lead'::text,
    'experiment_started'::text,
    'experiment_completed'::text,
    'learning_created'::text
  ]));
