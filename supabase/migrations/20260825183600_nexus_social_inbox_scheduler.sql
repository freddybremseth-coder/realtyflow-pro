-- Run the read-only Nexus Social Inbox sync four times per hour.
-- The route performs its own Runtime and scheduler-token validation.

do $$
begin
  if exists (select 1 from cron.job where jobname='nexus-social-inbox-sync-15m') then
    perform cron.unschedule((select jobid from cron.job where jobname='nexus-social-inbox-sync-15m' limit 1));
  end if;
end $$;

select cron.schedule(
  'nexus-social-inbox-sync-15m',
  '10,25,40,55 * * * *',
  $job$
    select net.http_get(
      url := c.base_url || '/api/cron/social-inbox-sync',
      headers := jsonb_build_object('x-nexus-scheduler', s.decrypted_secret),
      timeout_milliseconds := 240000
    )
    from public.nexus_scheduler_config c
    cross join lateral (
      select decrypted_secret from vault.decrypted_secrets where name='nexus_scheduler_token' limit 1
    ) s
    where c.singleton=true and c.enabled=true;
  $job$
);
