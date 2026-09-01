-- Book OS phase 4.1.1: covering indexes for launch calendar foreign keys.
-- These indexes close the three phase-specific Supabase Performance Advisor findings.

create index if not exists publishing_launch_activations_revision_fk_idx
  on public.publishing_launch_activations (revision_id);

create index if not exists publishing_launch_activations_work_fk_idx
  on public.publishing_launch_activations (work_id);

create index if not exists publishing_launch_calendar_items_campaign_fk_idx
  on public.publishing_launch_calendar_items (campaign_id);
