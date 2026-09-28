-- Enable audited, brand-scoped employee publishing to connected social channels.
-- Only Facebook / Instagram / LinkedIn are enabled here. Reels and YouTube remain
-- separate modules with their own media/channel boundaries.

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

    if ('marketing.publish'=any(v_permissions) and
        (not ('marketing.read'=any(v_permissions)) or not ('marketing.draft'=any(v_permissions))))
      or ('marketing.draft'=any(v_permissions) and not ('marketing.read'=any(v_permissions)))
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



create table if not exists core.brand_workspace_social_publish_attempts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references core.brands(id) on delete restrict,
  publication_id uuid not null references public.content_publications(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null,
  selected_channels jsonb not null,
  status text not null default 'publishing'
    check (status in ('publishing','published','failed')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists brand_workspace_social_publish_one_live_attempt
  on core.brand_workspace_social_publish_attempts(publication_id)
  where status='publishing';
create index if not exists brand_workspace_social_publish_actor_idx
  on core.brand_workspace_social_publish_attempts(brand_id,actor_user_id,created_at desc);
alter table core.brand_workspace_social_publish_attempts enable row level security;
revoke all on core.brand_workspace_social_publish_attempts from public,anon,authenticated,service_role;
grant select,insert,update on core.brand_workspace_social_publish_attempts to service_role;

create or replace function public.workspace_brand_social_publish_snapshot(
  p_brand_key text,p_user_id uuid,p_email text
) returns jsonb language plpgsql security invoker set search_path='' as $workspace_social_snapshot$
declare
  v_brand_id uuid;
  v_channels jsonb := '[]'::jsonb;
  v_publications jsonb := '[]'::jsonb;
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null or p_email is null or p_email<>lower(btrim(p_email))
  then return null; end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['marketing.read','marketing.draft','marketing.publish']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'platform',c.platform,'displayName',c.display_name
  ) order by c.platform,c.display_name,c.id),'[]'::jsonb)
  into v_channels
  from public.social_channels c
  where c.brand_id=p_brand_key and c.is_active=true
    and c.platform in ('facebook','instagram','linkedin');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,
    'hasImage',p.has_image,
    'plannedPlatforms',p.planned_platforms
  ) order by p.updated_at desc,p.id),'[]'::jsonb)
  into v_publications
  from (
    select cp.id,cp.updated_at,
      (coalesce(nullif(btrim(cp.ai_image_url),''),
                nullif(btrim(cp.thumbnail_url),''),
                nullif(btrim(cp.media_urls[1]),'')) is not null) as has_image,
      coalesce((
        select array_agg(x order by x)
        from (
          select distinct lower(btrim(platform)) as x
          from unnest(coalesce(cp.scheduled_platforms,'{}'::text[])) platform
          where lower(btrim(platform)) in ('facebook','instagram','linkedin')
        ) planned
      ),'{}'::text[]) as planned_platforms
    from public.content_publications cp
    where cp.brand_id=p_brand_key
      and cp.status in ('draft','failed')
      and cp.content_type in ('image_post','marketing_post','post','social','social_post')
      and length(btrim(coalesce(cp.description,''))) > 0
    order by cp.updated_at desc nulls last,cp.id
    limit 60
  ) p;

  return jsonb_build_object('channels',v_channels,'publications',v_publications);
end; $workspace_social_snapshot$;

