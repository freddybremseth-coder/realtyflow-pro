-- Only a separate staging-only dispatch route may execute these service-role-only
-- RPCs. Preflight candidates remain PREPARED/CANCELLED. An ATTEMPTING row
-- consumes its candidate FOREVER, including after timeout/crash; no blind retries.
-- SMTP_ACCEPTED is merely server acceptance, NEVER delivery/open confirmation.
create table if not exists public.altovena_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique
    references public.altovena_delivery_candidates(id) on delete cascade,
  state text not null default 'ATTEMPTING'
    check (state in ('ATTEMPTING','SMTP_ACCEPTED','OUTCOME_UNKNOWN')),
  claimed_at timestamptz not null default now(),
  finalized_at timestamptz,
  smtp_message_id text check (smtp_message_id is null or
    (length(smtp_message_id) between 3 and 255 and
     smtp_message_id !~ '[[:cntrl:]]')),
  check ((state='ATTEMPTING' and finalized_at is null and smtp_message_id is null)
     or (state='OUTCOME_UNKNOWN' and finalized_at is not null and smtp_message_id is null)
     or (state='SMTP_ACCEPTED' and finalized_at is not null and smtp_message_id is not null))
);
create index if not exists altovena_delivery_attempts_state_time_idx
  on public.altovena_delivery_attempts(state,claimed_at);
alter table public.altovena_delivery_attempts enable row level security;
revoke all on public.altovena_delivery_attempts from public,anon,authenticated;
grant select,insert,update on public.altovena_delivery_attempts to service_role;

-- Claim exactly one eligible candidate atomically. Never return an email,
-- customer text, or an identity token. Explicit server-side recipient verification
-- must occur before each claim; browser-supplied operator keys are prohibited.
create or replace function public.altovena_claim_operator_smtp(
  p_operator_key text
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_candidate uuid;
declare v_attempt uuid;
declare v_kind text;
begin
  if p_operator_key is null or p_operator_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid operator key';
  end if;
  -- Per operator, fixed global lock prevents concurrent invocations selecting
  -- the same prepared candidate before the INSERT uniqueness check.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('altovena:smtp-claim:'||p_operator_key,0)
  );
  select c.id,a.kind into v_candidate,v_kind
  from public.altovena_delivery_candidates c
  join public.altovena_lead_alerts a on a.id=c.alert_id
  join public.work_items w on w.id=a.work_item_id
  where c.operator_key=p_operator_key and c.state='PREPARED'
    and c.channel='email' and a.state='PENDING'
    and a.kind in ('NOT_STARTED_24H','IN_PROGRESS_48H')
    and w.brand_id='altovena' and w.source_type='website_lead'
    and ((a.kind='NOT_STARTED_24H' and w.status in ('TO_DO','REVIEW')
             and w.created_at<=now()-interval '24 hours')
     or (a.kind='IN_PROGRESS_48H' and w.status='IN_PROGRESS'
             and w.updated_at<=now()-interval '48 hours'))
    and not exists (select 1 from public.altovena_delivery_attempts t
                    where t.candidate_id=c.id)
  order by c.prepared_at,c.id limit 1;
  if v_candidate is null then
    return pg_catalog.jsonb_build_object(
      'ok',true,'brand','altovena','claimed',false,
      'smtpAccepted',false,'delivered',false
    );
  end if;
  insert into public.altovena_delivery_attempts(candidate_id)
  values (v_candidate) returning id into v_attempt;

  return pg_catalog.jsonb_build_object(
    'ok',true,'brand','altovena','claimed',true,
    'attemptId',v_attempt,'kind',v_kind,
    'smtpAccepted',false,'delivered',false
  );
end $$;
revoke execute on function public.altovena_claim_operator_smtp(text)
  from public,anon,authenticated;
grant execute on function public.altovena_claim_operator_smtp(text)
  to service_role;

-- Finalize once. An unsuccessful call, timeout, thrown transport exception,
-- missing SMTP message-id or process crash must never cause an automatic retry.
create or replace function public.altovena_finalize_operator_smtp(
  p_attempt_id uuid,p_operator_key text,p_outcome text,
  p_message_id text default null
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_state text;
declare v_message text;
begin
  if p_attempt_id is null or p_operator_key is null
    or p_operator_key !~ '^[a-f0-9]{64}$'
    or p_outcome not in ('SMTP_ACCEPTED','OUTCOME_UNKNOWN')
    or (p_outcome='SMTP_ACCEPTED' and
       (p_message_id is null or length(p_message_id) not between 3 and 255
        or p_message_id ~ '[[:cntrl:]]'))
    or (p_outcome='OUTCOME_UNKNOWN' and p_message_id is not null)
  then raise exception 'Invalid SMTP outcome'; end if;

  update public.altovena_delivery_attempts t
    set state=p_outcome,
        finalized_at=now(),
        smtp_message_id=case when p_outcome='SMTP_ACCEPTED'
          then p_message_id else null end
  from public.altovena_delivery_candidates c
  where t.id=p_attempt_id and c.id=t.candidate_id
    and c.operator_key=p_operator_key
    and t.state='ATTEMPTING'
  returning t.state,t.smtp_message_id into v_state,v_message;
  if v_state is null then
    -- Do not permit a second result to overwrite the first. A repeated
    -- finalization is never permission to send another SMTP message.
    select t.state,t.smtp_message_id into v_state,v_message
    from public.altovena_delivery_attempts t
    join public.altovena_delivery_candidates c on c.id=t.candidate_id
    where t.id=p_attempt_id and c.operator_key=p_operator_key;
  end if;
  if v_state is null then
    return pg_catalog.jsonb_build_object(
      'ok',false,'error','UNKNOWN_ATTEMPT'
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'ok',true,'brand','altovena','state',v_state,
    'smtpAccepted',v_state='SMTP_ACCEPTED','delivered',false
  );
end $$;
revoke execute on function public.altovena_finalize_operator_smtp(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.altovena_finalize_operator_smtp(uuid,text,text,text)
  to service_role;

-- Counts include ATTEMPTING, even if hours old: these are ambiguous and
-- require manual investigation before any fresh attempt is considered.
create or replace function public.altovena_operator_smtp_status(p_operator_key text)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare v_attempting integer:=0;v_accepted integer:=0;v_unknown integer:=0;
begin
  if p_operator_key is null or p_operator_key !~ '^[a-f0-9]{64}$'
    then raise exception 'Invalid operator key'; end if;
  select count(*) filter(where t.state='ATTEMPTING')::integer,
         count(*) filter(where t.state='SMTP_ACCEPTED')::integer,
         count(*) filter(where t.state='OUTCOME_UNKNOWN')::integer
  into v_attempting,v_accepted,v_unknown
  from public.altovena_delivery_attempts t
  join public.altovena_delivery_candidates c on c.id=t.candidate_id
  where c.operator_key=p_operator_key;
  return pg_catalog.jsonb_build_object(
    'ok',true,'brand','altovena','attempting',v_attempting,
    'smtpAccepted',v_accepted,'outcomeUnknown',v_unknown,
    'deliveryConfirmed',false
  );
end $$;
revoke execute on function public.altovena_operator_smtp_status(text)
  from public,anon,authenticated;
grant execute on function public.altovena_operator_smtp_status(text)
  to service_role;
