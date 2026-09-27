-- Owner-managed RealtyFlow workspace users.
-- Passwords NEVER enter these tables/functions; Supabase Auth owns password hashes.
-- This migration creates no user and activates no existing account.

create table if not exists core.workspace_user_directory (
  user_id uuid primary key references auth.users(id) on delete restrict,
  username text not null unique
    check (username = lower(btrim(username)) and username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  email text not null unique
    check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  status text not null default 'active' check (status in ('active','disabled')),
  created_by_email text not null,
  updated_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table core.workspace_user_directory enable row level security;

create table if not exists core.workspace_user_directory_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  username text not null,
  email text not null,
  action text not null check (action in ('created','updated')),
  old_status text,
  new_status text not null,
  actor_email text not null,
  at timestamptz not null default now()
);
alter table core.workspace_user_directory_audit enable row level security;

create or replace function core.audit_workspace_user_directory()
returns trigger language plpgsql security definer set search_path = '' as $workspace_user_audit$
begin
  insert into core.workspace_user_directory_audit
    (user_id,username,email,action,old_status,new_status,actor_email)
  values (
    new.user_id,new.username,new.email,
    case when tg_op='INSERT' then 'created' else 'updated' end,
    case when tg_op='UPDATE' then old.status else null end,
    new.status,new.updated_by_email
  );
  return new;
end; $workspace_user_audit$;

drop trigger if exists trg_workspace_user_directory_audit on core.workspace_user_directory;
create trigger trg_workspace_user_directory_audit
after insert or update on core.workspace_user_directory
for each row execute function core.audit_workspace_user_directory();

revoke all on core.workspace_user_directory, core.workspace_user_directory_audit
  from public, anon, authenticated, service_role;
grant select, insert, update on core.workspace_user_directory to service_role;
grant select on core.workspace_user_directory_audit to service_role;
revoke execute on function core.audit_workspace_user_directory()
  from public, anon, authenticated, service_role;

comment on table core.workspace_user_directory is
  'Owner-managed workspace login directory. No passwords or password hashes.';
comment on table core.workspace_user_directory_audit is
  'Append-only workspace user lifecycle audit; no password data.';

-- Used server-side before password authentication to map a custom username to
-- the canonical Supabase Auth email. Service role only; never browser-exposed.
create or replace function public.workspace_login_directory(p_login text)
returns jsonb language sql stable security invoker set search_path = '' as $workspace_login_directory$
  select jsonb_build_object(
    'user_id',u.user_id,'username',u.username,'email',u.email,
    'display_name',u.display_name,'status',u.status
  )
  from core.workspace_user_directory u
  where u.username=lower(btrim(p_login)) or u.email=lower(btrim(p_login))
  limit 1;
$workspace_login_directory$;

revoke execute on function public.workspace_login_directory(text)
  from public, anon, authenticated;
grant execute on function public.workspace_login_directory(text) to service_role;

-- Owner UI snapshot: staff directory, exact brand memberships and brand names.
-- It deliberately contains no passwords, tokens or customer data.
create or replace function public.workspace_user_admin_snapshot()
returns jsonb language sql stable security invoker set search_path = '' as $workspace_user_admin_snapshot$
  select jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',u.user_id,'username',u.username,'email',u.email,
        'display_name',u.display_name,'status',u.status,
        'created_at',u.created_at,'updated_at',u.updated_at,
        'memberships',coalesce((
          select jsonb_agg(jsonb_build_object(
            'brand_id',m.brand_id,'brand_key',b.brand_key,'brand_name',b.display_name,
            'status',m.status,'permissions',m.permissions,'updated_at',m.updated_at
          ) order by b.display_name)
          from core.brand_workspace_memberships m
          join core.brands b on b.id=m.brand_id
          where m.user_id=u.user_id
        ),'[]'::jsonb)
      ) order by u.display_name,u.username)
      from core.workspace_user_directory u
    ),'[]'::jsonb),
    'brands',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',b.id,'brand_key',b.brand_key,'display_name',b.display_name
      ) order by b.display_name)
      from core.brands b
    ),'[]'::jsonb)
  );
$workspace_user_admin_snapshot$;

revoke execute on function public.workspace_user_admin_snapshot()
  from public, anon, authenticated;
grant execute on function public.workspace_user_admin_snapshot() to service_role;

-- Atomically configures directory + exact brand memberships for an already
-- created Supabase Auth user. Unsafe/unimplemented marketing grants are rejected.
create or replace function public.workspace_user_configure(
  p_user_id uuid, p_username text, p_email text, p_display_name text,
  p_brand_access jsonb, p_actor text
) returns boolean language plpgsql security invoker set search_path = '' as $workspace_user_configure$
declare
  item jsonb;
  v_brand_id uuid;
  v_brand_key text;
  v_permissions text[];
  v_desired uuid[] := '{}'::uuid[];
  v_count integer;
  v_distinct integer;
