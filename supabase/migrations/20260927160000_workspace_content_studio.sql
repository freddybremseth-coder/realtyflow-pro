-- Brand-scoped Website & Content Studio for workspace members.
-- Drafting is isolated from live website content. Publishing requires its own
-- permission and every successful publish stores a restorable version.

alter table core.brand_workspace_memberships
  drop constraint if exists brand_workspace_memberships_permissions_check;
alter table core.brand_workspace_memberships
  add constraint brand_workspace_memberships_permissions_check
  check (permissions <@ array[
    'crm.read','crm.write','crm.joint.read','crm.joint.write',
    'tasks.joint.read','tasks.joint.write','properties.catalog.read',
    'marketing.read','marketing.draft','marketing.publish',
    'corporate.read','corporate.plan',
    'visibility.read','visibility.plan',
    'ads.read','ads.draft','events.plan',
    'content.read','content.edit','content.publish'
  ]::text[]);

alter table core.brand_workspace_access_plans
  drop constraint if exists brand_workspace_access_plans_permissions_check;
alter table core.brand_workspace_access_plans
  add constraint brand_workspace_access_plans_permissions_check
  check (permissions <@ array[
    'crm.read','crm.write','crm.joint.read','crm.joint.write',
    'tasks.joint.read','tasks.joint.write','properties.catalog.read',
    'marketing.read','marketing.draft','marketing.publish',
    'corporate.read','corporate.plan',
    'visibility.read','visibility.plan',
    'ads.read','ads.draft','events.plan',
    'content.read','content.edit','content.publish'
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
      or jsonb_array_length(item->'permissions') > 20
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
        'content.read','content.edit','content.publish'
      )
    ) then return false; end if;

    if 'marketing.publish'=any(v_permissions) then return false; end if;
    if ('marketing.draft'=any(v_permissions) and not ('marketing.read'=any(v_permissions)))
      or ('corporate.plan'=any(v_permissions) and not ('corporate.read'=any(v_permissions)))
      or ('visibility.plan'=any(v_permissions) and not ('visibility.read'=any(v_permissions)))
      or ('ads.draft'=any(v_permissions) and not ('ads.read'=any(v_permissions)))
      or ('content.edit'=any(v_permissions) and not ('content.read'=any(v_permissions)))
      or ('content.publish'=any(v_permissions) and
          (not ('content.read'=any(v_permissions)) or not ('content.edit'=any(v_permissions))))
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

create table if not exists core.brand_workspace_content_drafts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references core.brands(id) on delete restrict,
  destination_id text not null,
  destination_label text not null,
  destination_path text not null,
  content_type text not null check (content_type in ('article','guide','magazine')),
  title text not null check (length(title) between 1 and 200),
  slug text not null check (length(slug) between 1 and 160 and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  summary text not null default '' check (length(summary) <= 700),
  markdown text not null default '' check (length(markdown) <= 60000),
  image_url text,
  tags text[] not null default '{}'::text[],
  primary_keyword text,
  supporting_keywords text[] not null default '{}'::text[],
  audience text,
  source_publication_id uuid references public.content_publications(id) on delete set null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_by_email text not null,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_email text not null,
  published_at timestamptz,
  last_publish_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id,destination_id,slug)
);
alter table core.brand_workspace_content_drafts enable row level security;
revoke all on core.brand_workspace_content_drafts from public, anon, authenticated, service_role;
grant select,insert,update on core.brand_workspace_content_drafts to service_role;

create table if not exists core.brand_workspace_content_versions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references core.brands(id) on delete restrict,
  draft_id uuid not null references core.brand_workspace_content_drafts(id) on delete restrict,
  publication_id uuid references public.content_publications(id) on delete set null,
  version_no integer not null check (version_no > 0),
  snapshot jsonb not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null,
  created_at timestamptz not null default now(),
  unique (draft_id,version_no)
);
alter table core.brand_workspace_content_versions enable row level security;
revoke all on core.brand_workspace_content_versions from public, anon, authenticated, service_role;
grant select,insert on core.brand_workspace_content_versions to service_role;

