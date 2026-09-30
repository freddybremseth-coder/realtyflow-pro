-- Workspace Nexus Insights phase 1.
-- Brand members may read a deliberately reduced, brand-scoped Nexus summary.
-- Runtime controls, autonomy policies, approvals, customer identities and
-- execution endpoints remain owner/internal-system only.

alter table core.brand_workspace_memberships
  drop constraint if exists brand_workspace_memberships_permissions_check;
alter table core.brand_workspace_memberships
  add constraint brand_workspace_memberships_permissions_check
  check (permissions <@ array[
    'crm.read','crm.write','crm.joint.read','crm.joint.write',
    'tasks.joint.read','tasks.joint.write','properties.catalog.read',
    'marketing.read','marketing.draft','marketing.publish',
    'reels.read','reels.create','reels.publish',
    'youtube.read','youtube.publish','nexus.read',
    'corporate.read','corporate.plan',
    'visibility.read','visibility.plan',
    'ads.read','ads.draft','events.plan',
    'content.read','content.edit','content.publish',
    'email.read','email.draft','email.send'
  ]::text[]);

alter table core.brand_workspace_access_plans
  drop constraint if exists brand_workspace_access_plans_permissions_check;
alter table core.brand_workspace_access_plans
  add constraint brand_workspace_access_plans_permissions_check
  check (permissions <@ array[
    'crm.read','crm.write','crm.joint.read','crm.joint.write',
    'tasks.joint.read','tasks.joint.write','properties.catalog.read',
    'marketing.read','marketing.draft','marketing.publish',
    'reels.read','reels.create','reels.publish',
    'youtube.read','youtube.publish','nexus.read',
    'corporate.read','corporate.plan',
    'visibility.read','visibility.plan',
    'ads.read','ads.draft','events.plan',
    'content.read','content.edit','content.publish',
    'email.read','email.draft','email.send'
  ]::text[]);

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

  if exists (
    select 1 from core.workspace_user_directory u
    where (u.username=p_username or u.email=p_email) and u.user_id<>p_user_id
  ) then return false; end if;

  for item in select value from jsonb_array_elements(p_brand_access)
  loop
    if jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item->'permissions') <> 'array'
      or jsonb_array_length(item->'permissions') < 1
      or jsonb_array_length(item->'permissions') > 30
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
        'marketing.read','marketing.draft','marketing.publish',
        'reels.read','reels.create','reels.publish',
    'youtube.read','youtube.publish','nexus.read',
        'corporate.read','corporate.plan',
        'visibility.read','visibility.plan',
        'ads.read','ads.draft','events.plan',
        'content.read','content.edit','content.publish',
        'email.read','email.draft','email.send'
      )
    ) then return false; end if;

    if ('marketing.publish'=any(v_permissions) and
        (not ('marketing.read'=any(v_permissions)) or not ('marketing.draft'=any(v_permissions))))
      or ('marketing.draft'=any(v_permissions) and not ('marketing.read'=any(v_permissions)))
      or ('reels.create'=any(v_permissions) and not ('reels.read'=any(v_permissions)))
      or ('reels.publish'=any(v_permissions) and
          (not ('reels.read'=any(v_permissions)) or not ('reels.create'=any(v_permissions))))
      or ('youtube.publish'=any(v_permissions) and not ('youtube.read'=any(v_permissions)))
      or ('corporate.plan'=any(v_permissions) and not ('corporate.read'=any(v_permissions)))
      or ('visibility.plan'=any(v_permissions) and not ('visibility.read'=any(v_permissions)))
      or ('ads.draft'=any(v_permissions) and not ('ads.read'=any(v_permissions)))
      or ('content.edit'=any(v_permissions) and not ('content.read'=any(v_permissions)))
      or ('content.publish'=any(v_permissions) and
          (not ('content.read'=any(v_permissions)) or not ('content.edit'=any(v_permissions))))
      or ('email.draft'=any(v_permissions) and not ('email.read'=any(v_permissions)))
      or ('email.send'=any(v_permissions) and
          (not ('email.read'=any(v_permissions)) or not ('email.draft'=any(v_permissions))))
    then return false; end if;

    if v_permissions && array['reels.read','reels.create','reels.publish']::text[]
      and v_brand_key not in ('zeneco','pinosoecolife')
    then return false; end if;

    if v_permissions && array['youtube.read','youtube.publish']::text[]
      and v_brand_key <> 'zeneco'
    then return false; end if;

    if v_brand_key='zeneco' then
      if v_permissions && array['crm.read','crm.write']::text[]
        or ('crm.joint.write'=any(v_permissions) and not ('crm.joint.read'=any(v_permissions)))
        or (v_permissions && array['tasks.joint.read','tasks.joint.write']::text[]
            and not ('crm.joint.read'=any(v_permissions)))
        or ('tasks.joint.write'=any(v_permissions) and not ('tasks.joint.read'=any(v_permissions)))
      then return false; end if;
    else
      if v_permissions && array[
        'crm.joint.read','crm.joint.write','tasks.joint.read','tasks.joint.write',
        'corporate.read','corporate.plan'
      ]::text[]
      then return false; end if;
    end if;

    v_desired := array_append(v_desired,v_brand_id);

    insert into core.brand_workspace_memberships
      (brand_id,user_id,email,status,permissions,updated_at)
    values (v_brand_id,p_user_id,p_email,'active',v_permissions,now())
    on conflict (brand_id,user_id) do update set
      email=excluded.email,status='active',permissions=excluded.permissions,updated_at=now();
  end loop;

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

comment on function public.workspace_user_configure(uuid,text,text,text,jsonb,text) is
  'Configures exact brand workspace permissions. Nexus phase 1 grants read-only brand-scoped insight; runtime, autonomy and execution remain outside workspace permissions.';
