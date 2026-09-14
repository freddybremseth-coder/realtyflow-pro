-- Property Conversion V6 claim v3.
-- A per-run token makes the claim state observable and verifiable after the RPC
-- returns. The worker must re-read the rows and process only rows that still
-- carry this exact token and processing state.

create or replace function public.claim_property_conversion_candidates_v3(
  p_limit integer default 6,
  p_stale_minutes integer default 20,
  p_claim_token text default null
)
returns table (
  id uuid,
  ref text,
  claim_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim_token text := nullif(pg_catalog.btrim(coalesce(p_claim_token, '')), '');
begin
  if v_claim_token is null then
    raise exception 'PROPERTY_CONVERSION_CLAIM_TOKEN_REQUIRED';
  end if;

  update public.properties
  set conversion_no = null
  where conversion_no ->> 'status' = 'processing'
    and nullif(conversion_no ->> 'claimed_at', '') is not null
    and (conversion_no ->> 'claimed_at')::timestamptz
      < pg_catalog.now() - pg_catalog.make_interval(mins => greatest(p_stale_minutes, 1));

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
  ), claimed as (
    update public.properties p
    set conversion_no = pg_catalog.jsonb_build_object(
      'status', 'processing',
      'version', 'conversion-v6',
      'claimed_at', pg_catalog.clock_timestamp(),
      'claim_token', v_claim_token
    )
    from candidates c
    where p.id = c.id
    returning p.id, p.ref, p.conversion_no ->> 'claim_token' as claim_token
  )
  select c.id, c.ref, c.claim_token
  from claimed c
  where c.claim_token = v_claim_token;
end;
$$;

revoke all on function public.claim_property_conversion_candidates_v3(integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.claim_property_conversion_candidates_v3(integer, integer, text)
  to service_role;