create or replace function public.workspace_brand_content_snapshot(
  p_brand_key text, p_user_id uuid, p_email text
) returns jsonb language plpgsql security invoker set search_path = '' as $workspace_content_snapshot$
declare
  v_brand_id uuid;
  v_drafts jsonb;
  v_publications jsonb;
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
  then return null; end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['content.read']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'destinationId',d.destination_id,'destinationLabel',d.destination_label,
    'destinationPath',d.destination_path,'contentType',d.content_type,
    'title',d.title,'slug',d.slug,'summary',d.summary,'markdown',d.markdown,
    'imageUrl',d.image_url,'tags',d.tags,'primaryKeyword',d.primary_keyword,
    'supportingKeywords',d.supporting_keywords,'audience',d.audience,
    'sourcePublicationId',d.source_publication_id,'publishedAt',d.published_at,
    'lastPublishError',d.last_publish_error,'createdAt',d.created_at,'updatedAt',d.updated_at
  ) order by d.updated_at desc,d.id),'[]'::jsonb)
  into v_drafts
  from core.brand_workspace_content_drafts d
  where d.brand_id=v_brand_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'contentType',p.content_type,'title',p.title,
    'markdown',p.description,'summary',p.ai_description,'tags',p.tags,
    'imageUrl',coalesce(p.ai_image_url,p.media_urls[1]),'status',p.status,
    'publishedAt',p.published_at,'updatedAt',p.updated_at
  ) order by p.updated_at desc nulls last,p.id),'[]'::jsonb)
  into v_publications
  from (
    select cp.id,cp.content_type,cp.title,cp.description,cp.ai_description,cp.tags,
      cp.ai_image_url,cp.media_urls,cp.status,cp.published_at,cp.updated_at
    from public.content_publications cp
    where cp.brand_id=p_brand_key
      and (cp.content_type like 'website_%' or cp.tags @> array['website']::text[])
    order by cp.updated_at desc nulls last,cp.id
    limit 100
  ) p;

  return jsonb_build_object('drafts',v_drafts,'published',v_publications);
end; $workspace_content_snapshot$;