revoke execute on function public.workspace_brand_social_publish_snapshot(text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.workspace_brand_social_publish_snapshot(text,uuid,text)
  to service_role;

create or replace function public.workspace_brand_social_publish_prepare(
  p_brand_key text,p_user_id uuid,p_email text,p_publication_id uuid,p_channel_ids uuid[]
) returns jsonb language plpgsql security invoker set search_path='' as $workspace_social_prepare$
declare
  v_brand_id uuid;
  v_pub record;
  v_channels jsonb;
  v_channel_count integer;
  v_platform_count integer;
  v_image_url text;
  v_attempt_id uuid;
  v_planned text[];
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null or p_email is null or p_email<>lower(btrim(p_email))
    or p_publication_id is null or p_channel_ids is null
    or cardinality(p_channel_ids) not between 1 and 3
    or cardinality(p_channel_ids) <> (select count(distinct x) from unnest(p_channel_ids) x)
  then return jsonb_build_object('ok',false,'error','INVALID_PUBLISH_REQUEST'); end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['marketing.read','marketing.draft','marketing.publish']::text[]
  for share of m;
  if v_brand_id is null then return jsonb_build_object('ok',false,'error','ACCESS_DENIED'); end if;

  if exists (
    select 1 from core.brand_workspace_social_publish_attempts a
    where a.publication_id=p_publication_id and a.status='publishing'
  ) then
    return jsonb_build_object('ok',false,'error','PUBLISH_ATTEMPT_REQUIRES_REVIEW');
  end if;

  select cp.id,cp.brand_id,cp.content_type,cp.description,cp.ai_image_url,
         cp.thumbnail_url,cp.media_urls,cp.scheduled_platforms,cp.status
  into v_pub
  from public.content_publications cp
  where cp.id=p_publication_id and cp.brand_id=p_brand_key
    and cp.status in ('draft','failed')
    and cp.content_type in ('image_post','marketing_post','post','social','social_post')
    and length(btrim(coalesce(cp.description,''))) > 0
  for update;
  if v_pub.id is null then
    return jsonb_build_object('ok',false,'error','PUBLICATION_NOT_PUBLISHABLE');
  end if;

  select count(*)::integer,count(distinct c.platform)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'id',c.id,'platform',c.platform,'displayName',c.display_name
         ) order by c.platform,c.display_name,c.id),'[]'::jsonb)
  into v_channel_count,v_platform_count,v_channels
  from public.social_channels c
  where c.id=any(p_channel_ids)
    and c.brand_id=p_brand_key and c.is_active=true
    and c.platform in ('facebook','instagram','linkedin');

  if v_channel_count<>cardinality(p_channel_ids) or v_platform_count<>v_channel_count then
    return jsonb_build_object('ok',false,'error','CHANNEL_SCOPE_INVALID');
  end if;

  select coalesce(array_agg(distinct lower(btrim(platform)) order by lower(btrim(platform))),'{}'::text[])
  into v_planned
  from unnest(coalesce(v_pub.scheduled_platforms,'{}'::text[])) platform
  where lower(btrim(platform)) in ('facebook','instagram','linkedin');

  if cardinality(v_planned)>0 and exists (
    select 1
    from jsonb_array_elements(v_channels) c
    where not ((c->>'platform')=any(v_planned))
  ) then
    return jsonb_build_object('ok',false,'error','PLATFORM_NOT_PLANNED_FOR_DRAFT');
  end if;

  v_image_url := coalesce(
    nullif(btrim(v_pub.ai_image_url),''),
    nullif(btrim(v_pub.thumbnail_url),''),
    nullif(btrim(v_pub.media_urls[1]),'')
  );
  if exists (
    select 1 from jsonb_array_elements(v_channels) c where c->>'platform'='instagram'
  ) and v_image_url is null then
    return jsonb_build_object('ok',false,'error','INSTAGRAM_IMAGE_REQUIRED');
  end if;

  insert into core.brand_workspace_social_publish_attempts(
    brand_id,publication_id,actor_user_id,actor_email,selected_channels,status
  ) values (
    v_brand_id,p_publication_id,p_user_id,p_email,v_channels,'publishing'
  ) returning id into v_attempt_id;

  update public.content_publications set
    status='processing',
    publish_attempts=coalesce(publish_attempts,0)+1,
    last_publish_error=null,
    updated_at=now()
  where id=p_publication_id and brand_id=p_brand_key;

  return jsonb_build_object(
    'ok',true,'attemptId',v_attempt_id,'publicationId',p_publication_id,
    'content',v_pub.description,'imageUrl',v_image_url,'channels',v_channels
  );
exception
  when unique_violation then
    return jsonb_build_object('ok',false,'error','PUBLISH_ATTEMPT_REQUIRES_REVIEW');
end; $workspace_social_prepare$;

revoke execute on function public.workspace_brand_social_publish_prepare(text,uuid,text,uuid,uuid[])
  from public,anon,authenticated;
grant execute on function public.workspace_brand_social_publish_prepare(text,uuid,text,uuid,uuid[])
  to service_role;

create or replace function public.workspace_brand_social_publish_finalize(
  p_brand_key text,p_user_id uuid,p_email text,p_attempt_id uuid,
  p_success boolean,p_result jsonb,p_error text
) returns jsonb language plpgsql security invoker set search_path='' as $workspace_social_finalize$
declare
  v_brand_id uuid;
  v_attempt record;
begin
  select b.id into v_brand_id
  from core.brands b where b.brand_key=p_brand_key;
  if v_brand_id is null or p_user_id is null or p_attempt_id is null
    or p_email is null or p_email<>lower(btrim(p_email))
  then return null; end if;

  select * into v_attempt
  from core.brand_workspace_social_publish_attempts a
  where a.id=p_attempt_id and a.brand_id=v_brand_id
    and a.actor_user_id=p_user_id and a.actor_email=p_email
    and a.status='publishing'
  for update;
  if v_attempt.id is null then return null; end if;

  update core.brand_workspace_social_publish_attempts set
    status=case when p_success then 'published' else 'failed' end,
    result=coalesce(p_result,'[]'::jsonb),
    error=case when p_success then null else left(coalesce(p_error,'Publisering feilet'),2000) end,
    updated_at=now(),completed_at=now()
  where id=p_attempt_id;

  update public.content_publications set
    status=case when p_success then 'published' else 'failed' end,
    published_at=case when p_success then coalesce(published_at,now()) else published_at end,
    last_publish_error=case when p_success then null else left(coalesce(p_error,'Publisering feilet'),2000) end,
    updated_at=now()
  where id=v_attempt.publication_id and brand_id=p_brand_key;

  return jsonb_build_object(
    'ok',true,'attemptId',p_attempt_id,'publicationId',v_attempt.publication_id,
    'status',case when p_success then 'published' else 'failed' end
  );
end; $workspace_social_finalize$;

revoke execute on function public.workspace_brand_social_publish_finalize(
  text,uuid,text,uuid,boolean,jsonb,text
) from public,anon,authenticated;
grant execute on function public.workspace_brand_social_publish_finalize(
  text,uuid,text,uuid,boolean,jsonb,text
) to service_role;
