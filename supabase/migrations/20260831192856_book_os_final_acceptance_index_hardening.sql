-- Book OS final acceptance hardening: cover the remaining canonical foreign
-- keys added after the phase 2.1 and 4.1.1 index passes.
-- This migration changes no rows and is safe to re-run.

create index if not exists publishing_channel_metadata_revision_fk_idx
  on public.publishing_channel_metadata_packages (revision_id);

create index if not exists publishing_distribution_publications_revision_fk_idx
  on public.publishing_distribution_publications (revision_id)
  where revision_id is not null;

create index if not exists publishing_launch_campaigns_work_fk_idx
  on public.publishing_launch_campaigns (work_id);

create index if not exists publishing_launch_campaigns_revision_fk_idx
  on public.publishing_launch_campaigns (revision_id);
