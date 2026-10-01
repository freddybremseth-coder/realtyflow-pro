-- Runtime control for bounded outbound draft preparation.
-- This job creates internal REVIEW work items only and never sends email/DM.

insert into public.nexus_runtime_controls
  (control_key, label, category, enabled, risk_level, description, config, updated_by, updated_at)
values
  (
    'cron:/api/cron/outbound-draft-prep',
    'Outbound draft prep',
    'growth',
    true,
    'medium',
    'Lager maksimalt tre evidensbaserte outbound-utkast per kjøring for REVIEW. Ingen ekstern sending eller DM utføres.',
    '{"max_per_run":3,"send":false,"external_action":false}'::jsonb,
    'system',
    now()
  )
on conflict (control_key) do update
set label = excluded.label,
    category = excluded.category,
    risk_level = excluded.risk_level,
    description = excluded.description,
    config = excluded.config,
    updated_at = now();
