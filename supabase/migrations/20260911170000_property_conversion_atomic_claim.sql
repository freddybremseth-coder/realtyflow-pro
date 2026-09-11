create or replace function public.claim_property_conversion_candidates(
  p_limit integer default 6,
  p_stale_minutes integer default 20
)
returns table(property jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Recover only genuinely stale claims. Normal runs finish within maxDuration=120s,
  -- so a 20 minute lease leaves ample safety margin while avoiding stuck work forever.
  update public.properties
  set conversion_no = null
  where conversion_no ->> 'status' = 'processing'
    and nullif(conversion_no ->> 'claimed_at', '') is not null
    and (conversion_no ->> 'claimed_at')::timestamptz
      < now() - make_interval(mins => greatest(p_stale_minutes, 1));

  return query
  with candidates as (
    select p.id
    from public.properties p
    where p.conversion_no is null
      and coalesce(p.show_on_website, true) = true
      and coalesce(p.website_visible, true) = true
    order by p.created_at desc
    for update skip locked
    limit greatest(1, least(p_limit, 24))
  ), claimed as (
    update public.properties p
    set conversion_no = jsonb_build_object(
      'status', 'processing',
      'version', 'conversion-v6',
      'claimed_at', now()
    )
    from candidates c
    where p.id = c.id
    returning to_jsonb(p.*) as property
  )
  select claimed.property
  from claimed;
end;
$$;

comment on function public.claim_property_conversion_candidates(integer, integer) is
  'Atomically claims visible properties needing conversion editorial. Uses row locking plus a JSON processing lease so overlapping cron instances cannot process the same property.';

revoke all on function public.claim_property_conversion_candidates(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_property_conversion_candidates(integer, integer) to service_role;
