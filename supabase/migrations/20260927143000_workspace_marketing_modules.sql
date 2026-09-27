-- Enable the first production-safe workspace marketing capabilities.
-- marketing.read + marketing.draft are brand-scoped application permissions.
-- marketing.publish remains deliberately unavailable to workspace members.

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

    -- Workspace publishing remains closed until employee-specific channel
    -- ownership + publish preflight is implemented end-to-end.
    if 'marketing.publish'=any(v_permissions) then return false; end if;
    if 'marketing.draft'=any(v_permissions) and not ('marketing.read'=any(v_permissions))
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


-- PII-free audit for employee-created marketing drafts. Content itself stays
-- in content_publications; the audit records only who created which draft.
create table if not exists core.brand_workspace_marketing_draft_audit (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references core.brands(id) on delete restrict,
  publication_id uuid not null references public.content_publications(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null,
  created_at timestamptz not null default now()
);
alter table core.brand_workspace_marketing_draft_audit enable row level security;
revoke all on core.brand_workspace_marketing_draft_audit from public, anon, authenticated, service_role;
grant select, insert on core.brand_workspace_marketing_draft_audit to service_role;

-- Brand-scoped marketing read. Membership and permission are checked in the
-- same statement/transaction that reads content and channels, so a service-role
-- application query cannot race past a concurrent revocation.
create or replace function public.workspace_brand_marketing_snapshot(
  p_brand_key text, p_user_id uuid, p_email text
) returns jsonb language plpgsql security invoker set search_path = '' as $workspace_marketing_snapshot$
declare
  v_brand_id uuid;
  v_publications jsonb;
  v_channels jsonb;
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then return null; end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['marketing.read']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'brand_id',p.brand_id,'content_type',p.content_type,
    'title',p.title,'description',p.description,'tags',p.tags,
    'thumbnail_url',p.thumbnail_url,'scheduled_platforms',p.scheduled_platforms,
    'status',p.status,'scheduled_at',p.scheduled_at,'published_at',p.published_at,
    'created_at',p.created_at,'updated_at',p.updated_at,
    'total_views',coalesce(p.total_views,0),'total_likes',coalesce(p.total_likes,0),
    'total_comments',coalesce(p.total_comments,0),'total_shares',coalesce(p.total_shares,0)
  ) order by p.updated_at desc nulls last,p.id),'[]'::jsonb)
  into v_publications
  from (
    select cp.id,cp.brand_id,cp.content_type,cp.title,cp.description,cp.tags,
      cp.thumbnail_url,cp.scheduled_platforms,cp.status,cp.scheduled_at,
      cp.published_at,cp.created_at,cp.updated_at,cp.total_views,cp.total_likes,
      cp.total_comments,cp.total_shares
    from public.content_publications cp
    where cp.brand_id=p_brand_key
    order by cp.updated_at desc nulls last,cp.id
    limit 60
  ) p;

  select coalesce(jsonb_agg(jsonb_build_object(
    'platform',c.platform,'display_name',c.display_name,'is_active',true
  ) order by c.platform,c.display_name),'[]'::jsonb)
  into v_channels
  from public.social_channels c
  where c.brand_id=p_brand_key and c.is_active=true
    and c.platform in ('facebook','instagram','linkedin','youtube','tiktok','pinterest');

  return jsonb_build_object('publications',v_publications,'channels',v_channels);
end; $workspace_marketing_snapshot$;

revoke execute on function public.workspace_brand_marketing_snapshot(text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.workspace_brand_marketing_snapshot(text,uuid,text)
  to service_role;

-- Brand-scoped draft creation. It can only create status=draft and cannot
-- schedule or publish. Requested destination platforms must already be active
-- channels owned by the exact brand.
create or replace function public.workspace_brand_marketing_draft_create(
  p_brand_key text, p_user_id uuid, p_email text,
  p_title text, p_description text, p_tags text[], p_platforms text[]
) returns jsonb language plpgsql security invoker set search_path = '' as $workspace_marketing_draft$
declare
  v_brand_id uuid;
  v_publication record;
  v_tags text[] := coalesce(p_tags,'{}'::text[]);
  v_platforms text[] := coalesce(p_platforms,'{}'::text[]);
  v_platform text;
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or length(coalesce(p_title,'')) > 200
    or p_description is null or length(btrim(p_description)) < 1 or length(btrim(p_description)) > 5000
    or cardinality(v_tags) > 20 or cardinality(v_platforms) > 6
  then return null; end if;

  if exists (select 1 from unnest(v_tags) t where length(t) < 1 or length(t) > 60)
    or (select count(*) from unnest(v_tags)) <> (select count(distinct t) from unnest(v_tags) t)
    or (select count(*) from unnest(v_platforms)) <> (select count(distinct p) from unnest(v_platforms) p)
    or exists (
      select 1 from unnest(v_platforms) p
      where p not in ('facebook','instagram','linkedin','youtube','tiktok','pinterest')
    )
  then return null; end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['marketing.read','marketing.draft']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  foreach v_platform in array v_platforms loop
    if not exists (
      select 1 from public.social_channels c
      where c.brand_id=p_brand_key and c.platform=v_platform and c.is_active=true
    ) then
      return jsonb_build_object('ok',false,'error','CHANNEL_NOT_ACTIVE_FOR_BRAND');
    end if;
  end loop;

  insert into public.content_publications (
    brand_id,content_type,title,description,tags,scheduled_platforms,status,
    ai_generated,content_features
  ) values (
    p_brand_key,'social',nullif(btrim(coalesce(p_title,'')),''),
    btrim(p_description),v_tags,v_platforms,'draft',false,
    jsonb_build_object('workspace_draft',true)
  )
  returning id,brand_id,content_type,title,description,tags,thumbnail_url,
    scheduled_platforms,status,scheduled_at,published_at,created_at,updated_at,
    total_views,total_likes,total_comments,total_shares
  into v_publication;

  insert into core.brand_workspace_marketing_draft_audit
    (brand_id,publication_id,actor_user_id,actor_email)
  values (v_brand_id,v_publication.id,p_user_id,p_email);

  return jsonb_build_object(
    'ok',true,
    'publication',jsonb_build_object(
      'id',v_publication.id,'brand_id',v_publication.brand_id,
      'content_type',v_publication.content_type,'title',v_publication.title,
      'description',v_publication.description,'tags',v_publication.tags,
      'thumbnail_url',v_publication.thumbnail_url,
      'scheduled_platforms',v_publication.scheduled_platforms,
      'status',v_publication.status,'scheduled_at',v_publication.scheduled_at,
      'published_at',v_publication.published_at,'created_at',v_publication.created_at,
      'updated_at',v_publication.updated_at,
      'total_views',coalesce(v_publication.total_views,0),
      'total_likes',coalesce(v_publication.total_likes,0),
      'total_comments',coalesce(v_publication.total_comments,0),
      'total_shares',coalesce(v_publication.total_shares,0)
    )
  );
end; $workspace_marketing_draft$;

revoke execute on function public.workspace_brand_marketing_draft_create(
  text,uuid,text,text,text,text[],text[]
) from public, anon, authenticated;
grant execute on function public.workspace_brand_marketing_draft_create(
  text,uuid,text,text,text,text[],text[]
) to service_role;
