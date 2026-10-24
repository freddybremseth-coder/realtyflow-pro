-- Operator email delivery candidate queue: PREPARATION ONLY.
-- NO provider sends, no sent/delivered state, no recipient emails, no contact messages.
-- All entries remain safe-to-delete drafts until a separately reviewed dispatch exists.
create table if not exists public.altovena_delivery_candidates (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.altovena_lead_alerts(id) on delete cascade,
  operator_key text not null check (operator_key ~ '^[a-f0-9]{64}$'),
  channel text not null default 'email' check (channel='email'),
  state text not null default 'PREPARED' check (state in ('PREPARED','CANCELLED')),
  prepared_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (alert_id,operator_key,channel)
);
create index if not exists altovena_delivery_candidates_operator_idx
  on public.altovena_delivery_candidates(operator_key,state,prepared_at desc);
alter table public.altovena_delivery_candidates enable row level security;
revoke all on public.altovena_delivery_candidates from public,anon,authenticated;
grant select,insert,update on public.altovena_delivery_candidates to service_role;

-- Atomic transaction lock + single-recipient, brand-scoped preparation.
-- The server MUST first validate this recipient's current Altovena grant AND
-- independently re-check the corresponding Supabase Auth user.
-- Owner identity is only accepted via the configured admin-email allowlist.
-- The operator key is derived via HMAC in server code, NEVER passed from clients.
-- Only 24h unstarted and 48h stalled internal alerts qualify for future email.
create or replace function public.altovena_prepare_operator_delivery(
  p_operator_key text,p_limit integer default 20
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
  v_prepared integer:=0;
  v_cancelled integer:=0;
  v_pending integer:=0;
begin
  if p_operator_key is null or p_operator_key !~ '^[a-f0-9]{64}$'
    or p_limit is null or p_limit not between 1 and 20 then
    raise exception 'Invalid Altovena delivery preparation';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('altovena:delivery-prep:'||p_operator_key,0)
  );

  -- Never resurrect a previously cancelled candidate; old alert IDs cannot
  -- become a fresh delivery request after a task status transition.
  with eligible as (
    select a.id
    from public.altovena_lead_alerts a
    join public.work_items w on w.id=a.work_item_id
    where a.state='PENDING'
      and a.kind in ('NOT_STARTED_24H','IN_PROGRESS_48H')
      and w.brand_id='altovena'
      and w.source_type='website_lead'
      and ( (a.kind='NOT_STARTED_24H' and w.status in ('TO_DO','REVIEW')
                and w.created_at <= now()-interval '24 hours')
         or (a.kind='IN_PROGRESS_48H' and w.status='IN_PROGRESS'
                and w.updated_at <= now()-interval '48 hours') )
    order by a.created_at,a.id
    limit p_limit
  )
  insert into public.altovena_delivery_candidates(alert_id,operator_key,channel)
  select id,p_operator_key,'email' from eligible
  on conflict(alert_id,operator_key,channel) do nothing;
  get diagnostics v_prepared = row_count;

  -- Cancel obsolete candidates, including ones that became ineligible before
  -- the next alert scan. No automatic restart, no attempts, no external sends.
  update public.altovena_delivery_candidates c
     set state='CANCELLED',cancelled_at=now()
   where c.operator_key=p_operator_key and c.state='PREPARED'
     and not exists (
       select 1
       from public.altovena_lead_alerts a
       join public.work_items w on w.id=a.work_item_id
       where a.id=c.alert_id and a.state='PENDING'
         and a.kind in ('NOT_STARTED_24H','IN_PROGRESS_48H')
         and w.brand_id='altovena' and w.source_type='website_lead'
         and ( (a.kind='NOT_STARTED_24H' and w.status in ('TO_DO','REVIEW')
                  and w.created_at<=now()-interval '24 hours')
            or (a.kind='IN_PROGRESS_48H' and w.status='IN_PROGRESS'
                  and w.updated_at<=now()-interval '48 hours') )
     );
  get diagnostics v_cancelled = row_count;

  select count(*)::integer into v_pending
  from public.altovena_delivery_candidates
  where operator_key=p_operator_key and state='PREPARED';

  return pg_catalog.jsonb_build_object(
    'ok',true,'brand','altovena','newCandidates',v_prepared,
    'cancelledCandidates',v_cancelled,'preparedTotal',v_pending,
    'deliveryAttempted',false,'emailSent',false
  );
end $$;
revoke execute on function public.altovena_prepare_operator_delivery(text,integer)
  from public,anon,authenticated;
grant execute on function public.altovena_prepare_operator_delivery(text,integer)
  to service_role;

-- Operator cannot infer another person's candidates, and a candidate
-- cannot be marked as emailed/delivered by any RPC in this migration.
create or replace function public.altovena_operator_delivery_preflight(
  p_operator_key text
) returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare
  v_prepared integer:=0;
  v_cancelled integer:=0;
begin
  if p_operator_key is null or p_operator_key !~ '^[a-f0-9]{64}$'
    then raise exception 'Invalid operator preflight'; end if;

  select count(*) filter(where state='PREPARED')::integer,
         count(*) filter(where state='CANCELLED')::integer
  into v_prepared,v_cancelled
  from public.altovena_delivery_candidates
  where operator_key=p_operator_key;
  return pg_catalog.jsonb_build_object(
    'ok',true,'brand','altovena','prepared',v_prepared,
    'cancelled',v_cancelled,'deliveryAttempted',false,'emailSent',false
  );
end $$;
revoke execute on function public.altovena_operator_delivery_preflight(text)
  from public,anon,authenticated;
grant execute on function public.altovena_operator_delivery_preflight(text)
  to service_role;
