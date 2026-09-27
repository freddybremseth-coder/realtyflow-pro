-- Brand-scoped employee email / Reach work surface.
-- One-to-one sending may target only exact scoped CRM leads or, for Zen,
-- reviewed joint leads and company-level generic Corporate channels.
-- Reach campaign work remains draft-only; this migration never subscribes
-- contacts to an email marketing list.

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
        'corporate.read','corporate.plan',
        'visibility.read','visibility.plan',
        'ads.read','ads.draft','events.plan',
        'content.read','content.edit','content.publish',
        'email.read','email.draft','email.send'
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

create table if not exists core.brand_workspace_email_drafts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references core.brands(id) on delete restrict,
  target_type text not null check (target_type in ('lead','corporate','partner')),
  target_id uuid not null,
  recipient_email text not null,
  recipient_label text not null,
  subject text not null check (length(subject) between 1 and 180),
  body_text text not null check (length(body_text) between 1 and 15000),
  status text not null default 'draft'
    check (status in ('draft','sending','sent','failed')),
  message_id text,
  last_error text,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_by_email text not null,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists brand_workspace_email_drafts_owner_idx
  on core.brand_workspace_email_drafts (brand_id,created_by_user_id,updated_at desc);
alter table core.brand_workspace_email_drafts enable row level security;
revoke all on core.brand_workspace_email_drafts from public,anon,authenticated,service_role;
grant select,insert,update on core.brand_workspace_email_drafts to service_role;

