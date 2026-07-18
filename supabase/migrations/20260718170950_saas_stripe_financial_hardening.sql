-- SaaS + Stripe financial hardening
--
-- The original SaaS portfolio tables predate the tenant model and were
-- exposed through permissive RLS policies. They are now an internal control
-- plane, while customer-visible subscription data lives in `core` and is
-- protected by tenant membership policies.

-- ---------------------------------------------------------------------------
-- Lock legacy control-plane tables to the server role.
-- ---------------------------------------------------------------------------

drop policy if exists "Allow all on saas_apps" on public.saas_apps;
drop policy if exists "Allow all on saas_subscriptions" on public.saas_subscriptions;
drop policy if exists "Allow all on saas_analytics" on public.saas_analytics;
drop policy if exists "Allow all on saas_opportunities" on public.saas_opportunities;
drop policy if exists "Allow all on saas_discovery_runs" on public.saas_discovery_runs;

alter table public.saas_apps enable row level security;
alter table public.saas_subscriptions enable row level security;
alter table public.saas_analytics enable row level security;
alter table public.saas_opportunities enable row level security;
alter table public.saas_discovery_runs enable row level security;

revoke all privileges on table public.saas_apps from public, anon, authenticated;
revoke all privileges on table public.saas_subscriptions from public, anon, authenticated;
revoke all privileges on table public.saas_analytics from public, anon, authenticated;
revoke all privileges on table public.saas_opportunities from public, anon, authenticated;
revoke all privileges on table public.saas_discovery_runs from public, anon, authenticated;

grant all privileges on table public.saas_apps to service_role;
grant all privileges on table public.saas_subscriptions to service_role;
grant all privileges on table public.saas_analytics to service_role;
grant all privileges on table public.saas_opportunities to service_role;
grant all privileges on table public.saas_discovery_runs to service_role;

alter table public.saas_subscriptions
  add column if not exists tenant_id uuid references core.tenants(id) on delete set null,
  add column if not exists access_status text not null default 'active',
  add column if not exists grace_ends_at timestamptz,
  add column if not exists last_payment_failed_at timestamptz,
  add column if not exists last_payment_succeeded_at timestamptz;

alter table public.saas_subscriptions
  drop constraint if exists saas_subscriptions_access_status_check,
  add constraint saas_subscriptions_access_status_check
    check (access_status in ('active', 'grace', 'suspended'));

alter table public.saas_analytics
  add column if not exists tenant_id uuid references core.tenants(id) on delete set null;

create index if not exists saas_subscriptions_tenant_idx
  on public.saas_subscriptions (tenant_id) where tenant_id is not null;
create index if not exists saas_analytics_tenant_idx
  on public.saas_analytics (tenant_id) where tenant_id is not null;
create unique index if not exists saas_subscriptions_stripe_subscription_key
  on public.saas_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

comment on table public.saas_apps is
  'Legacy/internal SaaS product control plane. Browser access is intentionally revoked; sellable customer catalog lives in core.apps.';
comment on table public.saas_subscriptions is
  'Legacy/internal SaaS subscription projection. Customer tenant subscriptions live in core.tenant_subscriptions.';

-- ---------------------------------------------------------------------------
-- Stripe event inbox, invoice ledger and subscription access lifecycle.
-- ---------------------------------------------------------------------------

alter table core.tenant_subscriptions
  add column if not exists access_status text not null default 'active',
  add column if not exists grace_ends_at timestamptz,
  add column if not exists last_payment_failed_at timestamptz,
  add column if not exists last_payment_succeeded_at timestamptz;

alter table core.tenant_subscriptions
  drop constraint if exists core_tenant_subscriptions_access_status_check,
  add constraint core_tenant_subscriptions_access_status_check
    check (access_status in ('active', 'grace', 'suspended'));

create index if not exists core_tenant_subscriptions_grace_idx
  on core.tenant_subscriptions (grace_ends_at)
  where access_status = 'grace';

create table core.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  stripe_account_id text,
  livemode boolean not null default false,
  api_version text,
  payload jsonb not null,
  status text not null default 'processing',
  attempts integer not null default 1,
  tenant_id uuid references core.tenants(id) on delete set null,
  received_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  constraint core_stripe_webhook_events_status_check
    check (status in ('processing', 'processed', 'failed')),
  constraint core_stripe_webhook_events_attempts_check check (attempts > 0)
);

