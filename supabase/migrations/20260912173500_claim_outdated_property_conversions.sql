-- Backfill old property conversion JSON to the current V6 contract.
--
-- Earlier claim logic only picked rows where conversion_no IS NULL. That left
-- old conversion-v1 rows looking "done" even though they had not been upgraded
-- to the stricter V6 public-copy contract.

create or replace function public.claim_property_conversion_candidates_v2(
  p_limit integer default 6,
  p_stale_minutes integer default 20
)
returns setof public.properties
language plpgsql
security definer
set search_path = public
as $$
begin
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
    where coalesce(p.show_on_website, true) = true
      and coalesce(p.website_visible, true) = true
      and coalesce(p.conversion_no ->> 'status', '') not in ('processing', 'failed')
      and (
        p.conversion_no is null
        or coalesce(p.conversion_no ->> 'version', '') <> 'conversion-v6'
      )
    order by p.created_at desc
    for update skip locked
    limit greatest(1, least(p_limit, 24))
  )
  update public.properties p
  set conversion_no = jsonb_build_object(
    'status', 'processing',
    'version', 'conversion-v6',
    'claimed_at', now()
  )
  from candidates c
  where p.id = c.id
  returning p.*;
end;
$$;

comment on function public.claim_property_conversion_candidates_v2(integer, integer) is
  'Atomically claims visible properties needing conversion editorial, including outdated non-V6 conversion JSON. Processing and failed rows remain protected from immediate reclaims.';

revoke all on function public.claim_property_conversion_candidates_v2(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_property_conversion_candidates_v2(integer, integer) to service_role;