create or replace function public.workspace_brand_email_target_resolve(
  p_brand_key text,p_user_id uuid,p_email text,p_target_type text,p_target_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $workspace_email_target$
declare
  v_brand_id uuid;
  v_permissions text[];
  v_row record;
  v_contact jsonb;
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null or p_email is null or p_email <> lower(btrim(p_email))
    or p_target_type not in ('lead','corporate','partner') or p_target_id is null
  then return null; end if;

  select b.id,m.permissions into v_brand_id,v_permissions
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['email.read']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  if p_target_type='lead' then
    if p_brand_key='zeneco' then
      if not ('crm.joint.read'=any(v_permissions)) then return null; end if;
      select c.id,c.name,c.email,c.pipeline_status into v_row
      from core.zeneco_joint_lead_cohort j
      join public.contacts c on c.id=j.contact_id
      where j.brand_id=v_brand_id and j.contact_id=p_target_id
        and j.eligibility='approved'
        and j.first_genuine_enquiry_at >= timestamptz '2026-09-23 22:00:00+00'
        and length(btrim(coalesce(j.evidence_reference,''))) >= 8
        and j.reviewed_at is not null
        and c.brand_id='zeneco' and c.brand='zeneco'
        and c.created_at >= timestamptz '2026-09-23 22:00:00+00'
        and c.email is not null and lower(btrim(c.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
        and coalesce(c.do_not_contact,false)=false
        and coalesce(c.email_suppressed,false)=false;
    else
      if not ('crm.read'=any(v_permissions)) then return null; end if;
      select c.id,c.name,c.email,c.pipeline_status into v_row
      from public.contacts c
      where c.id=p_target_id and c.brand_id=p_brand_key and c.brand=p_brand_key
        and c.email is not null and lower(btrim(c.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
        and coalesce(c.do_not_contact,false)=false
        and coalesce(c.email_suppressed,false)=false;
    end if;
    if v_row.id is null then return null; end if;
    return jsonb_build_object(
      'type','lead','id',v_row.id,'email',lower(btrim(v_row.email)),
      'label',coalesce(nullif(btrim(v_row.name),''),lower(btrim(v_row.email))),
      'subtitle',coalesce(v_row.pipeline_status,'Lead')
    );
  end if;

  if p_brand_key<>'zeneco' or not ('corporate.read'=any(v_permissions)) then return null; end if;

  if p_target_type='corporate' then
    select p.id,p.company_name,p.status,p.evidence->'generic_company_contact' as contact
      into v_row
    from public.corporate_prospects p
    where p.id=p_target_id and p.brand_id='zeneco' and p.status<>'DISQUALIFIED';
  else
    select p.id,p.company_name,p.status,p.evidence->'generic_company_contact' as contact
      into v_row
    from public.corporate_partner_prospects p
    where p.id=p_target_id and p.brand_id='zeneco' and p.status<>'DISQUALIFIED';
  end if;
  if v_row.id is null then return null; end if;
  v_contact := coalesce(v_row.contact,'{}'::jsonb);
  if coalesce(v_contact->>'company_level_only','') <> 'true'
    or coalesce(v_contact->>'personal_data_collected','') <> 'false'
    or coalesce(v_contact->>'generic_email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then return null; end if;

  return jsonb_build_object(
    'type',p_target_type,'id',v_row.id,
    'email',lower(btrim(v_contact->>'generic_email')),
    'label',v_row.company_name,'subtitle',coalesce(v_row.status,'Corporate')
  );
end; $workspace_email_target$;

revoke execute on function public.workspace_brand_email_target_resolve(text,uuid,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.workspace_brand_email_target_resolve(text,uuid,text,text,uuid)
  to service_role;

create or replace function public.workspace_brand_email_snapshot(
  p_brand_key text,p_user_id uuid,p_email text,p_search text
) returns jsonb language plpgsql security invoker set search_path='' as $workspace_email_snapshot$
declare
  v_brand_id uuid;
  v_permissions text[];
  v_targets jsonb := '[]'::jsonb;
  v_drafts jsonb := '[]'::jsonb;
  v_search text := lower(btrim(coalesce(p_search,'')));
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null or p_email is null or p_email<>lower(btrim(p_email))
    or length(v_search)>80
  then return null; end if;

  select b.id,m.permissions into v_brand_id,v_permissions
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['email.read']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  if p_brand_key='zeneco' and 'crm.joint.read'=any(v_permissions) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'type','lead','id',x.id,'label',x.label,'email',x.email,
      'subtitle',x.subtitle
    ) order by x.label,x.id),'[]'::jsonb)
    into v_targets
    from (
      select c.id,coalesce(nullif(btrim(c.name),''),lower(btrim(c.email))) as label,
        lower(btrim(c.email)) as email,coalesce(c.pipeline_status,'Lead') as subtitle
      from core.zeneco_joint_lead_cohort j
      join public.contacts c on c.id=j.contact_id
      where j.brand_id=v_brand_id and j.eligibility='approved'
        and j.first_genuine_enquiry_at >= timestamptz '2026-09-23 22:00:00+00'
        and length(btrim(coalesce(j.evidence_reference,''))) >= 8 and j.reviewed_at is not null
        and c.brand_id='zeneco' and c.brand='zeneco'
        and c.created_at >= timestamptz '2026-09-23 22:00:00+00'
        and c.email is not null and lower(btrim(c.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
        and coalesce(c.do_not_contact,false)=false and coalesce(c.email_suppressed,false)=false
        and (v_search='' or position(v_search in lower(coalesce(c.name,'')||' '||coalesce(c.email,'')))>0)
      order by c.updated_at desc nulls last,c.id
      limit 100
    ) x;
  elsif p_brand_key<>'zeneco' and 'crm.read'=any(v_permissions) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'type','lead','id',x.id,'label',x.label,'email',x.email,
      'subtitle',x.subtitle
    ) order by x.label,x.id),'[]'::jsonb)
    into v_targets
    from (
      select c.id,coalesce(nullif(btrim(c.name),''),lower(btrim(c.email))) as label,
        lower(btrim(c.email)) as email,coalesce(c.pipeline_status,'Lead') as subtitle
      from public.contacts c
      where c.brand_id=p_brand_key and c.brand=p_brand_key
        and c.email is not null and lower(btrim(c.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
        and coalesce(c.do_not_contact,false)=false and coalesce(c.email_suppressed,false)=false
        and (v_search='' or position(v_search in lower(coalesce(c.name,'')||' '||coalesce(c.email,'')))>0)
      order by c.updated_at desc nulls last,c.id
      limit 100
    ) x;
  end if;

  if p_brand_key='zeneco' and 'corporate.read'=any(v_permissions) then
    v_targets := v_targets || coalesce((
      select jsonb_agg(row_json order by label,id)
      from (
        select p.id,p.company_name as label,
          jsonb_build_object(
            'type','corporate','id',p.id,'label',p.company_name,
            'email',lower(btrim(p.evidence->'generic_company_contact'->>'generic_email')),
            'subtitle','Corporate · '||p.status
          ) as row_json
        from public.corporate_prospects p
        where p.brand_id='zeneco' and p.status<>'DISQUALIFIED'
          and coalesce(p.evidence->'generic_company_contact'->>'company_level_only','')='true'
          and coalesce(p.evidence->'generic_company_contact'->>'personal_data_collected','')='false'
          and coalesce(p.evidence->'generic_company_contact'->>'generic_email','')
            ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
          and (v_search='' or position(v_search in lower(coalesce(p.company_name,'')||' '||
            coalesce(p.evidence->'generic_company_contact'->>'generic_email','')))>0)
        order by p.fit_score desc,p.updated_at desc
        limit 100
      ) q
    ),'[]'::jsonb);

    v_targets := v_targets || coalesce((
      select jsonb_agg(row_json order by label,id)
      from (
        select p.id,p.company_name as label,
          jsonb_build_object(
            'type','partner','id',p.id,'label',p.company_name,
            'email',lower(btrim(p.evidence->'generic_company_contact'->>'generic_email')),
            'subtitle','Partner · '||p.status
          ) as row_json
        from public.corporate_partner_prospects p
        where p.brand_id='zeneco' and p.status<>'DISQUALIFIED'
          and coalesce(p.evidence->'generic_company_contact'->>'company_level_only','')='true'
          and coalesce(p.evidence->'generic_company_contact'->>'personal_data_collected','')='false'
          and coalesce(p.evidence->'generic_company_contact'->>'generic_email','')
            ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
          and (v_search='' or position(v_search in lower(coalesce(p.company_name,'')||' '||
            coalesce(p.evidence->'generic_company_contact'->>'generic_email','')))>0)
        order by p.fit_score desc,p.updated_at desc
        limit 100
      ) q
    ),'[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'targetType',d.target_type,'targetId',d.target_id,
    'recipientEmail',d.recipient_email,'recipientLabel',d.recipient_label,
    'subject',d.subject,'bodyText',d.body_text,'status',d.status,
    'messageId',d.message_id,'lastError',d.last_error,
    'createdAt',d.created_at,'updatedAt',d.updated_at,'sentAt',d.sent_at
  ) order by d.updated_at desc,d.id),'[]'::jsonb)
  into v_drafts
  from (
    select * from core.brand_workspace_email_drafts
    where brand_id=v_brand_id and created_by_user_id=p_user_id
    order by updated_at desc,id limit 50
  ) d;

  return jsonb_build_object('targets',v_targets,'drafts',v_drafts);
end; $workspace_email_snapshot$;

revoke execute on function public.workspace_brand_email_snapshot(text,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.workspace_brand_email_snapshot(text,uuid,text,text)
  to service_role;

create or replace function public.workspace_brand_email_draft_save(
  p_brand_key text,p_user_id uuid,p_email text,p_draft_id uuid,
  p_target_type text,p_target_id uuid,p_subject text,p_body_text text
) returns jsonb language plpgsql security invoker set search_path='' as $workspace_email_draft_save$
declare
  v_brand_id uuid;
  v_target jsonb;
  d core.brand_workspace_email_drafts%rowtype;
begin
  if p_subject is null or length(btrim(p_subject)) not between 1 and 180
    or p_body_text is null or length(btrim(p_body_text)) not between 1 and 15000
  then return null; end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['email.read','email.draft']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  select public.workspace_brand_email_target_resolve(
    p_brand_key,p_user_id,p_email,p_target_type,p_target_id
  ) into v_target;
  if v_target is null then return null; end if;

  if p_draft_id is null then
    insert into core.brand_workspace_email_drafts(
      brand_id,target_type,target_id,recipient_email,recipient_label,
      subject,body_text,created_by_user_id,created_by_email,
      updated_by_user_id,updated_by_email
    ) values (
      v_brand_id,p_target_type,p_target_id,v_target->>'email',v_target->>'label',
      btrim(p_subject),btrim(p_body_text),p_user_id,p_email,p_user_id,p_email
    ) returning * into d;
  else
    update core.brand_workspace_email_drafts set
      target_type=p_target_type,target_id=p_target_id,
      recipient_email=v_target->>'email',recipient_label=v_target->>'label',
      subject=btrim(p_subject),body_text=btrim(p_body_text),
      status='draft',message_id=null,last_error=null,sent_at=null,
      updated_by_user_id=p_user_id,updated_by_email=p_email,updated_at=now()
    where id=p_draft_id and brand_id=v_brand_id
      and created_by_user_id=p_user_id and status in ('draft','failed')
    returning * into d;
    if d.id is null then return null; end if;
  end if;

  return jsonb_build_object(
    'id',d.id,'targetType',d.target_type,'targetId',d.target_id,
    'recipientEmail',d.recipient_email,'recipientLabel',d.recipient_label,
    'subject',d.subject,'bodyText',d.body_text,'status',d.status,
    'updatedAt',d.updated_at
  );
end; $workspace_email_draft_save$;

revoke execute on function public.workspace_brand_email_draft_save(text,uuid,text,uuid,text,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.workspace_brand_email_draft_save(text,uuid,text,uuid,text,uuid,text,text)
  to service_role;

create or replace function public.workspace_brand_email_send_prepare(
  p_brand_key text,p_user_id uuid,p_email text,p_draft_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $workspace_email_send_prepare$
declare
  v_brand_id uuid;
  d core.brand_workspace_email_drafts%rowtype;
  v_target jsonb;
begin
  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['email.read','email.draft','email.send']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  select * into d from core.brand_workspace_email_drafts
  where id=p_draft_id and brand_id=v_brand_id
    and created_by_user_id=p_user_id and status in ('draft','failed')
  for update;
  if d.id is null then return null; end if;

  select public.workspace_brand_email_target_resolve(
    p_brand_key,p_user_id,p_email,d.target_type,d.target_id
  ) into v_target;
  if v_target is null or lower(btrim(v_target->>'email'))<>lower(btrim(d.recipient_email))
  then return null; end if;

  update core.brand_workspace_email_drafts set
    status='sending',last_error=null,updated_at=now(),
    updated_by_user_id=p_user_id,updated_by_email=p_email
  where id=d.id;

  return jsonb_build_object(
    'id',d.id,'targetType',d.target_type,'targetId',d.target_id,
    'recipientEmail',v_target->>'email','recipientLabel',v_target->>'label',
    'subject',d.subject,'bodyText',d.body_text
  );
end; $workspace_email_send_prepare$;

revoke execute on function public.workspace_brand_email_send_prepare(text,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.workspace_brand_email_send_prepare(text,uuid,text,uuid)
  to service_role;

create or replace function public.workspace_brand_email_send_finalize(
  p_brand_key text,p_user_id uuid,p_email text,p_draft_id uuid,
  p_success boolean,p_message_id text,p_error text
) returns jsonb language plpgsql security invoker set search_path='' as $workspace_email_send_finalize$
declare
  v_brand_id uuid;
  d core.brand_workspace_email_drafts%rowtype;
begin
  select id into v_brand_id from core.brands where brand_key=p_brand_key;
  if v_brand_id is null or p_user_id is null or p_draft_id is null
    or p_email is null or p_email<>lower(btrim(p_email))
  then return null; end if;

  update core.brand_workspace_email_drafts set
    status=case when p_success then 'sent' else 'failed' end,
    message_id=case when p_success then nullif(btrim(coalesce(p_message_id,'')),'') else null end,
    last_error=case when p_success then null else left(coalesce(p_error,'E-postsending feilet'),1000) end,
    sent_at=case when p_success then now() else null end,
    updated_by_user_id=p_user_id,updated_by_email=p_email,updated_at=now()
  where id=p_draft_id and brand_id=v_brand_id
    and created_by_user_id=p_user_id and status='sending'
  returning * into d;
  if d.id is null then return null; end if;

  return jsonb_build_object('ok',p_success,'id',d.id,'status',d.status,'sentAt',d.sent_at);
end; $workspace_email_send_finalize$;

revoke execute on function public.workspace_brand_email_send_finalize(text,uuid,text,uuid,boolean,text,text)
  from public,anon,authenticated;
grant execute on function public.workspace_brand_email_send_finalize(text,uuid,text,uuid,boolean,text,text)
  to service_role;
