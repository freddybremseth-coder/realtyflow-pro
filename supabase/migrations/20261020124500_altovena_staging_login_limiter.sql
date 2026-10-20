-- Isolated staging only. Never apply to production until separately reviewed.
-- Per-key durable atomic window, using HMAC-derived identifiers (no IP or email stored).
create table if not exists public.altovena_staging_login_limits (
  identifier text primary key check(identifier ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null default now(),
  attempts integer not null default 0 check(attempts between 0 and 1000)
);
alter table public.altovena_staging_login_limits enable row level security;
revoke all on public.altovena_staging_login_limits from public, anon, authenticated;
grant select,insert,update,delete on public.altovena_staging_login_limits to service_role;

create or replace function public.altovena_consume_login_limit(
  p_identifier text, p_limit integer default 5, p_window_seconds integer default 900
) returns boolean language plpgsql security invoker set search_path=''
as $$
declare v_attempts integer;
begin
  if p_identifier is null or p_identifier !~ '^[a-f0-9]{64}$'
     or p_limit not between 1 and 50 or p_window_seconds not between 60 and 86400
  then raise exception 'Invalid login limiter arguments'; end if;
  insert into public.altovena_staging_login_limits(identifier,window_start,attempts)
  values(p_identifier,now(),1)
  on conflict(identifier) do update
     set window_start = case when
       public.altovena_staging_login_limits.window_start <=
         now() - (p_window_seconds * interval '1 second')
       then now() else public.altovena_staging_login_limits.window_start end,
         attempts = case when
       public.altovena_staging_login_limits.window_start <=
         now() - (p_window_seconds * interval '1 second')
       then 1 else least(1000,public.altovena_staging_login_limits.attempts+1) end
  returning attempts into v_attempts;
  return v_attempts <= p_limit;
end $$;
revoke execute on function public.altovena_consume_login_limit(text,integer,integer)
 from public,anon,authenticated;
grant execute on function public.altovena_consume_login_limit(text,integer,integer)
 to service_role;
