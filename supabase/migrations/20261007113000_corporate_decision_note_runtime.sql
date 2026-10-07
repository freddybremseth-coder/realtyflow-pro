-- Dedicated runtime control for the Corporate Homes decision-note follow-up.
-- The sequence is only created after an explicit customer request for a decision note.
-- It stops on reply, booking, CRM suppression/manual takeover or pipeline progression.

insert into public.nexus_runtime_controls
  (control_key, label, category, enabled, risk_level, description, config, updated_by, updated_at)
values
  (
    'cron:/api/cron/corporate-decision-note-followup',
    'Corporate beslutningsgrunnlag',
    'revenue',
    true,
    'medium',
    'Følger opp eksplisitte Corporate Homes-forespørsler om beslutningsgrunnlag på dag 2, 5 og 10. Stopper ved svar, booking, CRM-sperre, manuell overtakelse eller aktiv salgsprogresjon.',
    '{"brand_id":"zeneco","sequence_days":[2,5,10],"automatic_report":true,"automatic_followup":true,"stop_on_reply":true,"stop_on_booking":true,"stop_on_manual_takeover":true,"stop_on_suppression":true,"final_step_creates_manual_task":true}'::jsonb,
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
