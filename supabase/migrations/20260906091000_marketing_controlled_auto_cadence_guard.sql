-- Defense-in-depth guard for controlled-auto marketing publication cadence.
-- Protects all callers, including legacy/external routes, from runaway social publishing.

create or replace function public.enforce_marketing_controlled_auto_cadence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_mode text;
  plan_status text;
  plan_metadata jsonb;
  min_interval_hours numeric := 20;
  source_cooldown_days numeric := 14;
  raw_interval text;
  raw_source_cooldown text;
begin
  -- Manual-review and blocked rows are intentionally outside this guard.
  if coalesce(new.autonomy_mode, '') <> 'live' then
    return new;
  end if;

  if coalesce(new.brand_id, '') = '' or coalesce(new.channel, '') = '' then
    return new;
  end if;

  select autonomy_mode, status, coalesce(metadata, '{}'::jsonb)
    into plan_mode, plan_status, plan_metadata
  from public.marketing_brand_growth_plans
  where brand_id = new.brand_id
  limit 1;

  if coalesce(plan_status, '') <> 'active' or coalesce(plan_mode, '') <> 'controlled_auto' then
    return new;
  end if;

  raw_interval := coalesce(plan_metadata ->> 'autopilot_min_interval_hours', '');
  if raw_interval ~ '^[0-9]+([.][0-9]+)?$' then
    min_interval_hours := greatest(6, least(72, raw_interval::numeric));
  end if;

  raw_source_cooldown := coalesce(plan_metadata ->> 'autopilot_source_cooldown_days', '');
  if raw_source_cooldown ~ '^[0-9]+([.][0-9]+)?$' then
    source_cooldown_days := greatest(1, least(30, raw_source_cooldown::numeric));
  end if;

  if exists (
    select 1
    from public.marketing_publications p
    where p.brand_id = new.brand_id
      and p.channel = new.channel
      and p.autonomy_mode = 'live'
      and p.state in ('draft', 'approved', 'publishing', 'published', 'scheduled')
      and p.created_at >= now() - make_interval(secs => (min_interval_hours * 3600)::double precision)
  ) then
    raise exception 'CONTROLLED_AUTO_CADENCE_GUARD: %/% has a recent live publication inside % hours',
      new.brand_id, new.channel, min_interval_hours
      using errcode = '23514';
  end if;

  if nullif(new.source_id, '') is not null and exists (
    select 1
    from public.marketing_publications p
    where p.brand_id = new.brand_id
      and p.channel = new.channel
      and p.autonomy_mode = 'live'
      and p.state in ('draft', 'approved', 'publishing', 'published', 'scheduled')
      and p.source_id = new.source_id
      and p.created_at >= now() - make_interval(secs => (source_cooldown_days * 86400)::double precision)
  ) then
    raise exception 'CONTROLLED_AUTO_SOURCE_COOLDOWN: %/% source % was already used inside % days',
      new.brand_id, new.channel, new.source_id, source_cooldown_days
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_marketing_controlled_auto_cadence on public.marketing_publications;
create trigger trg_marketing_controlled_auto_cadence
before insert on public.marketing_publications
for each row
execute function public.enforce_marketing_controlled_auto_cadence();

comment on function public.enforce_marketing_controlled_auto_cadence() is
  'Defense-in-depth cadence/source cooldown for live controlled-auto marketing publications. Manual-review remains unaffected.';