begin
  if p_user_id is null
    or p_username is null or p_username <> lower(btrim(p_username))
    or p_username !~ '^[a-z0-9][a-z0-9._-]{2,31}$'
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_display_name is null or length(btrim(p_display_name)) not between 1 and 120
    or p_actor is null or p_actor <> lower(btrim(p_actor)) or p_actor not like '%@%'
    or jsonb_typeof(p_brand_access) <> 'array'
    or jsonb_array_length(p_brand_access) < 1 or jsonb_array_length(p_brand_access) > 20
  then return false; end if;

  -- Do not allow one directory identity to be silently rebound to another auth user.
  if exists (
    select 1 from core.workspace_user_directory u
    where (u.username=p_username or u.email=p_email) and u.user_id<>p_user_id
  ) then return false; end if;

  for item in select value from jsonb_array_elements(p_brand_access)
  loop
    if jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item->'permissions') <> 'array'
      or jsonb_array_length(item->'permissions') < 1
      or jsonb_array_length(item->'permissions') > 10
    then return false; end if;

    v_brand_key := item->>'brandKey';
    if v_brand_key is null or v_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    then return false; end if;

    select b.id into v_brand_id from core.brands b where b.brand_key=v_brand_key;
    if v_brand_id is null or v_brand_id=any(v_desired) then return false; end if;

    select coalesce(array_agg(value order by value),'{}'::text[]),
      count(*)::integer,count(distinct value)::integer
      into v_permissions,v_count,v_distinct
    from jsonb_array_elements_text(item->'permissions');
    if v_count<>v_distinct then return false; end if;

    if exists (
      select 1 from unnest(v_permissions) p
      where p not in (
        'crm.read','crm.write','crm.joint.read','crm.joint.write',
        'tasks.joint.read','tasks.joint.write','properties.catalog.read',
        'marketing.read','marketing.draft','marketing.publish'
      )
    ) then return false; end if;

    -- Marketing is visible in owner planning UI but has no scoped staff route yet.
    if exists (select 1 from unnest(v_permissions) p where p like 'marketing.%')
    then return false; end if;

    if v_brand_key='zeneco' then
      if v_permissions && array['crm.read','crm.write']::text[]
        or ('crm.joint.write'=any(v_permissions) and not ('crm.joint.read'=any(v_permissions)))
        or (v_permissions && array['tasks.joint.read','tasks.joint.write']::text[]
            and not ('crm.joint.read'=any(v_permissions)))
        or ('tasks.joint.write'=any(v_permissions) and not ('tasks.joint.read'=any(v_permissions)))
      then return false; end if;
    else
      if v_permissions && array['crm.joint.read','crm.joint.write','tasks.joint.read','tasks.joint.write']::text[]
      then return false; end if;
    end if;

    v_desired := array_append(v_desired,v_brand_id);

    insert into core.brand_workspace_memberships
      (brand_id,user_id,email,status,permissions,updated_at)
    values (v_brand_id,p_user_id,p_email,'active',v_permissions,now())
    on conflict (brand_id,user_id) do update set
      email=excluded.email,status='active',permissions=excluded.permissions,updated_at=now();
  end loop;

  -- Never delete a removed brand grant. Revoke it so history remains auditable.
  update core.brand_workspace_memberships
    set status='revoked',updated_at=now()
    where user_id=p_user_id and not (brand_id=any(v_desired)) and status<>'revoked';

  insert into core.workspace_user_directory
    (user_id,username,email,display_name,status,created_by_email,updated_by_email,updated_at)
  values
    (p_user_id,p_username,p_email,btrim(p_display_name),'active',p_actor,p_actor,now())
  on conflict (user_id) do update set
    username=excluded.username,email=excluded.email,display_name=excluded.display_name,
    status='active',updated_by_email=excluded.updated_by_email,updated_at=now();

  return true;
exception
  when unique_violation or check_violation or foreign_key_violation then
    return false;
end; $workspace_user_configure$;

revoke execute on function public.workspace_user_configure(uuid,text,text,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.workspace_user_configure(uuid,text,text,text,jsonb,text)
  to service_role;

-- Immediate application-level disable. Existing memberships are revoked in the
-- same transaction; re-enable requires a fresh explicit configure operation.
create or replace function public.workspace_user_disable(
  p_user_id uuid, p_actor text
) returns boolean language plpgsql security invoker set search_path = '' as $workspace_user_disable$
begin
  if p_user_id is null or p_actor is null or p_actor<>lower(btrim(p_actor)) or p_actor not like '%@%'
  then return false; end if;

  update core.workspace_user_directory
    set status='disabled',updated_by_email=p_actor,updated_at=now()
    where user_id=p_user_id and status<>'disabled';
  if not found then return false; end if;

  update core.brand_workspace_memberships
    set status='revoked',updated_at=now()
    where user_id=p_user_id and status<>'revoked';
  return true;
end; $workspace_user_disable$;

revoke execute on function public.workspace_user_disable(uuid,text)
  from public, anon, authenticated;
grant execute on function public.workspace_user_disable(uuid,text) to service_role;
