-- Altovena-only durable internal operator alerts. NOT an email/SMS/push delivery system.
-- Additive and disabled unless a separately authorized scheduler explicitly runs the RPC.
-- Stores task identifiers and lifecycle state, NEVER customer messages or contact details.
create table if not exists public.altovena_lead_alerts (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  kind text not null check (kind in (
    'NOT_STARTED_15M','NOT_STARTED_24H','IN_PROGRESS_48H'
  )),
  state text not null default 'PENDING' check (state in ('PENDING','RESOLVED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (work_item_id,kind)
);
create index if not exists altovena_lead_alerts_pending_idx
  on public.altovena_lead_alerts(state,created_at) where state='PENDING';
alter table public.altovena_lead_alerts enable row level security;
revoke all on public.altovena_lead_alerts from public,anon,authenticated;
grant select,insert,update on public.altovena_lead_alerts to service_role;

-- One non-sensitive heartbeat makes it possible to detect a stalled scheduler;
-- a configured cron is NOT proof of a completed run.
create table if not exists public.altovena_alert_scan_state (
  brand_key text primary key check (brand_key='altovena'),
  last_scan_at timestamptz not null,
  queued_count integer not null default 0,
  resolved_count integer not null default 0,
  pending_count integer not null default 0
);
alter table public.altovena_alert_scan_state enable row level security;
revoke all on public.altovena_alert_scan_state from public,anon,authenticated;
grant select,insert,update on public.altovena_alert_scan_state to service_role;

-- Cron credentials and the explicit disabled-by-default application feature flag
-- are verified BEFORE entering this service-role-only routine.
-- A transaction-scoped advisory lock prevents concurrent scans from racing.
-- No recipients, message delivery, customer mutation or marketing opt-in occurs.
create or replace function public.altovena_reconcile_lead_alerts()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_added integer := 0;
  v_resolved integer := 0;
  v_pending integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('altovena:lead-alert-reconcile',0)
  );

  with eligible as (
    select id as task_id,'NOT_STARTED_15M'::text as alert_kind
    from public.work_items
    where brand_id='altovena' and source_type='website_lead'
      and status in ('TO_DO','REVIEW') and created_at<=now()-interval '15 minutes'
    union all
    select id,'NOT_STARTED_24H'
    from public.work_items
    where brand_id='altovena' and source_type='website_lead'
      and status in ('TO_DO','REVIEW') and created_at<=now()-interval '24 hours'
    union all
    select id,'IN_PROGRESS_48H'
    from public.work_items
    where brand_id='altovena' and source_type='website_lead'
      and status='IN_PROGRESS' and updated_at<=now()-interval '48 hours'
  )
  insert into public.altovena_lead_alerts(work_item_id,kind)
  select task_id,alert_kind from eligible
  on conflict (work_item_id,kind) do nothing;
  get diagnostics v_added = row_count;

  -- Resolve obsolete alerts after a human starts/completes the task.
  -- This is a lifecycle transition, not an acknowledgement or a sent message.
  update public.altovena_lead_alerts a
    set state='RESOLVED',resolved_at=now()
    where a.state='PENDING'
    and not exists (
      select 1 from public.work_items w
      where w.id=a.work_item_id
        and w.brand_id='altovena'
        and w.source_type='website_lead'
        and (
          (a.kind='NOT_STARTED_15M' and w.status in ('TO_DO','REVIEW')
            and w.created_at<=now()-interval '15 minutes')
          or
          (a.kind='NOT_STARTED_24H' and w.status in ('TO_DO','REVIEW')
            and w.created_at<=now()-interval '24 hours')
          or
          (a.kind='IN_PROGRESS_48H' and w.status='IN_PROGRESS'
            and w.updated_at<=now()-interval '48 hours')
        )
    );
  get diagnostics v_resolved = row_count;
  select count(*)::int into v_pending
  from public.altovena_lead_alerts where state='PENDING';

  insert into public.altovena_alert_scan_state(
    brand_key,last_scan_at,queued_count,resolved_count,pending_count
  ) values ('altovena',now(),v_added,v_resolved,v_pending)
  on conflict(brand_key) do update set
    last_scan_at=excluded.last_scan_at,
    queued_count=excluded.queued_count,
    resolved_count=excluded.resolved_count,
    pending_count=excluded.pending_count;

  return pg_catalog.jsonb_build_object(
    'ok',true,'brand','altovena','queued',v_added,
    'resolved',v_resolved,'pending',v_pending,'deliveryEnabled',false
  );
end $$;
revoke execute on function public.altovena_reconcile_lead_alerts()
  from public,anon,authenticated;
grant execute on function public.altovena_reconcile_lead_alerts() to service_role;
comment on function public.altovena_reconcile_lead_alerts() is
  'Service role only. Idempotent, brand-scoped internal alert ledger; absolutely no outbound delivery.';


-- Operator-specific, in-app READ receipts (NOT provider delivery receipts).
-- No email address or customer message is persisted in this table. The server
-- derives a recipient key using HMAC from an independently verified session;
-- browsers never choose recipients and never see the server's HMAC secret.
create table if not exists public.altovena_alert_reads (
  alert_id uuid not null references public.altovena_lead_alerts(id) on delete cascade,
  operator_key text not null check (operator_key ~ '^[a-f0-9]{64}$'),
  read_at timestamptz not null default now(),
  primary key(alert_id,operator_key)
);
create index if not exists altovena_alert_reads_operator_idx
  on public.altovena_alert_reads(operator_key,read_at desc);
alter table public.altovena_alert_reads enable row level security;
revoke all on public.altovena_alert_reads from public,anon,authenticated;
grant select,insert on public.altovena_alert_reads to service_role;

-- This service-role-only function is called ONLY after the API independently
-- verified a current brand grant (or true owner session) and derived the
-- server-secret HMAC. A caller-supplied operator key must never reach it.
create or replace function public.altovena_operator_alert_inbox(
  p_operator_key text, p_limit integer default 20
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
  v_alerts jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_unread integer := 0;
begin
  if p_operator_key is null or p_operator_key !~ '^[a-f0-9]{64}$'
    or p_limit is null or p_limit not between 1 and 30
  then raise exception 'Invalid operator inbox request'; end if;

  select count(*)::int,
         count(*) filter (where r.alert_id is null)::int
    into v_total,v_unread
    from public.altovena_lead_alerts a
    join public.work_items w on w.id=a.work_item_id
    left join public.altovena_alert_reads r
      on r.alert_id=a.id and r.operator_key=p_operator_key
    where a.state='PENDING' and w.brand_id='altovena'
      and w.source_type='website_lead';

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id',s.alert_id,'kind',s.alert_kind,
      'createdAt',s.created_at,
      'contactId',s.contact_id,
      'readAt',s.read_at
    ) order by s.is_read,s.severity,s.created_at,s.alert_id
  ),'[]'::jsonb) into v_alerts
  from (
    select a.id as alert_id,a.kind as alert_kind,
      a.created_at,
      case when w.source_id ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
        then w.source_id else null end as contact_id,
      r.read_at,
      case when r.read_at is null then 0 else 1 end as is_read,
      case a.kind when 'NOT_STARTED_24H' then 0
        when 'IN_PROGRESS_48H' then 1 else 2 end as severity
    from public.altovena_lead_alerts a
    join public.work_items w on w.id=a.work_item_id
    left join public.altovena_alert_reads r
      on r.alert_id=a.id and r.operator_key=p_operator_key
    where a.state='PENDING' and w.brand_id='altovena'
      and w.source_type='website_lead'
    order by case when r.read_at is null then 0 else 1 end,
      case a.kind when 'NOT_STARTED_24H' then 0
        when 'IN_PROGRESS_48H' then 1 else 2 end,
      a.created_at,a.id
    limit p_limit
  ) s;

  return pg_catalog.jsonb_build_object(
    'ok',true,'brand','altovena','alerts',v_alerts,
    'totalPending',v_total,'unreadTotal',v_unread,
    'emailSent',false,'externalDelivery',false
  );
