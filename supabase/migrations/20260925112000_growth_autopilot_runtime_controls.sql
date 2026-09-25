-- Explicit kill switches for newly owner-authorized autonomous publishers.
-- The application fails closed when these controls are missing or disabled.
insert into public.nexus_runtime_controls
  (control_key,label,category,enabled,risk_level,description,config,updated_by,updated_at)
values
  ('cron:/api/cron/freddy-website-autopilot','Freddy Website Autopilot','cron',true,'high',
   'Publishes one verified-source article per Madrid day to the FreddyBremseth.com website feed.',
   '{}'::jsonb,'owner-authorized-2026-09-25',now()),
  ('cron:/api/cron/portfolio-reel-autopublish','Portfolio Reel Autopublish','cron',true,'high',
   'Publishes rendered portfolio Reels only to verified brand-bound social destinations.',
   '{}'::jsonb,'owner-authorized-2026-09-25',now()),
  ('cron:/api/cron/remaster-mix-autopilot','Re-Master Mix Autopilot','cron',true,'high',
   'Queues adaptive public Re-Master YouTube mixes for the guarded long-form worker.',
   '{}'::jsonb,'owner-authorized-2026-09-25',now())
on conflict (control_key) do update set
  label=excluded.label,
  category=excluded.category,
  enabled=true,
  risk_level=excluded.risk_level,
  description=excluded.description,
  config=coalesce(public.nexus_runtime_controls.config,'{}'::jsonb),
  updated_by=excluded.updated_by,
  updated_at=now();