revoke execute on function public.workspace_brand_content_snapshot(text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.workspace_brand_content_snapshot(text,uuid,text)
  to service_role;

create or replace function public.workspace_brand_content_draft_save(
  p_brand_key text, p_user_id uuid, p_email text, p_draft_id uuid,
  p_destination_id text, p_destination_label text, p_destination_path text,
  p_content_type text, p_title text, p_slug text, p_summary text,
  p_markdown text, p_image_url text, p_tags text[],
  p_primary_keyword text, p_supporting_keywords text[], p_audience text,
  p_source_publication_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $workspace_content_save$
declare
  v_brand_id uuid;
  v_row core.brand_workspace_content_drafts%rowtype;
  v_tags text[] := coalesce(p_tags,'{}'::text[]);
  v_supporting text[] := coalesce(p_supporting_keywords,'{}'::text[]);
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null or p_email is null or p_email <> lower(btrim(p_email))
    or p_destination_id is null or length(btrim(p_destination_id)) not between 1 and 80
    or p_destination_label is null or length(btrim(p_destination_label)) not between 1 and 120
    or p_destination_path is null or length(btrim(p_destination_path)) not between 1 and 180
    or p_content_type not in ('article','guide','magazine')
    or p_title is null or length(btrim(p_title)) not between 1 and 200
    or p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(p_slug)>160
    or length(coalesce(p_summary,''))>700
    or length(coalesce(p_markdown,''))>60000
    or length(coalesce(p_image_url,''))>2000
    or length(coalesce(p_primary_keyword,''))>160
    or length(coalesce(p_audience,''))>500
    or cardinality(v_tags)>30 or cardinality(v_supporting)>20
    or exists(select 1 from unnest(v_tags) x where length(x)>80)
    or exists(select 1 from unnest(v_supporting) x where length(x)>160)
  then return null; end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['content.read','content.edit']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  if p_source_publication_id is not null and not exists (
    select 1 from public.content_publications cp
    where cp.id=p_source_publication_id and cp.brand_id=p_brand_key
      and (cp.content_type like 'website_%' or cp.tags @> array['website']::text[])
  ) then return null; end if;

  if p_draft_id is null then
    insert into core.brand_workspace_content_drafts (
      brand_id,destination_id,destination_label,destination_path,content_type,
      title,slug,summary,markdown,image_url,tags,primary_keyword,supporting_keywords,
      audience,source_publication_id,created_by_user_id,created_by_email,
      updated_by_user_id,updated_by_email
    ) values (
      v_brand_id,btrim(p_destination_id),btrim(p_destination_label),btrim(p_destination_path),p_content_type,
      btrim(p_title),p_slug,btrim(coalesce(p_summary,'')),coalesce(p_markdown,''),
      nullif(btrim(coalesce(p_image_url,'')),''),
      v_tags,nullif(btrim(coalesce(p_primary_keyword,'')),''),
      v_supporting,nullif(btrim(coalesce(p_audience,'')),''),
      p_source_publication_id,p_user_id,p_email,p_user_id,p_email
    )
    returning * into v_row;
  else
    update core.brand_workspace_content_drafts d set
      destination_id=btrim(p_destination_id),
      destination_label=btrim(p_destination_label),
      destination_path=btrim(p_destination_path),
      content_type=p_content_type,title=btrim(p_title),slug=p_slug,
      summary=btrim(coalesce(p_summary,'')),markdown=coalesce(p_markdown,''),
      image_url=nullif(btrim(coalesce(p_image_url,'')),''),
      tags=v_tags,primary_keyword=nullif(btrim(coalesce(p_primary_keyword,'')),''),
      supporting_keywords=v_supporting,audience=nullif(btrim(coalesce(p_audience,'')),''),
      source_publication_id=coalesce(p_source_publication_id,d.source_publication_id),
      updated_by_user_id=p_user_id,updated_by_email=p_email,updated_at=now()
    where d.id=p_draft_id and d.brand_id=v_brand_id
    returning * into v_row;
    if v_row.id is null then return null; end if;
  end if;

  return jsonb_build_object(
    'id',v_row.id,'destinationId',v_row.destination_id,'destinationLabel',v_row.destination_label,
    'destinationPath',v_row.destination_path,'contentType',v_row.content_type,
    'title',v_row.title,'slug',v_row.slug,'summary',v_row.summary,'markdown',v_row.markdown,
    'imageUrl',v_row.image_url,'tags',v_row.tags,'primaryKeyword',v_row.primary_keyword,
    'supportingKeywords',v_row.supporting_keywords,'audience',v_row.audience,
    'sourcePublicationId',v_row.source_publication_id,'publishedAt',v_row.published_at,
    'lastPublishError',v_row.last_publish_error,'updatedAt',v_row.updated_at
  );
exception
  when unique_violation then return jsonb_build_object('error','SLUG_ALREADY_EXISTS');
end; $workspace_content_save$;

revoke execute on function public.workspace_brand_content_draft_save(
  text,uuid,text,uuid,text,text,text,text,text,text,text,text,text,text[],text,text[],text,uuid
) from public,anon,authenticated;
grant execute on function public.workspace_brand_content_draft_save(
  text,uuid,text,uuid,text,text,text,text,text,text,text,text,text,text[],text,text[],text,uuid
) to service_role;

create or replace function public.workspace_brand_content_publish_payload(
  p_brand_key text,p_user_id uuid,p_email text,p_draft_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $workspace_content_publish_payload$
declare
  v_brand_id uuid;
  d core.brand_workspace_content_drafts%rowtype;
begin
  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['content.read','content.edit','content.publish']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  select * into d from core.brand_workspace_content_drafts
  where id=p_draft_id and brand_id=v_brand_id;
  if d.id is null then return null; end if;

  return jsonb_build_object(
    'id',d.id,'destinationId',d.destination_id,'destinationLabel',d.destination_label,
    'destinationPath',d.destination_path,'contentType',d.content_type,
    'title',d.title,'slug',d.slug,'summary',d.summary,'markdown',d.markdown,
    'imageUrl',d.image_url,'tags',d.tags,'primaryKeyword',d.primary_keyword,
    'supportingKeywords',d.supporting_keywords,'audience',d.audience,
    'sourcePublicationId',d.source_publication_id,'updatedAt',d.updated_at
  );
end; $workspace_content_publish_payload$;

revoke execute on function public.workspace_brand_content_publish_payload(text,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.workspace_brand_content_publish_payload(text,uuid,text,uuid)
  to service_role;

create or replace function public.workspace_brand_content_publish_finalize(
  p_brand_key text,p_user_id uuid,p_email text,p_draft_id uuid,
  p_success boolean,p_error text
) returns jsonb language plpgsql security invoker set search_path='' as $workspace_content_publish_finalize$
declare
  v_brand_id uuid;
  d core.brand_workspace_content_drafts%rowtype;
  v_publication_id uuid;
  v_version integer;
  v_tags text[];
  v_snapshot jsonb;
begin
  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['content.read','content.edit','content.publish']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  select * into d from core.brand_workspace_content_drafts
  where id=p_draft_id and brand_id=v_brand_id
  for update;
  if d.id is null then return null; end if;

  if not p_success then
    update core.brand_workspace_content_drafts
      set last_publish_error=left(coalesce(p_error,'Publisering feilet'),1000),
          updated_by_user_id=p_user_id,updated_by_email=p_email,updated_at=now()
      where id=d.id;
    return jsonb_build_object('ok',false,'draftId',d.id,'error',left(coalesce(p_error,'Publisering feilet'),1000));
  end if;

  v_tags := array(select distinct x from unnest(
    array['website','cms:'||d.destination_id,'slug:'||d.slug] ||
    coalesce(d.tags,'{}'::text[]) ||
    coalesce(d.supporting_keywords,'{}'::text[]) ||
    case when d.primary_keyword is null then '{}'::text[] else array[d.primary_keyword] end
  ) x where length(x)>0);

  if d.source_publication_id is not null then
    update public.content_publications cp set
      content_type='website_'||d.content_type,title=d.title,description=d.markdown,
      tags=v_tags,media_urls=case when d.image_url is null then '{}'::text[] else array[d.image_url] end,
      ai_generated=false,ai_title=d.title,ai_description=d.summary,ai_tags=v_tags,
      ai_image_url=d.image_url,status='published',scheduled_platforms=array['website']::text[],
      published_at=now(),updated_at=now(),last_publish_error=null,
      content_features=coalesce(cp.content_features,'{}'::jsonb) || jsonb_build_object(
        'workspace_content_draft_id',d.id,'primary_keyword',d.primary_keyword,
        'supporting_keywords',d.supporting_keywords,'audience',d.audience
      )
    where cp.id=d.source_publication_id and cp.brand_id=p_brand_key
    returning cp.id into v_publication_id;
  end if;

  if v_publication_id is null then
    insert into public.content_publications(
      brand_id,content_type,title,description,tags,media_urls,ai_generated,
      ai_title,ai_description,ai_tags,ai_image_url,status,scheduled_platforms,
      published_at,updated_at,last_publish_error,content_features
    ) values (
      p_brand_key,'website_'||d.content_type,d.title,d.markdown,v_tags,
      case when d.image_url is null then '{}'::text[] else array[d.image_url] end,
      false,d.title,d.summary,v_tags,d.image_url,'published',array['website']::text[],
      now(),now(),null,jsonb_build_object(
        'workspace_content_draft_id',d.id,'primary_keyword',d.primary_keyword,
        'supporting_keywords',d.supporting_keywords,'audience',d.audience
      )
    ) returning id into v_publication_id;
  end if;

  select coalesce(max(version_no),0)+1 into v_version
  from core.brand_workspace_content_versions where draft_id=d.id;

  v_snapshot := jsonb_build_object(
    'destinationId',d.destination_id,'destinationLabel',d.destination_label,
    'destinationPath',d.destination_path,'contentType',d.content_type,
    'title',d.title,'slug',d.slug,'summary',d.summary,'markdown',d.markdown,
    'imageUrl',d.image_url,'tags',d.tags,'primaryKeyword',d.primary_keyword,
    'supportingKeywords',d.supporting_keywords,'audience',d.audience
  );

  insert into core.brand_workspace_content_versions(
    brand_id,draft_id,publication_id,version_no,snapshot,actor_user_id,actor_email
  ) values (v_brand_id,d.id,v_publication_id,v_version,v_snapshot,p_user_id,p_email);

  update core.brand_workspace_content_drafts set
    source_publication_id=v_publication_id,published_at=now(),last_publish_error=null,
    updated_by_user_id=p_user_id,updated_by_email=p_email,updated_at=now()
  where id=d.id;

  return jsonb_build_object('ok',true,'draftId',d.id,'publicationId',v_publication_id,'version',v_version);
end; $workspace_content_publish_finalize$;

revoke execute on function public.workspace_brand_content_publish_finalize(text,uuid,text,uuid,boolean,text)
  from public,anon,authenticated;
grant execute on function public.workspace_brand_content_publish_finalize(text,uuid,text,uuid,boolean,text)
  to service_role;

create or replace function public.workspace_brand_content_versions(
  p_brand_key text,p_user_id uuid,p_email text,p_draft_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $workspace_content_versions$
declare
  v_brand_id uuid;
  v_versions jsonb;
begin
  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['content.read']::text[]
  for share of m;
  if v_brand_id is null or not exists(
    select 1 from core.brand_workspace_content_drafts d
    where d.id=p_draft_id and d.brand_id=v_brand_id
  ) then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v.id,'version',v.version_no,'snapshot',v.snapshot,'createdAt',v.created_at
  ) order by v.version_no desc),'[]'::jsonb)
  into v_versions
  from core.brand_workspace_content_versions v
  where v.draft_id=p_draft_id and v.brand_id=v_brand_id;

  return v_versions;
end; $workspace_content_versions$;

revoke execute on function public.workspace_brand_content_versions(text,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.workspace_brand_content_versions(text,uuid,text,uuid)
  to service_role;

create or replace function public.workspace_brand_content_restore_version(
  p_brand_key text,p_user_id uuid,p_email text,p_draft_id uuid,p_version integer
) returns jsonb language plpgsql security invoker set search_path='' as $workspace_content_restore$
declare
  v_brand_id uuid;
  s jsonb;
  d core.brand_workspace_content_drafts%rowtype;
begin
  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['content.read','content.edit']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  select v.snapshot into s from core.brand_workspace_content_versions v
  where v.draft_id=p_draft_id and v.brand_id=v_brand_id and v.version_no=p_version;
  if s is null then return null; end if;

  update core.brand_workspace_content_drafts set
    destination_id=s->>'destinationId',destination_label=s->>'destinationLabel',
    destination_path=s->>'destinationPath',content_type=s->>'contentType',
    title=s->>'title',slug=s->>'slug',summary=coalesce(s->>'summary',''),
    markdown=coalesce(s->>'markdown',''),image_url=nullif(s->>'imageUrl',''),
    tags=coalesce(array(select jsonb_array_elements_text(coalesce(s->'tags','[]'::jsonb))),'{}'::text[]),
    primary_keyword=nullif(s->>'primaryKeyword',''),
    supporting_keywords=coalesce(array(select jsonb_array_elements_text(coalesce(s->'supportingKeywords','[]'::jsonb))),'{}'::text[]),
    audience=nullif(s->>'audience',''),last_publish_error=null,
    updated_by_user_id=p_user_id,updated_by_email=p_email,updated_at=now()
  where id=p_draft_id and brand_id=v_brand_id
  returning * into d;
  if d.id is null then return null; end if;

  return jsonb_build_object(
    'id',d.id,'destinationId',d.destination_id,'destinationLabel',d.destination_label,
    'destinationPath',d.destination_path,'contentType',d.content_type,
    'title',d.title,'slug',d.slug,'summary',d.summary,'markdown',d.markdown,
    'imageUrl',d.image_url,'tags',d.tags,'primaryKeyword',d.primary_keyword,
    'supportingKeywords',d.supporting_keywords,'audience',d.audience,
    'sourcePublicationId',d.source_publication_id,'publishedAt',d.published_at,
    'lastPublishError',d.last_publish_error,'updatedAt',d.updated_at,
    'restoredVersion',p_version
  );
end; $workspace_content_restore$;

revoke execute on function public.workspace_brand_content_restore_version(text,uuid,text,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.workspace_brand_content_restore_version(text,uuid,text,uuid,integer)
  to service_role;
