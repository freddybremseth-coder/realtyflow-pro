-- Add per-user and aggregate Spanish AI cost to the admin snapshot.

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
  if actor_email <> 'freddy.bremseth@gmail.com' then
    raise exception 'Admin access required';
  end if;

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
        where i.app_id=app_id_value and i.status='pending'),
      'estimated_ai_cost_usd',coalesce((
        select sum(
          case
            when (e.dimensions ->> 'estimated_cost_usd') ~ '^[0-9]+([.][0-9]+)?$'
              then (e.dimensions ->> 'estimated_cost_usd')::numeric
            else 0
          end
        )
        from core.tenant_usage_events e
        join core.tenants t on t.id=e.tenant_id
        where t.metadata ->> 'primary_app'='spanish'
      ),0)
    ),
    'users',coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',u.id,'email',u.email,'full_name',p.full_name,
        'phone',p.metadata ->> 'phone','created_at',u.created_at,
        'tenant_id',t.id,'subscription_id',s.id,'status',s.status,
        'provider',s.provider,'access_status',s.access_status,
        'access_kind',s.metadata ->> 'access_kind',
        'billing_cycle',s.metadata ->> 'billing_cycle',
        'ends_at',s.current_period_ends_at,
        'cancel_at_period_end',s.cancel_at_period_end,
        'cefr_level',us.cefr_level,'last_active_at',us.last_active_at,
        'usage',public.spanish_usage_summary(u.id)
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

revoke all on function public.spanish_admin_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.spanish_admin_snapshot(uuid) to service_role;
