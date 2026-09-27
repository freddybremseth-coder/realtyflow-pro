-- Controlled staff social publishing for brand workspaces.
-- Staff can only queue an existing draft/failed publication for the exact brand.
-- Tokens, account identifiers and direct publisher primitives remain server-only.

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
        'corporate.read','corporate.plan',
        'visibility.read','visibility.plan',
        'ads.read','ads.draft','events.plan',
        'content.read','content.edit','content.publish',
        'email.read','email.draft','email.send'
      )
    ) then return false; end if;

    if ('marketing.draft'=any(v_permissions) and not ('marketing.read'=any(v_permissions)))
      or ('marketing.publish'=any(v_permissions) and
          (not ('marketing.read'=any(v_permissions)) or not ('marketing.draft'=any(v_permissions))))
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

create table if not exists core.brand_workspace_marketing_publish_audit (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references core.brands(id) on delete restrict,
  publication_id uuid not null references public.content_publications(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null,
  platforms text[] not null,
  queued_at timestamptz not null default now(),
  check (cardinality(platforms) between 1 and 3),
  check (platforms <@ array['facebook','instagram','linkedin']::text[])
);

create index if not exists brand_workspace_marketing_publish_audit_actor_idx
  on core.brand_workspace_marketing_publish_audit (brand_id,actor_user_id,queued_at desc);

alter table core.brand_workspace_marketing_publish_audit enable row level security;
revoke all on core.brand_workspace_marketing_publish_audit
  from public,anon,authenticated,service_role;
grant select,insert on core.brand_workspace_marketing_publish_audit to service_role;

create or replace function public.workspace_brand_marketing_publish_queue(
  p_brand_key text,p_user_id uuid,p_email text,p_publication_id uuid,p_platforms text[]
) returns jsonb language plpgsql security invoker set search_path='' as $workspace_marketing_publish_queue$
declare
  v_brand_id uuid;
  v_platforms text[] := coalesce(p_platforms,'{}'::text[]);
  v_platform text;
  v_channel_count integer;
  v_publication record;
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_publication_id is null
    or cardinality(v_platforms) not between 1 and 3
    or (select count(*) from unnest(v_platforms)) <>
       (select count(distinct p) from unnest(v_platforms) p)
    or exists (
      select 1 from unnest(v_platforms) p
      where p not in ('facebook','instagram','linkedin')
    )
  then return null; end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['marketing.read','marketing.draft','marketing.publish']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  foreach v_platform in array v_platforms loop
    select count(*)::integer into v_channel_count
    from public.social_channels c
    where c.brand_id=p_brand_key and c.platform=v_platform and c.is_active=true;

    if v_channel_count=0 then
      return jsonb_build_object('ok',false,'error','CHANNEL_NOT_ACTIVE_FOR_BRAND');
    end if;
    if v_channel_count<>1 then
      return jsonb_build_object('ok',false,'error','CHANNEL_NOT_UNIQUE_FOR_BRAND');
    end if;
  end loop;

  select cp.id,cp.brand_id,cp.content_type,cp.title,cp.description,cp.tags,
    cp.thumbnail_url,cp.ai_image_url,cp.scheduled_platforms,cp.status,
    cp.scheduled_at,cp.published_at,cp.created_at,cp.updated_at,
    cp.total_views,cp.total_likes,cp.total_comments,cp.total_shares
  into v_publication
  from public.content_publications cp
  where cp.id=p_publication_id and cp.brand_id=p_brand_key
    and cp.status in ('draft','failed')
    and cp.content_type='social'
    and length(btrim(coalesce(cp.description,'')))>0
  for update;

  if v_publication.id is null then
    return jsonb_build_object('ok',false,'error','PUBLICATION_NOT_PUBLISHABLE');
  end if;

  if 'instagram'=any(v_platforms)
    and nullif(btrim(coalesce(v_publication.ai_image_url,v_publication.thumbnail_url,'')),'') is null
  then
    return jsonb_build_object('ok',false,'error','INSTAGRAM_IMAGE_REQUIRED');
  end if;

  update public.content_publications set
    status='scheduled',
    scheduled_at=now(),
    scheduled_platforms=v_platforms,
    publish_attempts=0,
    last_publish_error=null,
    updated_at=now()
  where id=v_publication.id
  returning id,brand_id,content_type,title,description,tags,thumbnail_url,
    scheduled_platforms,status,scheduled_at,published_at,created_at,updated_at,
    total_views,total_likes,total_comments,total_shares
  into v_publication;

  insert into core.brand_workspace_marketing_publish_audit
    (brand_id,publication_id,actor_user_id,actor_email,platforms)
  values (v_brand_id,v_publication.id,p_user_id,p_email,v_platforms);

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
end; $workspace_marketing_publish_queue$;

revoke execute on function public.workspace_brand_marketing_publish_queue(
  text,uuid,text,uuid,text[]
) from public,anon,authenticated;
grant execute on function public.workspace_brand_marketing_publish_queue(
  text,uuid,text,uuid,text[]
) to service_role;