create index core_stripe_webhook_events_status_idx
  on core.stripe_webhook_events (status, last_attempt_at);
create index core_stripe_webhook_events_tenant_idx
  on core.stripe_webhook_events (tenant_id, received_at desc)
  where tenant_id is not null;

create table core.stripe_invoices (
  stripe_invoice_id text primary key,
  stripe_subscription_id text,
  tenant_id uuid references core.tenants(id) on delete set null,
  tenant_subscription_id uuid references core.tenant_subscriptions(id) on delete set null,
  legacy_subscription_id uuid references public.saas_subscriptions(id) on delete set null,
  legacy_app_id uuid references public.saas_apps(id) on delete set null,
  status text not null,
  amount_due_minor bigint not null default 0,
  amount_paid_minor bigint not null default 0,
  currency text not null,
  failure_code text,
  failure_message text,
  last_stripe_event_id text references core.stripe_webhook_events(event_id) on delete set null,
  attempted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint core_stripe_invoices_status_check
    check (status in ('open', 'paid', 'failed', 'void', 'refunded')),
  constraint core_stripe_invoices_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint core_stripe_invoices_amounts_check
    check (amount_due_minor >= 0 and amount_paid_minor >= 0)
);

create index core_stripe_invoices_subscription_idx
  on core.stripe_invoices (stripe_subscription_id, created_at desc);
create index core_stripe_invoices_tenant_idx
  on core.stripe_invoices (tenant_id, created_at desc)
  where tenant_id is not null;

alter table public.demo_site_order_events
  add column if not exists stripe_event_id text;
create unique index if not exists demo_site_order_events_stripe_event_key
  on public.demo_site_order_events (stripe_event_id)
  where stripe_event_id is not null;

alter table core.stripe_webhook_events enable row level security;
alter table core.stripe_invoices enable row level security;

create policy core_stripe_invoices_member_read on core.stripe_invoices
  for select to authenticated
  using (tenant_id is not null and (select core.is_tenant_member(tenant_id)));

revoke all privileges on table core.stripe_webhook_events from public, anon, authenticated;
revoke insert, update, delete on table core.stripe_invoices from public, anon, authenticated;
grant select on table core.stripe_invoices to authenticated, service_role;
grant all privileges on table core.stripe_webhook_events to service_role;
grant insert, update, delete on table core.stripe_invoices to service_role;

