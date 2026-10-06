-- Preserve the actual Stripe billing cycle on the canonical Spanish subscription.

drop function if exists public.spanish_bind_stripe_subscription(
  uuid,text,text,text,timestamptz,timestamptz,boolean
);

create or replace function public.spanish_bind_stripe_subscription(
  p_tenant_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean default false,
  p_billing_cycle text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  app_id_value uuid;
  plan_id_value uuid;
  sub_id_value uuid;
  normalized_status text;
  normalized_access text;
  tenant_app_status text;
  normalized_cycle text;
begin
  if p_tenant_id is null then raise exception 'Tenant id is required'; end if;
  if nullif(btrim(p_subscription_id),'') is null then raise exception 'Stripe subscription id is required'; end if;

  select id into app_id_value from core.apps where slug='spanish';
  select p.id into plan_id_value
  from core.plans p where p.app_id=app_id_value and p.slug='premium' limit 1;

  normalized_cycle := case when p_billing_cycle='yearly' then 'yearly' else 'monthly' end;

  normalized_status := case
    when p_status in ('active','trialing','past_due') then p_status
    when p_status in ('canceled','cancelled') then 'cancelled'
    when p_status='paused' then 'suspended'
    when p_status='incomplete_expired' then 'expired'
    else 'suspended'
  end;

  normalized_access := case
    when normalized_status in ('active','trialing') then 'active'
    when normalized_status='past_due' then 'grace'
    else 'suspended'
  end;

  tenant_app_status := case
    when normalized_status='active' then 'active'
    when normalized_status='trialing' then 'trialing'
    when normalized_status='past_due' then 'past_due'
    when normalized_status='cancelled' then 'cancelled'
    else 'suspended'
  end;

  insert into core.tenant_subscriptions (
    tenant_id,app_id,plan_id,status,provider,
    external_customer_id,external_subscription_id,
    trial_ends_at,current_period_starts_at,current_period_ends_at,
    cancel_at_period_end,metadata,access_status,grace_ends_at,
    last_payment_failed_at,last_payment_succeeded_at
  ) values (
    p_tenant_id,app_id_value,plan_id_value,normalized_status,'stripe',
    nullif(btrim(p_customer_id),''),btrim(p_subscription_id),
    case when normalized_status='trialing' then p_period_end end,
    p_period_start,p_period_end,coalesce(p_cancel_at_period_end,false),
    jsonb_build_object('access_kind','paid','source','stripe','billing_cycle',normalized_cycle),
    normalized_access,
    case when normalized_access='grace' then now()+interval '7 days' end,
    case when normalized_status='past_due' then now() end,
    case when normalized_status in ('active','trialing') then now() end
  )
  on conflict (tenant_id,app_id) do update set
    plan_id=excluded.plan_id,status=excluded.status,provider='stripe',
    external_customer_id=excluded.external_customer_id,
    external_subscription_id=excluded.external_subscription_id,
    trial_ends_at=excluded.trial_ends_at,
    current_period_starts_at=excluded.current_period_starts_at,
    current_period_ends_at=excluded.current_period_ends_at,
    cancel_at_period_end=excluded.cancel_at_period_end,
    metadata=core.tenant_subscriptions.metadata || excluded.metadata,
    access_status=excluded.access_status,grace_ends_at=excluded.grace_ends_at,
    last_payment_failed_at=coalesce(excluded.last_payment_failed_at,core.tenant_subscriptions.last_payment_failed_at),
    last_payment_succeeded_at=coalesce(excluded.last_payment_succeeded_at,core.tenant_subscriptions.last_payment_succeeded_at),
    updated_at=now()
  returning id into sub_id_value;

  insert into core.tenant_apps (
    tenant_id,app_id,enabled,settings,status,source,starts_at,ends_at,updated_at
  ) values (
    p_tenant_id,app_id_value,normalized_access in ('active','grace'),
    jsonb_build_object('access_kind','paid','billing_cycle',normalized_cycle),
    tenant_app_status,'stripe',coalesce(p_period_start,now()),
    case when tenant_app_status in ('cancelled','suspended') then coalesce(p_period_end,now()) else p_period_end end,
    now()
  )
  on conflict (tenant_id,app_id) do update set
    enabled=excluded.enabled,settings=core.tenant_apps.settings || excluded.settings,
    status=excluded.status,source='stripe',starts_at=excluded.starts_at,
    ends_at=excluded.ends_at,updated_at=now();

  update core.tenant_entitlements
  set status=case when normalized_access in ('active','grace') then 'active' else 'revoked' end,
      source='plan',starts_at=coalesce(p_period_start,starts_at),
      ends_at=case when normalized_access in ('active','grace') then p_period_end else coalesce(p_period_end,now()) end,
      updated_at=now()
  where tenant_id=p_tenant_id and entitlement_key='spanish.access';

  insert into core.platform_audit_events (
    tenant_id,actor_email,action,resource_type,resource_id,after_state,metadata
  ) values (
    p_tenant_id,'stripe@system','SPANISH_STRIPE_SUBSCRIPTION_SYNCED',
    'tenant_subscription',sub_id_value::text,
    jsonb_build_object(
      'stripe_subscription_id',p_subscription_id,'status',normalized_status,
      'access_status',normalized_access,'period_end',p_period_end,'billing_cycle',normalized_cycle
    ),
    '{"brand":"chatgenius","app":"spanish"}'::jsonb
  );

  return jsonb_build_object(
    'subscription_id',sub_id_value,'status',normalized_status,
    'access_status',normalized_access,'billing_cycle',normalized_cycle
  );
end;
$$;

revoke all on function public.spanish_bind_stripe_subscription(
  uuid,text,text,text,timestamptz,timestamptz,boolean,text
) from public,anon,authenticated;
grant execute on function public.spanish_bind_stripe_subscription(
  uuid,text,text,text,timestamptz,timestamptz,boolean,text
) to service_role;

create or replace function public.spanish_account_snapshot(p_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ensured jsonb;
  tenant_id_value uuid;
  result jsonb;
begin
  ensured := chatgenius_private.ensure_spanish_account(p_user_id);
  tenant_id_value := (ensured ->> 'tenant_id')::uuid;

  select jsonb_build_object(
    'account',ensured,
    'profile',jsonb_build_object(
      'id',p.id,'email',p.email,'full_name',p.full_name,'phone',p.metadata ->> 'phone'
    ),
    'settings',jsonb_build_object(
      'source_lang',s.source_lang,'cefr_level',s.cefr_level,
      'daily_goal_xp',s.daily_goal_xp,'last_active_at',s.last_active_at
    ),
    'learning_state',coalesce(ls.state,'{}'::jsonb),
    'subscription',jsonb_build_object(
      'id',sub.id,'status',sub.status,'provider',sub.provider,
      'access_status',sub.access_status,'access_kind',sub.metadata ->> 'access_kind',
      'billing_cycle',sub.metadata ->> 'billing_cycle',
      'trial_ends_at',sub.trial_ends_at,
      'current_period_starts_at',sub.current_period_starts_at,
      'current_period_ends_at',sub.current_period_ends_at,
      'cancel_at_period_end',sub.cancel_at_period_end,
      'external_customer_id',sub.external_customer_id,
      'external_subscription_id',sub.external_subscription_id
    ),
    'entitlements',coalesce((
      select jsonb_object_agg(e.entitlement_key,jsonb_build_object(
        'value',e.value,'status',e.status,'starts_at',e.starts_at,'ends_at',e.ends_at
      ))
      from core.tenant_entitlements e
      where e.tenant_id=tenant_id_value and e.entitlement_key like 'spanish.%'
    ),'{}'::jsonb)
  )
  into result
  from core.profiles p
  left join chatgenius.user_settings s on s.user_id=p_user_id
  left join chatgenius.learning_state ls on ls.user_id=p_user_id
  left join core.tenant_subscriptions sub
    on sub.tenant_id=tenant_id_value
   and sub.app_id=(select id from core.apps where slug='spanish')
  where p.id=p_user_id;

  return coalesce(result,jsonb_build_object('account',ensured));
end;
$$;

revoke all on function public.spanish_account_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.spanish_account_snapshot(uuid) to service_role;
