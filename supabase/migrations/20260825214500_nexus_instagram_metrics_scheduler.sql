do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname in ('nexus-engagement-tracker-6h','nexus-marketing-growth-metrics-6h') loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'nexus-engagement-tracker-6h',
  '5 0,6,12,18 * * *',
  $$
    select net.http_get(
      url := c.base_url || '/api/cron/engagement-tracker',
      headers := jsonb_build_object('x-nexus-scheduler', s.decrypted_secret),
      timeout_milliseconds := 240000
    )
    from public.nexus_scheduler_config c
    cross join lateral (
      select decrypted_secret from vault.decrypted_secrets where name='nexus_scheduler_token' limit 1
    ) s
    where c.singleton=true and c.enabled=true;
  $$
);

select cron.schedule(
  'nexus-marketing-growth-metrics-6h',
  '25 0,6,12,18 * * *',
  $$
    select net.http_get(
      url := c.base_url || '/api/cron/marketing-growth-metrics',
      headers := jsonb_build_object('x-nexus-scheduler', s.decrypted_secret),
      timeout_milliseconds := 240000
    )
    from public.nexus_scheduler_config c
    cross join lateral (
      select decrypted_secret from vault.decrypted_secrets where name='nexus_scheduler_token' limit 1
    ) s
    where c.singleton=true and c.enabled=true;
  $$
);