end $$;
revoke execute on function public.altovena_operator_alert_inbox(text,integer)
  from public,anon,authenticated;
grant execute on function public.altovena_operator_alert_inbox(text,integer)
  to service_role;

-- Explicit user click only. This marks a specific alert READ for the caller,
-- never closes the shared lead task or marks it read for any other operator.
create or replace function public.altovena_ack_operator_alert(
  p_alert_id uuid,p_operator_key text
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
  v_read_at timestamptz;
begin
  if p_alert_id is null or p_operator_key is null
    or p_operator_key !~ '^[a-f0-9]{64}$'
  then raise exception 'Invalid operator acknowledgement'; end if;

  insert into public.altovena_alert_reads(alert_id,operator_key)
    select a.id,p_operator_key
    from public.altovena_lead_alerts a
    join public.work_items w on w.id=a.work_item_id
    where a.id=p_alert_id and a.state='PENDING'
      and w.brand_id='altovena' and w.source_type='website_lead'
  on conflict (alert_id,operator_key) do nothing;

  select r.read_at into v_read_at
    from public.altovena_alert_reads r
    join public.altovena_lead_alerts a on a.id=r.alert_id
    join public.work_items w on w.id=a.work_item_id
    where r.alert_id=p_alert_id and r.operator_key=p_operator_key
      and a.state='PENDING'
      and w.brand_id='altovena' and w.source_type='website_lead';
  if v_read_at is null then
    return pg_catalog.jsonb_build_object(
      'ok',false,'error','ALERT_NOT_PENDING_OR_NOT_FOUND'
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'ok',true,'brand','altovena','id',p_alert_id,'readAt',v_read_at,
    'emailSent',false,'externalDelivery',false
  );
end $$;
revoke execute on function public.altovena_ack_operator_alert(uuid,text)
  from public,anon,authenticated;
grant execute on function public.altovena_ack_operator_alert(uuid,text)
  to service_role;
