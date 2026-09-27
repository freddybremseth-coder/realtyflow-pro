-- Enable production-safe workspace marketing + growth capabilities.
-- Sending, publishing, external invitations and ad spend remain deliberately unavailable.

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
    'ads.read','ads.draft','events.plan'
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
        'ads.read','ads.draft','events.plan'
      )
    ) then return false; end if;

    -- Workspace publishing remains closed until employee-specific channel
    -- ownership + publish preflight is implemented end-to-end.
    if 'marketing.publish'=any(v_permissions) then return false; end if;
    if 'marketing.draft'=any(v_permissions) and not ('marketing.read'=any(v_permissions))
      or ('corporate.plan'=any(v_permissions) and not ('corporate.read'=any(v_permissions)))
      or ('visibility.plan'=any(v_permissions) and not ('visibility.read'=any(v_permissions)))
      or ('ads.draft'=any(v_permissions) and not ('ads.read'=any(v_permissions)))
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


-- Growth/Corporate work audit stores actor and work-item identity only.
create table if not exists core.brand_workspace_growth_work_audit (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references core.brands(id) on delete restrict,
  work_item_id uuid not null references public.work_items(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null,
  work_kind text not null check (work_kind in (
    'corporate','seo','geo','aeo','keywords','content','ads','video','info_meeting'
  )),
  created_at timestamptz not null default now()
);
alter table core.brand_workspace_growth_work_audit enable row level security;
revoke all on core.brand_workspace_growth_work_audit from public, anon, authenticated, service_role;
grant select, insert on core.brand_workspace_growth_work_audit to service_role;

-- One atomic snapshot powers the employee Growth/Corporate workspace. Sections
-- are populated only when the exact current membership contains the matching
-- permission. No personal CRM history, OAuth identifiers, tokens or ad-spend
-- execution primitives are returned.
create or replace function public.workspace_brand_growth_snapshot(
  p_brand_key text, p_user_id uuid, p_email text
) returns jsonb language plpgsql security invoker set search_path = '' as $workspace_growth_snapshot$
declare
  v_brand_id uuid;
  v_permissions text[];
  v_corporate jsonb := null;
  v_visibility jsonb := null;
  v_ads jsonb := null;
  v_planned jsonb := '[]'::jsonb;
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then return null; end if;

  select b.id,m.permissions into v_brand_id,v_permissions
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
  for share of m;
  if v_brand_id is null then return null; end if;

  if p_brand_key='zeneco' and 'corporate.read'=any(v_permissions) then
    select jsonb_build_object(
      'prospects',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',p.id,'companyName',p.company_name,'organizationType',p.organization_type,
          'countryCode',p.country_code,'city',p.city,'industry',p.industry,
          'employeeCount',p.employee_count,'memberCount',p.member_count,
          'websiteUrl',p.website_url,'linkedinCompanyUrl',p.linkedin_company_url,
          'status',p.status,'fitScore',p.fit_score,'fitTier',p.fit_tier,
          'fitReasons',p.fit_reasons,'evidenceGaps',p.evidence_gaps,
          'decisionRoles',p.decision_roles,'sourceUrl',p.source_url,
          'nextAction',p.next_action,'nextFollowup',p.next_followup,
          'updatedAt',p.updated_at
        ) order by p.fit_score desc,p.updated_at desc)
        from (
          select * from public.corporate_prospects
          where brand_id='zeneco'
          order by fit_score desc,updated_at desc
          limit 100
        ) p
      ),'[]'::jsonb),
      'partners',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',p.id,'companyName',p.company_name,'partnerType',p.partner_type,
          'countryCode',p.country_code,'city',p.city,'industry',p.industry,
          'employeeCount',p.employee_count,'websiteUrl',p.website_url,
          'status',p.status,'fitScore',p.fit_score,'fitTier',p.fit_tier,
          'fitReasons',p.fit_reasons,'evidenceGaps',p.evidence_gaps,
          'referralAngle',p.referral_angle,'sourceUrl',p.source_url,
          'nextAction',p.next_action,'nextFollowup',p.next_followup,
          'updatedAt',p.updated_at
        ) order by p.fit_score desc,p.updated_at desc)
        from (
          select * from public.corporate_partner_prospects
          where brand_id='zeneco'
          order by fit_score desc,updated_at desc
          limit 100
        ) p
      ),'[]'::jsonb)
    ) into v_corporate;
  end if;

  if 'visibility.read'=any(v_permissions) then
    select jsonb_build_object(
      'searchDiscovery',coalesce((
        select jsonb_agg(jsonb_build_object(
          'source',d.source,'arrivals',d.arrivals
        ) order by d.arrivals desc,d.source)
        from (
          select e.source,count(*)::integer arrivals
          from public.search_discovery_events e
          where e.brand_id=p_brand_key and e.occurred_at >= now()-interval '30 days'
          group by e.source
          order by arrivals desc,e.source
          limit 20
        ) d
      ),'[]'::jsonb),
      'topPaths',coalesce((
        select jsonb_agg(jsonb_build_object(
          'path',d.path,'arrivals',d.arrivals
        ) order by d.arrivals desc,d.path)
        from (
          select e.path,count(*)::integer arrivals
          from public.search_discovery_events e
          where e.brand_id=p_brand_key and e.occurred_at >= now()-interval '30 days'
          group by e.path
          order by arrivals desc,e.path
          limit 20
        ) d
      ),'[]'::jsonb),
      'seoWork',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',w.id,'title',w.title,'description',w.description,
          'status',w.status,'priority',w.priority,'dueDate',w.due_date,
          'nextAction',w.next_action,'updatedAt',w.updated_at
        ) order by w.updated_at desc nulls last,w.id)
        from (
          select * from public.work_items
          where brand_id=p_brand_key and assigned_agent='seo'
            and status in ('TO_DO','IN_PROGRESS','REVIEW')
          order by updated_at desc nulls last,id
          limit 60
        ) w
      ),'[]'::jsonb)
    ) into v_visibility;
  end if;

  if 'ads.read'=any(v_permissions) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'name',a.name,'productName',a.product_name,
      'targetMarkets',a.target_markets,'audienceSegments',a.audience_segments,
      'funnelStage',a.funnel_stage,'offer',a.offer,'status',a.status,
      'totalCreatives',a.total_creatives,'estimatedCostUsd',a.estimated_cost_usd,
      'growthGoal',a.growth_goal,'createdAt',a.created_at,'updatedAt',a.updated_at
    ) order by a.updated_at desc nulls last,a.id),'[]'::jsonb)
    into v_ads
    from (
      select * from public.ad_campaigns
      where brand_id=p_brand_key
      order by updated_at desc nulls last,id
      limit 50
    ) a;
  end if;

  if v_permissions && array['corporate.plan','visibility.plan','ads.draft','events.plan']::text[] then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',w.id,'kind',w.metadata->>'workspace_kind','title',w.title,
      'description',w.description,'status',w.status,'priority',w.priority,
      'dueDate',w.due_date,'nextAction',w.next_action,'sourceId',w.source_id,
      'updatedAt',w.updated_at
    ) order by w.updated_at desc nulls last,w.id),'[]'::jsonb)
    into v_planned
    from (
      select * from public.work_items
      where brand_id=p_brand_key
        and metadata->>'workspace_growth'='true'
        and metadata->>'created_by_workspace_user'=p_user_id::text
      order by updated_at desc nulls last,id
      limit 100
    ) w;
  end if;

  return jsonb_build_object(
    'permissions',jsonb_build_object(
      'corporateRead',p_brand_key='zeneco' and 'corporate.read'=any(v_permissions),
      'corporatePlan',p_brand_key='zeneco' and 'corporate.plan'=any(v_permissions),
      'visibilityRead','visibility.read'=any(v_permissions),
      'visibilityPlan','visibility.plan'=any(v_permissions),
      'adsRead','ads.read'=any(v_permissions),
      'adsDraft','ads.draft'=any(v_permissions),
      'eventsPlan','events.plan'=any(v_permissions)
    ),
    'corporate',v_corporate,
    'visibility',v_visibility,
    'ads',v_ads,
    'plannedWork',v_planned
  );
