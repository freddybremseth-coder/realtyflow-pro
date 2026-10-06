-- Spanish account lifecycle, access management and Stripe binding.

create or replace function chatgenius_private.ensure_spanish_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_row auth.users%rowtype;
  app_row core.apps%rowtype;
  plan_row core.plans%rowtype;
  invite_row core.app_invitations%rowtype;
  sub_row core.tenant_subscriptions%rowtype;
  tenant_id_value uuid;
  access_kind_value text;
  starts_value timestamptz := now();
  ends_value timestamptz;
  subscription_status_value text;
  provider_value text := 'manual';
  full_name_value text;
  phone_value text;
begin
  select * into user_row from auth.users where id = p_user_id;
  if user_row.id is null or nullif(user_row.email, '') is null then
    raise exception 'Spanish user not found';
  end if;

  select * into app_row from core.apps where slug = 'spanish';
  if app_row.id is null then raise exception 'Spanish app is not configured'; end if;

  select * into plan_row
  from core.plans
  where app_id = app_row.id and slug = 'premium'
  limit 1;
  if plan_row.id is null then raise exception 'Spanish premium plan is not configured'; end if;

  full_name_value := coalesce(
    nullif(btrim(user_row.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(user_row.raw_user_meta_data ->> 'name'), ''),
    split_part(user_row.email, '@', 1)
  );
  phone_value := nullif(btrim(user_row.raw_user_meta_data ->> 'phone'), '');

  select i.* into invite_row
  from core.app_invitations i
  where i.app_id = app_row.id
    and lower(i.email) = lower(user_row.email)
    and i.status = 'pending'
  order by i.created_at desc
  limit 1;

  select tm.tenant_id into tenant_id_value
  from core.tenant_memberships tm
  join core.tenants t on t.id = tm.tenant_id
  where tm.user_id = p_user_id
    and t.metadata ->> 'primary_app' = 'spanish'
  order by tm.created_at
  limit 1;

  if tenant_id_value is null then
    insert into core.tenants (
      slug, name, status, plan, metadata, customer_type, contact_email,
      default_locale, default_currency, timezone, data_region,
      created_by_email, updated_by_email
    ) values (
      'spanish-' || replace(p_user_id::text, '-', ''),
      full_name_value,
      'active',
      'spanish',
      '{"primary_app":"spanish","brand":"chatgenius","account_type":"consumer"}'::jsonb,
      'customer',
      lower(user_row.email),
      'nb-NO',
      'EUR',
      'Europe/Madrid',
      'eu',
      lower(user_row.email),
      lower(user_row.email)
    )
    returning id into tenant_id_value;
  else
    update core.tenants
    set name = coalesce(nullif(full_name_value, ''), name),
        contact_email = lower(user_row.email),
        metadata = metadata || '{"primary_app":"spanish","brand":"chatgenius","account_type":"consumer"}'::jsonb,
        updated_by_email = lower(user_row.email),
        updated_at = now()
    where id = tenant_id_value;
  end if;

  insert into core.profiles (id, email, full_name, metadata)
  values (
    p_user_id, lower(user_row.email), full_name_value,
    jsonb_strip_nulls(jsonb_build_object('phone', phone_value, 'primary_app', 'spanish'))
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, core.profiles.full_name),
    metadata = core.profiles.metadata || excluded.metadata,
    updated_at = now();

  insert into core.tenant_memberships (
    tenant_id, user_id, role, is_owner, user_email, status, invited_at, accepted_at, updated_at
  ) values (
    tenant_id_value, p_user_id, 'member', true, lower(user_row.email),
    'active', now(), now(), now()
  )
  on conflict (tenant_id, user_id) do update set
    role = 'member',
    is_owner = true,
    user_email = excluded.user_email,
    status = 'active',
    accepted_at = coalesce(core.tenant_memberships.accepted_at, now()),
    updated_at = now();

  if lower(user_row.email) = 'freddy.bremseth@gmail.com' then
    access_kind_value := 'lifetime';
    starts_value := now();
    ends_value := null;
    subscription_status_value := 'active';
  elsif invite_row.id is not null then
    access_kind_value := invite_row.access_kind;
    starts_value := invite_row.starts_at;
    ends_value := invite_row.ends_at;
    subscription_status_value := 'active';
    provider_value := case when invite_row.access_kind = 'partner' then 'partner' else 'manual' end;
  else
    access_kind_value := 'trial';
    starts_value := now();
    ends_value := now() + make_interval(days => plan_row.trial_days);
    subscription_status_value := 'trialing';
  end if;

  select * into sub_row
  from core.tenant_subscriptions
  where tenant_id = tenant_id_value and app_id = app_row.id
  limit 1;

  if sub_row.id is null then
    insert into core.tenant_subscriptions (
      tenant_id, app_id, plan_id, status, provider,
      trial_ends_at, current_period_starts_at, current_period_ends_at,
      cancel_at_period_end, metadata, access_status
    ) values (
      tenant_id_value, app_row.id, plan_row.id, subscription_status_value, provider_value,
      case when access_kind_value = 'trial' then ends_value end,
      starts_value,
      case when access_kind_value <> 'lifetime' then ends_value end,
      false,
      jsonb_build_object('access_kind', access_kind_value, 'source', 'spanish_bootstrap'),
      'active'
    )
    returning * into sub_row;
  elsif lower(user_row.email) = 'freddy.bremseth@gmail.com' then
    update core.tenant_subscriptions
    set plan_id = plan_row.id,
        status = 'active',
        provider = 'manual',
        trial_ends_at = null,
        current_period_starts_at = coalesce(current_period_starts_at, now()),
        current_period_ends_at = null,
        cancel_at_period_end = false,
        metadata = metadata || '{"access_kind":"lifetime","source":"spanish_owner"}'::jsonb,
        access_status = 'active',
        updated_at = now()
    where id = sub_row.id
    returning * into sub_row;
  elsif invite_row.id is not null and sub_row.provider <> 'stripe' then
    update core.tenant_subscriptions
    set plan_id = plan_row.id,
        status = 'active',
        provider = provider_value,
        trial_ends_at = null,
        current_period_starts_at = starts_value,
        current_period_ends_at = ends_value,
        cancel_at_period_end = false,
        metadata = metadata || jsonb_build_object('access_kind', access_kind_value, 'source', 'admin_invitation'),
        access_status = 'active',
        updated_at = now()
    where id = sub_row.id
    returning * into sub_row;
  end if;

  insert into core.tenant_apps (
    tenant_id, app_id, enabled, settings, status, source, starts_at, ends_at, updated_at
  ) values (
    tenant_id_value, app_row.id, true,
    jsonb_build_object('access_kind', coalesce(sub_row.metadata ->> 'access_kind', access_kind_value)),
    case when sub_row.status = 'trialing' then 'trialing' else 'active' end,
    case when sub_row.provider = 'stripe' then 'stripe'
         when sub_row.provider = 'partner' then 'partner'
         else 'manual' end,
    coalesce(sub_row.current_period_starts_at, starts_value),
    case when coalesce(sub_row.metadata ->> 'access_kind', access_kind_value) = 'lifetime'
         then null else coalesce(sub_row.current_period_ends_at, ends_value) end,
    now()
  )
  on conflict (tenant_id, app_id) do update set
    enabled = true,
    settings = excluded.settings,
    status = excluded.status,
    source = excluded.source,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    updated_at = now();

  insert into core.tenant_modules (tenant_id, module_id, plan_id, status, source, settings, starts_at, ends_at)
  select tenant_id_value, am.module_id, plan_row.id, 'active', 'plan', '{}'::jsonb,
         starts_value, case when access_kind_value = 'lifetime' then null else ends_value end
  from core.app_modules am
  where am.app_id = app_row.id and am.enabled_by_default
  on conflict (tenant_id, module_id) do update set
    plan_id = excluded.plan_id,
    status = 'active',
    source = 'plan',
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    updated_at = now();

  insert into core.tenant_entitlements (
    tenant_id, module_id, entitlement_key, value, status, source, starts_at, ends_at
  )
  select tenant_id_value, m.id, 'spanish.access', 'true'::jsonb, 'active', 'plan',
         starts_value, case when access_kind_value = 'lifetime' then null else ends_value end
  from core.modules m where m.slug = 'language-learning'
  on conflict (tenant_id, entitlement_key) do update set
    module_id = excluded.module_id,
    value = excluded.value,
    status = 'active',
    source = 'plan',
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    updated_at = now();

  insert into core.tenant_entitlements (
    tenant_id, module_id, entitlement_key, value, status, source, starts_at, ends_at
  )
  select tenant_id_value, m.id, 'spanish.luna_live',
         to_jsonb(lower(user_row.email) = 'freddy.bremseth@gmail.com'),
         'active', 'manual', now(), null
  from core.modules m where m.slug = 'language-learning'
  on conflict (tenant_id, entitlement_key) do update set
    value = excluded.value,
    status = 'active',
    ends_at = null,
    updated_at = now();

  insert into chatgenius.user_settings (user_id, source_lang, last_active_at)
  values (
    p_user_id,
    case when user_row.raw_user_meta_data ->> 'source_lang' in ('no','en','de','ru')
         then user_row.raw_user_meta_data ->> 'source_lang' else 'no' end,
    now()
  )
  on conflict (user_id) do update set last_active_at = now(), updated_at = now();

  insert into chatgenius.learning_state (user_id, state)
  values (p_user_id, '{}'::jsonb)
  on conflict (user_id) do nothing;

  if invite_row.id is not null then
    update core.app_invitations
    set status = 'claimed', claimed_by = p_user_id, claimed_at = now(), updated_at = now()
    where id = invite_row.id;
  end if;

  insert into core.platform_audit_events (
    tenant_id, actor_email, action, resource_type, resource_id, after_state, metadata
  ) values (
    tenant_id_value, lower(user_row.email), 'SPANISH_ACCOUNT_BOOTSTRAPPED',
    'spanish_account', p_user_id::text,
    jsonb_build_object(
      'app_id', app_row.id, 'plan_id', plan_row.id,
      'subscription_id', sub_row.id,
      'access_kind', coalesce(sub_row.metadata ->> 'access_kind', access_kind_value)
    ),
    '{"brand":"chatgenius","app":"spanish"}'::jsonb
  );

  return jsonb_build_object(
    'user_id', p_user_id, 'tenant_id', tenant_id_value,
    'app_id', app_row.id, 'plan_id', plan_row.id,
    'subscription_id', sub_row.id, 'status', sub_row.status,
    'provider', sub_row.provider, 'access_status', sub_row.access_status,
    'access_kind', coalesce(sub_row.metadata ->> 'access_kind', access_kind_value),
    'trial_ends_at', sub_row.trial_ends_at,
    'current_period_ends_at', sub_row.current_period_ends_at
  );
end;
$$;

revoke all on function chatgenius_private.ensure_spanish_account(uuid) from public, anon, authenticated;
grant execute on function chatgenius_private.ensure_spanish_account(uuid) to service_role;

create or replace function chatgenius_private.handle_new_spanish_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform chatgenius_private.ensure_spanish_account(new.id);
  return new;
end;
$$;

revoke all on function chatgenius_private.handle_new_spanish_user() from public, anon, authenticated;
grant execute on function chatgenius_private.handle_new_spanish_user() to service_role;

drop trigger if exists on_auth_user_created_spanish on auth.users;
create trigger on_auth_user_created_spanish
  after insert on auth.users
  for each row
  when (coalesce(new.raw_user_meta_data ->> 'app_origin', '') = 'spanish')
  execute function chatgenius_private.handle_new_spanish_user();

-- Keep unrelated app profile triggers from creating Family/Olivia rows for Spanish consumers.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  when (coalesce(new.raw_user_meta_data ->> 'app_origin', '') <> 'spanish')
  execute function public.handle_new_user();

drop trigger if exists on_auth_user_created_family on auth.users;
create trigger on_auth_user_created_family
  after insert on auth.users
  for each row
  when (coalesce(new.raw_user_meta_data ->> 'app_origin', '') <> 'spanish')
  execute function family.handle_new_user();

drop trigger if exists on_auth_user_created_family_profile on auth.users;
create trigger on_auth_user_created_family_profile
  after insert or update on auth.users
  for each row
  when (coalesce(new.raw_user_meta_data ->> 'app_origin', '') <> 'spanish')
  execute function family.sync_user_profile();

drop trigger if exists on_auth_user_created_olivia on auth.users;
create trigger on_auth_user_created_olivia
  after insert on auth.users
  for each row
  when (coalesce(new.raw_user_meta_data ->> 'app_origin', '') <> 'spanish')
  execute function olivia_private.handle_new_user();

create or replace function public.spanish_ensure_account(p_user_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select chatgenius_private.ensure_spanish_account(p_user_id);
$$;

revoke all on function public.spanish_ensure_account(uuid) from public, anon, authenticated;
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
  ensured := chatgenius_private.ensure_spanish_account(p_user_id);
  tenant_id_value := (ensured ->> 'tenant_id')::uuid;

  select jsonb_build_object(
    'account', ensured,
    'profile', jsonb_build_object(
      'id', p.id, 'email', p.email, 'full_name', p.full_name,
      'phone', p.metadata ->> 'phone'
    ),
    'settings', jsonb_build_object(
      'source_lang', s.source_lang, 'cefr_level', s.cefr_level,
      'daily_goal_xp', s.daily_goal_xp, 'last_active_at', s.last_active_at
    ),
    'learning_state', coalesce(ls.state, '{}'::jsonb),
    'subscription', jsonb_build_object(
      'id', sub.id, 'status', sub.status, 'provider', sub.provider,
      'access_status', sub.access_status, 'access_kind', sub.metadata ->> 'access_kind',
      'trial_ends_at', sub.trial_ends_at,
      'current_period_starts_at', sub.current_period_starts_at,
      'current_period_ends_at', sub.current_period_ends_at,
      'cancel_at_period_end', sub.cancel_at_period_end,
      'external_customer_id', sub.external_customer_id,
      'external_subscription_id', sub.external_subscription_id
    ),
    'entitlements', coalesce((
      select jsonb_object_agg(e.entitlement_key, jsonb_build_object(
        'value', e.value, 'status', e.status,
        'starts_at', e.starts_at, 'ends_at', e.ends_at
      ))
      from core.tenant_entitlements e
      where e.tenant_id = tenant_id_value and e.entitlement_key like 'spanish.%'
    ), '{}'::jsonb)
  )
  into result
  from core.profiles p
  left join chatgenius.user_settings s on s.user_id = p_user_id
  left join chatgenius.learning_state ls on ls.user_id = p_user_id
  left join core.tenant_subscriptions sub
    on sub.tenant_id = tenant_id_value
   and sub.app_id = (select id from core.apps where slug='spanish')
  where p.id = p_user_id;

  return coalesce(result, jsonb_build_object('account', ensured));
end;
$$;

revoke all on function public.spanish_account_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.spanish_account_snapshot(uuid) to service_role;

create or replace function public.spanish_save_learning_state(
  p_user_id uuid,
  p_state jsonb,
  p_source_lang text default null,
  p_full_name text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform chatgenius_private.ensure_spanish_account(p_user_id);

  if p_source_lang is not null and p_source_lang not in ('no','en','de','ru') then
    raise exception 'Unsupported source language';
  end if;

  insert into chatgenius.learning_state (user_id, state, updated_at)
  values (p_user_id, coalesce(p_state, '{}'::jsonb), now())
  on conflict (user_id) do update set state=excluded.state, updated_at=now();

  if p_source_lang is not null then
    update chatgenius.user_settings
    set source_lang=p_source_lang, last_active_at=now(), updated_at=now()
    where user_id=p_user_id;
  else
    update chatgenius.user_settings
    set last_active_at=now(), updated_at=now()
    where user_id=p_user_id;
  end if;

  update core.profiles
  set full_name=coalesce(nullif(btrim(p_full_name),''),full_name),
      metadata=metadata || case
        when nullif(btrim(p_phone),'') is not null then jsonb_build_object('phone',btrim(p_phone))
        else '{}'::jsonb end,
      updated_at=now()
  where id=p_user_id;

  return public.spanish_account_snapshot(p_user_id);
end;
$$;

revoke all on function public.spanish_save_learning_state(uuid,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.spanish_save_learning_state(uuid,jsonb,text,text,text) to service_role;

create or replace function public.spanish_set_access(
  p_email text, p_full_name text, p_phone text, p_access_kind text,
  p_ends_at timestamptz, p_note text, p_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_email text;
  normalized_email text := lower(btrim(p_email));
  app_id_value uuid;
  target_user_id uuid;
  invitation_id uuid;
begin
  select lower(email) into actor_email from auth.users where id=p_actor_user_id;
  if actor_email <> 'freddy.bremseth@gmail.com' then raise exception 'Admin access required'; end if;

  if normalized_email is null or normalized_email='' or position('@' in normalized_email)<2 then
    raise exception 'Valid email is required';
  end if;
  if p_access_kind not in ('manual','family','partner','promo','lifetime') then
    raise exception 'Unsupported access kind';
  end if;

  if p_access_kind='lifetime' then
    p_ends_at := null;
  elsif p_ends_at is null or p_ends_at <= now() then
    raise exception 'Future end date is required';
  end if;

  select id into app_id_value from core.apps where slug='spanish';

  update core.app_invitations
  set status='revoked', updated_at=now()
  where app_id=app_id_value and lower(email)=normalized_email and status='pending';

  insert into core.app_invitations (
    app_id,email,full_name,phone,access_kind,starts_at,ends_at,status,note,created_by
  ) values (
    app_id_value,normalized_email,nullif(btrim(p_full_name),''),
    nullif(btrim(p_phone),''),p_access_kind,now(),p_ends_at,
    'pending',nullif(btrim(p_note),''),p_actor_user_id
  )
  returning id into invitation_id;

  select id into target_user_id
  from auth.users
  where lower(email)=normalized_email
  order by created_at
  limit 1;

  if target_user_id is not null then
    perform chatgenius_private.ensure_spanish_account(target_user_id);
  end if;

  insert into core.platform_audit_events (
    actor_email,action,resource_type,resource_id,after_state,metadata
  ) values (
    actor_email,'SPANISH_ACCESS_GRANTED','app_invitation',invitation_id::text,
    jsonb_build_object(
      'email',normalized_email,'access_kind',p_access_kind,
      'ends_at',p_ends_at,'existing_user_id',target_user_id
    ),
    '{"brand":"chatgenius","app":"spanish"}'::jsonb
  );

  return jsonb_build_object(
    'invitation_id',invitation_id,'email',normalized_email,
    'access_kind',p_access_kind,'ends_at',p_ends_at,
    'existing_user_id',target_user_id,'claimed',target_user_id is not null
  );
end;
$$;

revoke all on function public.spanish_set_access(text,text,text,text,timestamptz,text,uuid) from public, anon, authenticated;
grant execute on function public.spanish_set_access(text,text,text,text,timestamptz,text,uuid) to service_role;

create or replace function public.spanish_revoke_complimentary_access(
  p_user_id uuid, p_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_email text;
  target_email text;
  tenant_id_value uuid;
  app_id_value uuid;
  sub_row core.tenant_subscriptions%rowtype;
begin
  select lower(email) into actor_email from auth.users where id=p_actor_user_id;
  if actor_email <> 'freddy.bremseth@gmail.com' then raise exception 'Admin access required'; end if;

  select lower(email) into target_email from auth.users where id=p_user_id;
  if target_email is null then raise exception 'User not found'; end if;
  if target_email='freddy.bremseth@gmail.com' then raise exception 'Owner lifetime access cannot be revoked'; end if;

  select id into app_id_value from core.apps where slug='spanish';
  select tm.tenant_id into tenant_id_value
  from core.tenant_memberships tm
  join core.tenants t on t.id=tm.tenant_id
  where tm.user_id=p_user_id and t.metadata ->> 'primary_app'='spanish'
  limit 1;

  if tenant_id_value is null then raise exception 'Spanish account not found'; end if;

  select * into sub_row from core.tenant_subscriptions
  where tenant_id=tenant_id_value and app_id=app_id_value limit 1;

  if sub_row.id is null then raise exception 'Spanish subscription not found'; end if;
  if sub_row.provider='stripe' then raise exception 'Paid Stripe access must be managed through Stripe'; end if;

  update core.tenant_subscriptions
  set status='suspended',access_status='suspended',
      current_period_ends_at=now(),
      metadata=metadata || jsonb_build_object('revoked_at',now(),'revoked_by',actor_email),
      updated_at=now()
  where id=sub_row.id;

  update core.tenant_apps
  set status='suspended',enabled=false,ends_at=now(),updated_at=now()
  where tenant_id=tenant_id_value and app_id=app_id_value;

  update core.tenant_modules
  set status='suspended',ends_at=now(),updated_at=now()
  where tenant_id=tenant_id_value and plan_id=sub_row.plan_id;

  update core.tenant_entitlements
  set status='revoked',ends_at=coalesce(ends_at,now()),updated_at=now()
  where tenant_id=tenant_id_value and entitlement_key like 'spanish.%' and status='active';

  insert into core.platform_audit_events (
    tenant_id,actor_email,action,resource_type,resource_id,after_state,metadata
  ) values (
    tenant_id_value,actor_email,'SPANISH_ACCESS_REVOKED',
    'tenant_subscription',sub_row.id::text,
    jsonb_build_object('user_id',p_user_id,'email',target_email),
    '{"brand":"chatgenius","app":"spanish"}'::jsonb
  );

  return jsonb_build_object(
    'user_id',p_user_id,'tenant_id',tenant_id_value,
    'subscription_id',sub_row.id,'status','suspended'
  );
end;
$$;

revoke all on function public.spanish_revoke_complimentary_access(uuid,uuid) from public, anon, authenticated;
grant execute on function public.spanish_revoke_complimentary_access(uuid,uuid) to service_role;

create or replace function public.spanish_bind_stripe_subscription(
  p_tenant_id uuid, p_customer_id text, p_subscription_id text, p_status text,
  p_period_start timestamptz, p_period_end timestamptz,
  p_cancel_at_period_end boolean default false
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
begin
  if p_tenant_id is null then raise exception 'Tenant id is required'; end if;
  if nullif(btrim(p_subscription_id),'') is null then raise exception 'Stripe subscription id is required'; end if;

  select id into app_id_value from core.apps where slug='spanish';
  select p.id into plan_id_value
  from core.plans p where p.app_id=app_id_value and p.slug='premium' limit 1;

  normalized_status := case
    when p_status in ('active','trialing','past_due') then p_status
    when p_status in ('canceled','cancelled') then 'cancelled'
    when p_status='paused' then 'suspended'
    when p_status='incomplete_expired' then 'expired'
    else 'suspended' end;

  normalized_access := case
    when normalized_status in ('active','trialing') then 'active'
    when normalized_status='past_due' then 'grace'
    else 'suspended' end;

  tenant_app_status := case
    when normalized_status='active' then 'active'
    when normalized_status='trialing' then 'trialing'
    when normalized_status='past_due' then 'past_due'
    when normalized_status='cancelled' then 'cancelled'
    else 'suspended' end;

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
    '{"access_kind":"paid","source":"stripe"}'::jsonb,normalized_access,
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
    '{"access_kind":"paid"}'::jsonb,tenant_app_status,'stripe',
    coalesce(p_period_start,now()),
    case when tenant_app_status in ('cancelled','suspended') then coalesce(p_period_end,now()) else p_period_end end,
    now()
  )
  on conflict (tenant_id,app_id) do update set
    enabled=excluded.enabled,settings=core.tenant_apps.settings || excluded.settings,
    status=excluded.status,source='stripe',starts_at=excluded.starts_at,
    ends_at=excluded.ends_at,updated_at=now();

  update core.tenant_entitlements
  set status=case when normalized_access in ('active','grace') then 'active' else 'revoked' end,
      source='plan',
      starts_at=coalesce(p_period_start,starts_at),
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
      'access_status',normalized_access,'period_end',p_period_end
    ),
    '{"brand":"chatgenius","app":"spanish"}'::jsonb
  );

  return jsonb_build_object(
    'subscription_id',sub_id_value,'status',normalized_status,'access_status',normalized_access
  );
end;
$$;

revoke all on function public.spanish_bind_stripe_subscription(uuid,text,text,text,timestamptz,timestamptz,boolean) from public, anon, authenticated;
grant execute on function public.spanish_bind_stripe_subscription(uuid,text,text,text,timestamptz,timestamptz,boolean) to service_role;

create or replace function public.spanish_admin_snapshot(p_actor_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_email text;
  app_id_value uuid;
  result jsonb;
begin
  select lower(email) into actor_email from auth.users where id=p_actor_user_id;
  if actor_email <> 'freddy.bremseth@gmail.com' then raise exception 'Admin access required'; end if;

  select id into app_id_value from core.apps where slug='spanish';

  select jsonb_build_object(
    'stats', jsonb_build_object(
      'users',(select count(*) from core.tenant_memberships tm
        join core.tenants t on t.id=tm.tenant_id
        where t.metadata ->> 'primary_app'='spanish' and tm.status='active'),
      'active',(select count(*) from core.tenant_subscriptions s
        where s.app_id=app_id_value and s.access_status in ('active','grace')),
      'paid',(select count(*) from core.tenant_subscriptions s
        where s.app_id=app_id_value and s.provider='stripe'
          and s.status in ('active','trialing','past_due')),
      'pending_invitations',(select count(*) from core.app_invitations i
        where i.app_id=app_id_value and i.status='pending')
    ),
    'users',coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',u.id,'email',u.email,'full_name',p.full_name,
        'phone',p.metadata ->> 'phone','created_at',u.created_at,
        'tenant_id',t.id,'subscription_id',s.id,'status',s.status,
        'provider',s.provider,'access_status',s.access_status,
        'access_kind',s.metadata ->> 'access_kind','ends_at',s.current_period_ends_at,
        'cancel_at_period_end',s.cancel_at_period_end,
        'cefr_level',us.cefr_level,'last_active_at',us.last_active_at
      ) order by coalesce(us.last_active_at,u.created_at) desc)
      from core.tenant_memberships tm
      join core.tenants t on t.id=tm.tenant_id
      join auth.users u on u.id=tm.user_id
      left join core.profiles p on p.id=u.id
      left join core.tenant_subscriptions s on s.tenant_id=t.id and s.app_id=app_id_value
      left join chatgenius.user_settings us on us.user_id=u.id
      where t.metadata ->> 'primary_app'='spanish'
    ),'[]'::jsonb),
    'invitations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'email',i.email,'full_name',i.full_name,'phone',i.phone,
        'access_kind',i.access_kind,'starts_at',i.starts_at,'ends_at',i.ends_at,
        'status',i.status,'note',i.note,'created_at',i.created_at,'claimed_at',i.claimed_at
      ) order by i.created_at desc)
      from core.app_invitations i where i.app_id=app_id_value
    ),'[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.spanish_admin_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.spanish_admin_snapshot(uuid) to service_role;