-- Atomically claims an event. Failed events and processing attempts that have
-- been abandoned for 15 minutes can be retried; completed events cannot.
create or replace function public.saas_claim_stripe_event(
  p_event_id text,
  p_event_type text,
  p_stripe_account_id text,
  p_livemode boolean,
  p_api_version text,
  p_payload jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed boolean;
begin
  if nullif(btrim(p_event_id), '') is null or nullif(btrim(p_event_type), '') is null then
    raise exception 'Stripe event id and type are required';
  end if;

  insert into core.stripe_webhook_events (
    event_id, event_type, stripe_account_id, livemode, api_version, payload
  ) values (
    p_event_id, p_event_type, nullif(p_stripe_account_id, ''),
    coalesce(p_livemode, false), nullif(p_api_version, ''), coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (event_id) do update set
    event_type = excluded.event_type,
    stripe_account_id = excluded.stripe_account_id,
    livemode = excluded.livemode,
    api_version = excluded.api_version,
    payload = excluded.payload,
    status = 'processing',
    attempts = core.stripe_webhook_events.attempts + 1,
    last_attempt_at = now(),
    processed_at = null,
    error_message = null
  where core.stripe_webhook_events.status = 'failed'
     or (
       core.stripe_webhook_events.status = 'processing'
       and core.stripe_webhook_events.last_attempt_at < now() - interval '15 minutes'
     )
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function public.saas_complete_stripe_event(
  p_event_id text,
  p_tenant_id uuid default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update core.stripe_webhook_events
  set status = 'processed', processed_at = now(), error_message = null,
      tenant_id = coalesce(p_tenant_id, tenant_id)
  where event_id = p_event_id and status = 'processing';
$$;

create or replace function public.saas_fail_stripe_event(
  p_event_id text,
  p_error_message text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update core.stripe_webhook_events
  set status = 'failed', error_message = left(coalesce(p_error_message, 'Unknown webhook error'), 2000)
  where event_id = p_event_id and status = 'processing';
$$;

-- Synchronizes payment/subscription state and access in one database
-- transaction. The raw event inbox remains the immutable audit source.
create or replace function public.saas_sync_stripe_billing_state(
  p_event_id text,
  p_event_type text,
  p_object jsonb,
  p_grace_days integer default 7
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  external_subscription_id text;
  invoice_id text;
  core_subscription core.tenant_subscriptions%rowtype;
  legacy_subscription public.saas_subscriptions%rowtype;
  normalized_status text;
  normalized_access text;
  invoice_status text;
  previous_invoice_status text;
  amount_due bigint := greatest(coalesce((p_object ->> 'amount_due')::bigint, 0), 0);
  amount_paid bigint := greatest(coalesce((p_object ->> 'amount_paid')::bigint, 0), 0);
  currency_value text := upper(coalesce(nullif(p_object ->> 'currency', ''), 'USD'));
  transition_at timestamptz := now();
  first_paid_transition boolean := false;
begin
  if p_grace_days < 0 or p_grace_days > 90 then
    raise exception 'Grace days must be between 0 and 90';
  end if;

  external_subscription_id := nullif(coalesce(
    p_object ->> 'subscription',
    p_object #>> '{parent,subscription_details,subscription}',
    case when p_event_type like 'customer.subscription.%' then p_object ->> 'id' end
  ), '');

  if external_subscription_id is not null then
    select s.* into core_subscription
    from core.tenant_subscriptions s
    where s.provider = 'stripe' and s.external_subscription_id = external_subscription_id
    limit 1;

    select s.* into legacy_subscription
    from public.saas_subscriptions s
    where s.stripe_subscription_id = external_subscription_id
    limit 1;
  end if;

  if p_event_type in ('invoice.paid', 'invoice.payment_failed') then
    invoice_id := nullif(p_object ->> 'id', '');
    if invoice_id is null then raise exception 'Stripe invoice id is required'; end if;

    select i.status into previous_invoice_status
    from core.stripe_invoices i
    where i.stripe_invoice_id = invoice_id
    for update;

    invoice_status := case when p_event_type = 'invoice.paid' then 'paid' else 'failed' end;
    first_paid_transition := invoice_status = 'paid' and previous_invoice_status is distinct from 'paid';

    insert into core.stripe_invoices (
      stripe_invoice_id, stripe_subscription_id, tenant_id, tenant_subscription_id,
      legacy_subscription_id, legacy_app_id, status, amount_due_minor,
      amount_paid_minor, currency, failure_code, failure_message,
      last_stripe_event_id, attempted_at, paid_at, metadata
    ) values (
      invoice_id, external_subscription_id, core_subscription.tenant_id, core_subscription.id,
      legacy_subscription.id, legacy_subscription.app_id, invoice_status, amount_due,
      amount_paid, currency_value,
      nullif(coalesce(p_object #>> '{last_finalization_error,code}', p_object #>> '{payment_intent,last_payment_error,code}'), ''),
      nullif(coalesce(p_object #>> '{last_finalization_error,message}', p_object #>> '{payment_intent,last_payment_error,message}'), ''),
      p_event_id, transition_at,
      case when invoice_status = 'paid' then transition_at end,
      jsonb_build_object('number', p_object ->> 'number', 'billing_reason', p_object ->> 'billing_reason')
    )
    on conflict (stripe_invoice_id) do update set
      stripe_subscription_id = excluded.stripe_subscription_id,
      tenant_id = coalesce(excluded.tenant_id, core.stripe_invoices.tenant_id),
      tenant_subscription_id = coalesce(excluded.tenant_subscription_id, core.stripe_invoices.tenant_subscription_id),
      legacy_subscription_id = coalesce(excluded.legacy_subscription_id, core.stripe_invoices.legacy_subscription_id),
      legacy_app_id = coalesce(excluded.legacy_app_id, core.stripe_invoices.legacy_app_id),
      status = excluded.status,
      amount_due_minor = excluded.amount_due_minor,
      amount_paid_minor = excluded.amount_paid_minor,
      currency = excluded.currency,
      failure_code = excluded.failure_code,
      failure_message = excluded.failure_message,
      last_stripe_event_id = excluded.last_stripe_event_id,
      attempted_at = excluded.attempted_at,
      paid_at = coalesce(excluded.paid_at, core.stripe_invoices.paid_at),
      updated_at = now(),
      metadata = core.stripe_invoices.metadata || excluded.metadata;
  end if;

  normalized_status := case
    when p_event_type = 'invoice.paid' then 'active'
    when p_event_type = 'invoice.payment_failed' then 'past_due'
    when p_event_type = 'customer.subscription.deleted' then 'cancelled'
    when p_object ->> 'status' = 'trialing' then 'trialing'
    when p_object ->> 'status' = 'active' then 'active'
    when p_object ->> 'status' = 'past_due' then 'past_due'
    when p_object ->> 'status' in ('canceled', 'cancelled') then 'cancelled'
    when p_object ->> 'status' in ('unpaid', 'incomplete', 'incomplete_expired', 'paused') then 'suspended'
    else null
  end;

  normalized_access := case
    when normalized_status in ('active', 'trialing') then 'active'
    when normalized_status = 'past_due' then 'grace'
    when normalized_status in ('suspended', 'cancelled', 'expired') then 'suspended'
    else null
  end;

  if core_subscription.id is not null and normalized_status is not null then
    update core.tenant_subscriptions s set
      status = normalized_status,
      access_status = normalized_access,
      grace_ends_at = case
        when normalized_access = 'grace' then coalesce(s.grace_ends_at, now() + make_interval(days => p_grace_days))
        else null
      end,
      last_payment_failed_at = case when p_event_type = 'invoice.payment_failed' then transition_at else s.last_payment_failed_at end,
      last_payment_succeeded_at = case when p_event_type = 'invoice.paid' then transition_at else s.last_payment_succeeded_at end,
      cancel_at_period_end = coalesce((p_object ->> 'cancel_at_period_end')::boolean, s.cancel_at_period_end),
      current_period_ends_at = case
        when nullif(p_object ->> 'current_period_end', '') is not null
          then to_timestamp((p_object ->> 'current_period_end')::double precision)
        else s.current_period_ends_at
      end,
      updated_at = now()
    where s.id = core_subscription.id;

    update core.tenant_apps ta set
      enabled = normalized_access in ('active', 'grace'),
      status = case
        when normalized_status = 'suspended' then 'suspended'
        else normalized_status
      end,
      updated_at = now()
    where ta.tenant_id = core_subscription.tenant_id
      and ta.app_id = core_subscription.app_id;

    if normalized_access = 'active' then
      update core.tenant_modules tm set
        status = case when normalized_status = 'trialing' then 'trialing' else 'active' end,
        ends_at = null,
        updated_at = now()
      where tm.tenant_id = core_subscription.tenant_id
        and tm.source = 'plan'
        and tm.module_id in (
          select am.module_id from core.app_modules am where am.app_id = core_subscription.app_id
        );

      update core.tenant_entitlements te set
        status = 'active', ends_at = null, updated_at = now()
      where te.tenant_id = core_subscription.tenant_id
        and te.source = 'plan'
        and te.module_id in (
          select am.module_id from core.app_modules am where am.app_id = core_subscription.app_id
        );
    elsif normalized_access = 'suspended' then
      update core.tenant_modules tm set status = 'suspended', updated_at = now()
      where tm.tenant_id = core_subscription.tenant_id
        and tm.source = 'plan'
        and tm.module_id in (
          select am.module_id from core.app_modules am where am.app_id = core_subscription.app_id
        );

      update core.tenant_entitlements te set status = 'revoked', updated_at = now()
      where te.tenant_id = core_subscription.tenant_id
        and te.source = 'plan'
        and te.module_id in (
          select am.module_id from core.app_modules am where am.app_id = core_subscription.app_id
        );
    end if;
  end if;

  if legacy_subscription.id is not null and normalized_status is not null then
    update public.saas_subscriptions s set
      status = case when normalized_status = 'suspended' then 'past_due' else normalized_status end,
      access_status = normalized_access,
      grace_ends_at = case
        when normalized_access = 'grace' then coalesce(s.grace_ends_at, now() + make_interval(days => p_grace_days))
        else null
      end,
      last_payment_failed_at = case when p_event_type = 'invoice.payment_failed' then transition_at else s.last_payment_failed_at end,
      last_payment_succeeded_at = case when p_event_type = 'invoice.paid' then transition_at else s.last_payment_succeeded_at end,
      cancelled_at = case when normalized_status = 'cancelled' then coalesce(s.cancelled_at, transition_at) else s.cancelled_at end,
      next_billing_at = case
        when nullif(p_object ->> 'current_period_end', '') is not null
          then to_timestamp((p_object ->> 'current_period_end')::double precision)
        else s.next_billing_at
      end,
      updated_at = now()
    where s.id = legacy_subscription.id;
  end if;

  if first_paid_transition and legacy_subscription.app_id is not null then
    update public.saas_apps
    set total_revenue = coalesce(total_revenue, 0) + amount_paid::numeric / 100,
        updated_at = now()
    where id = legacy_subscription.app_id;

    insert into public.saas_analytics (app_id, tenant_id, date, revenue)
    values (legacy_subscription.app_id, legacy_subscription.tenant_id, current_date, amount_paid::numeric / 100)
    on conflict (app_id, date) do update set
      revenue = coalesce(public.saas_analytics.revenue, 0) + excluded.revenue;
  end if;

  update core.stripe_webhook_events
  set tenant_id = coalesce(core_subscription.tenant_id, tenant_id)
  where event_id = p_event_id;

  return jsonb_build_object(
    'tenantId', core_subscription.tenant_id,
    'tenantSubscriptionId', core_subscription.id,
    'legacySubscriptionId', legacy_subscription.id,
    'legacyAppId', legacy_subscription.app_id,
    'status', normalized_status,
    'accessStatus', normalized_access,
    'firstPaidTransition', first_paid_transition
  );
end;
$$;

-- Daily enforcement after the payment grace period. Access is not suspended
-- on the first failed payment; only subscriptions whose grace deadline passed
-- are disabled here. A later invoice.paid event reactivates them.
create or replace function public.saas_enforce_subscription_grace_periods()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  expired_core_ids uuid[];
  expired_legacy_count integer;
begin
  select coalesce(array_agg(s.id), '{}'::uuid[]) into expired_core_ids
  from core.tenant_subscriptions s
  where s.status = 'past_due'
    and s.access_status = 'grace'
    and s.grace_ends_at <= now();

  update core.tenant_subscriptions s
  set status = 'suspended', access_status = 'suspended', updated_at = now()
  where s.id = any(expired_core_ids);

  update core.tenant_apps ta
  set enabled = false, status = 'suspended', updated_at = now()
  from core.tenant_subscriptions s
  where s.id = any(expired_core_ids)
    and ta.tenant_id = s.tenant_id and ta.app_id = s.app_id;

  update core.tenant_modules tm set status = 'suspended', updated_at = now()
  from core.tenant_subscriptions s
  where s.id = any(expired_core_ids)
    and tm.tenant_id = s.tenant_id
    and tm.source = 'plan'
    and tm.module_id in (
      select am.module_id from core.app_modules am where am.app_id = s.app_id
    );

  update core.tenant_entitlements te set status = 'revoked', updated_at = now()
  from core.tenant_subscriptions s
  where s.id = any(expired_core_ids)
    and te.tenant_id = s.tenant_id
    and te.source = 'plan'
    and te.module_id in (
      select am.module_id from core.app_modules am where am.app_id = s.app_id
    );

  update public.saas_subscriptions
  set access_status = 'suspended', updated_at = now()
  where status = 'past_due' and access_status = 'grace' and grace_ends_at <= now();
  get diagnostics expired_legacy_count = row_count;

  return jsonb_build_object(
    'coreSuspended', cardinality(expired_core_ids),
    'legacySuspended', expired_legacy_count,
    'enforcedAt', now()
  );
end;
$$;

revoke execute on function public.saas_claim_stripe_event(text, text, text, boolean, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.saas_complete_stripe_event(text, uuid)
  from public, anon, authenticated;
revoke execute on function public.saas_fail_stripe_event(text, text)
  from public, anon, authenticated;
revoke execute on function public.saas_sync_stripe_billing_state(text, text, jsonb, integer)
  from public, anon, authenticated;
revoke execute on function public.saas_enforce_subscription_grace_periods()
  from public, anon, authenticated;

grant execute on function public.saas_claim_stripe_event(text, text, text, boolean, text, jsonb)
  to service_role;
grant execute on function public.saas_complete_stripe_event(text, uuid)
  to service_role;
grant execute on function public.saas_fail_stripe_event(text, text)
  to service_role;
grant execute on function public.saas_sync_stripe_billing_state(text, text, jsonb, integer)
  to service_role;
grant execute on function public.saas_enforce_subscription_grace_periods()
  to service_role;