end; $workspace_growth_snapshot$;

revoke execute on function public.workspace_brand_growth_snapshot(text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.workspace_brand_growth_snapshot(text,uuid,text)
  to service_role;

-- Growth writes create internal planning work only. They never send messages,
-- invite attendees, publish content, change Corporate lifecycle status or spend
-- ad budget. The required permission is derived from p_kind inside the database.
create or replace function public.workspace_brand_growth_work_create(
  p_brand_key text, p_user_id uuid, p_email text, p_kind text,
  p_title text, p_description text, p_next_action text,
  p_due_date date, p_priority text, p_source_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $workspace_growth_create$
declare
  v_brand_id uuid;
  v_required text;
  v_agent text;
  v_work record;
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_kind not in ('corporate','seo','geo','aeo','keywords','content','ads','video','info_meeting')
    or p_title is null or length(btrim(p_title)) not between 2 and 180
    or length(coalesce(p_description,'')) > 4000
    or length(coalesce(p_next_action,'')) > 1000
    or coalesce(p_priority,'MEDIUM') not in ('CRITICAL','HIGH','MEDIUM','LOW')
    or length(coalesce(p_source_id,'')) > 200
  then return null; end if;

  if p_kind='corporate' then
    if p_brand_key<>'zeneco' then return null; end if;
    v_required := 'corporate.plan'; v_agent := 'corporate_homes';
  elsif p_kind in ('seo','geo','aeo','keywords','content') then
    v_required := 'visibility.plan'; v_agent := 'seo';
  elsif p_kind='ads' then
    v_required := 'ads.draft'; v_agent := 'marketing';
  else
    v_required := 'events.plan'; v_agent := 'marketing';
  end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array[v_required]::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  insert into public.work_items (
    title,description,status,priority,due_date,brand_id,source_type,source_id,
    assigned_agent,next_action,metadata
  ) values (
    btrim(p_title),nullif(btrim(coalesce(p_description,'')),''),
    'TO_DO',coalesce(p_priority,'MEDIUM'),p_due_date,p_brand_key,'manual',
    nullif(btrim(coalesce(p_source_id,'')),''),
    v_agent,nullif(btrim(coalesce(p_next_action,'')),''),
    jsonb_build_object(
      'workspace_growth',true,'workspace_kind',p_kind,
      'created_by_workspace_user',p_user_id::text,
      'external_action',false,'publishing_action',false,'ad_spend_action',false
    )
  )
  returning id,title,description,status,priority,due_date,brand_id,source_id,
    assigned_agent,next_action,metadata,created_at,updated_at
  into v_work;

  insert into core.brand_workspace_growth_work_audit
    (brand_id,work_item_id,actor_user_id,actor_email,work_kind)
  values (v_brand_id,v_work.id,p_user_id,p_email,p_kind);

  return jsonb_build_object(
    'id',v_work.id,'kind',p_kind,'title',v_work.title,
    'description',v_work.description,'status',v_work.status,
    'priority',v_work.priority,'dueDate',v_work.due_date,
    'nextAction',v_work.next_action,'sourceId',v_work.source_id,
    'updatedAt',v_work.updated_at
  );
end; $workspace_growth_create$;

revoke execute on function public.workspace_brand_growth_work_create(
  text,uuid,text,text,text,text,text,date,text,text
) from public, anon, authenticated;
grant execute on function public.workspace_brand_growth_work_create(
  text,uuid,text,text,text,text,text,date,text,text
) to service_role;
