-- Reconcile Spanish access so expired/revoked manual access cannot be reactivated by bootstrap.

create or replace function chatgenius_private.reconcile_spanish_access(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant_id_value uuid;
  app_id_value uuid;
  sub_row core.tenant_subscriptions%rowtype;
  active_value boolean := false;
  grace_value boolean := false;
  now_value timestamptz := now();
begin
  select tm.tenant_id into tenant_id_value
  from core.tenant_memberships tm
  join core.tenants t on t.id=tm.tenant_id
  where tm.user_id=p_user_id
    and t.metadata ->> 'primary_app'='spanish'
  limit 1;

  if tenant_id_value is null then
    return jsonb_build_object('active',false,'reason','missing_tenant');
  end if;

  select id into app_id_value from core.apps where slug='spanish';

  select * into sub_row
  from core.tenant_subscriptions
  where tenant_id=tenant_id_value and app_id=app_id_value
  limit 1;

  if sub_row.id is null then
    return jsonb_build_object('active',false,'reason','missing_subscription');
  end if;

  if coalesce(sub_row.metadata ->> 'access_kind','')='lifetime' then
    active_value := true;
  elsif sub_row.provider='stripe' then
    active_value := sub_row.status in ('active','trialing');
    grace_value := sub_row.status='past_due'
      and sub_row.access_status='grace'
      and (sub_row.grace_ends_at is null or sub_row.grace_ends_at > now_value);
    active_value := active_value or grace_value;
  else
    active_value := sub_row.status in ('active','trialing')
      and (
        coalesce(sub_row.current_period_ends_at,sub_row.trial_ends_at) is null
        or coalesce(sub_row.current_period_ends_at,sub_row.trial_ends_at) > now_value
      );
  end if;

  if not active_value and sub_row.provider <> 'stripe'
     and sub_row.status in ('active','trialing')
     and coalesce(sub_row.current_period_ends_at,sub_row.trial_ends_at) is not null
     and coalesce(sub_row.current_period_ends_at,sub_row.trial_ends_at) <= now_value then
    update core.tenant_subscriptions
    set status='expired', access_status='suspended', updated_at=now()
    where id=sub_row.id;
    sub_row.status := 'expired';
    sub_row.access_status := 'suspended';
  end if;

  update core.tenant_apps
  set enabled=active_value,
      status=case
        when active_value and sub_row.status='trialing' then 'trialing'
        when active_value and grace_value then 'past_due'
        when active_value then 'active'
        when sub_row.status='cancelled' then 'cancelled'
        else 'suspended'
      end,
      ends_at=case
        when coalesce(sub_row.metadata ->> 'access_kind','')='lifetime' then null
        else coalesce(sub_row.current_period_ends_at,sub_row.trial_ends_at)
      end,
      updated_at=now()
  where tenant_id=tenant_id_value and app_id=app_id_value;

  update core.tenant_modules
  set status=case
        when active_value and sub_row.status='trialing' then 'trialing'
        when active_value then 'active'
        else 'suspended'
      end,
      ends_at=case
        when active_value and sub_row.provider='stripe' then null
        when coalesce(sub_row.metadata ->> 'access_kind','')='lifetime' then null
        else coalesce(sub_row.current_period_ends_at,sub_row.trial_ends_at,now_value)
      end,
      updated_at=now()
  where tenant_id=tenant_id_value
    and plan_id=sub_row.plan_id;

  update core.tenant_entitlements
  set status=case when active_value then 'active' else 'revoked' end,
      ends_at=case
        when active_value and (sub_row.provider='stripe' or coalesce(sub_row.metadata ->> 'access_kind','')='lifetime') then null
        when active_value then coalesce(sub_row.current_period_ends_at,sub_row.trial_ends_at)
        else coalesce(coalesce(sub_row.current_period_ends_at,sub_row.trial_ends_at),now_value)
      end,
      updated_at=now()
  where tenant_id=tenant_id_value
    and entitlement_key='spanish.access';

  return jsonb_build_object(
    'active',active_value,
    'grace',grace_value,
    'status',sub_row.status,
    'access_status',case when active_value and grace_value then 'grace'
                         when active_value then 'active'
                         else 'suspended' end,
    'tenant_id',tenant_id_value,
    'subscription_id',sub_row.id
  );
end;
$$;

revoke all on function chatgenius_private.reconcile_spanish_access(uuid) from public,anon,authenticated;
grant execute on function chatgenius_private.reconcile_spanish_access(uuid) to service_role;

create or replace function public.spanish_ensure_account(p_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ensured jsonb;
  reconciled jsonb;
begin
  ensured := chatgenius_private.ensure_spanish_account(p_user_id);
  reconciled := chatgenius_private.reconcile_spanish_access(p_user_id);
  return ensured || jsonb_build_object('reconciled',reconciled);
end;
$$;

revoke all on function public.spanish_ensure_account(uuid) from public,anon,authenticated;
grant execute on function public.spanish_ensure_account(uuid) to service_role;

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
  ensured := public.spanish_ensure_account(p_user_id);
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
