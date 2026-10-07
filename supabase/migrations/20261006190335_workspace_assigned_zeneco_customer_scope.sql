
create or replace function public.workspace_customer360_access(
  p_brand_key text,
  p_user_id uuid,
  p_email text,
  p_contact_id uuid,
  p_permission text default 'crm.read'
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $workspace_customer360_access$
declare
  v_brand_id uuid;
  v_contact_brand text;
  v_assigned boolean := false;
  v_joint boolean := false;
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null or p_contact_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_permission not in ('crm.read','crm.write','crm.joint.read','crm.joint.write')
  then return null;
  end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id
    and m.email=p_email
    and m.status='active'
    and m.permissions @> array[p_permission]::text[]
  for share of m;

  if v_brand_id is null then return null; end if;

  select coalesce(c.brand_id,c.brand) into v_contact_brand
  from public.contacts c
  where c.id=p_contact_id
    and c.brand_id=p_brand_key
    and c.brand=p_brand_key;

  if v_contact_brand is null then return null; end if;

  select exists(
    select 1
    from core.workspace_customer_assignments a
    where a.contact_id=p_contact_id
      and a.brand_id=v_brand_id
      and a.user_id=p_user_id
      and a.email=p_email
  ) into v_assigned;

  if p_brand_key='zeneco' then
    select exists(
      select 1
      from core.zeneco_joint_lead_cohort j
      where j.contact_id=p_contact_id
        and j.brand_id=v_brand_id
        and j.eligibility='approved'
        and j.first_genuine_enquiry_at >= timestamptz '2026-09-23 22:00:00+00'
        and length(btrim(coalesce(j.evidence_reference,''))) >= 8
        and j.reviewed_at is not null
    ) into v_joint;
    if not v_assigned and not v_joint then return null; end if;
  end if;

  return jsonb_build_object(
    'brandId',v_brand_id,
    'contactId',p_contact_id,
    'assigned',v_assigned,
    'jointLead',v_joint
  );
end;
$workspace_customer360_access$;

revoke execute on function public.workspace_customer360_access(text,uuid,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.workspace_customer360_access(text,uuid,text,uuid,text)
  to service_role;


create or replace function public.workspace_zeneco_joint_contacts(
  p_user_id uuid,
  p_email text,
  p_offset integer,
  p_search text,
  p_status text default '',
  p_source text default '',
  p_sort text default 'updated_desc'
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $workspace_zeneco_joint_contacts$
declare
  v_brand_id uuid;
  v_result jsonb;
begin
  if p_user_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_offset is null or p_offset < 0 or p_offset > 49950
    or length(coalesce(p_search,'')) > 80
    or length(coalesce(p_source,'')) > 80
    or (coalesce(p_status,'') <> '' and p_status not in (
      'NEW','CONTACT','QUALIFIED','MATCHING','VIEWING','NEGOTIATION','RESERVED','WON','ON_HOLD','LOST'
    ))
    or coalesce(p_sort,'') not in ('updated_desc','updated_asc','created_desc','name_asc')
  then
    return null;
  end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key='zeneco'
  where m.user_id=p_user_id
    and m.email=p_email
    and m.status='active'
    and m.permissions @> array['crm.joint.read']::text[]
  for share of m;

  if v_brand_id is null then return null; end if;

  with filtered as (
    select
      c.id,c.name,c.email,c.phone,c.brand_id,c.brand,
      c.pipeline_status,c.source,c.created_at,c.updated_at,
      exists(
        select 1
        from core.workspace_customer_assignments a
        where a.contact_id=c.id
          and a.brand_id=v_brand_id
          and a.user_id=p_user_id
          and a.email=p_email
      ) as assigned_to_member,
      exists(
        select 1
        from core.zeneco_joint_lead_cohort j
        where j.contact_id=c.id
          and j.brand_id=v_brand_id
          and j.eligibility='approved'
          and j.first_genuine_enquiry_at >= timestamptz '2026-09-23 22:00:00+00'
          and length(btrim(coalesce(j.evidence_reference,''))) >= 8
          and j.reviewed_at is not null
      ) as approved_joint_lead
    from public.contacts c
    where c.brand_id='zeneco'
      and c.brand='zeneco'
      and (
        exists(
          select 1
          from core.workspace_customer_assignments a
          where a.contact_id=c.id
            and a.brand_id=v_brand_id
            and a.user_id=p_user_id
            and a.email=p_email
        )
        or exists(
          select 1
          from core.zeneco_joint_lead_cohort j
          where j.contact_id=c.id
            and j.brand_id=v_brand_id
            and j.eligibility='approved'
            and j.first_genuine_enquiry_at >= timestamptz '2026-09-23 22:00:00+00'
            and length(btrim(coalesce(j.evidence_reference,''))) >= 8
            and j.reviewed_at is not null
        )
      )
      and (
        coalesce(p_search,'') = ''
        or position(lower(p_search) in lower(coalesce(c.name,''))) > 0
        or position(lower(p_search) in lower(coalesce(c.email,''))) > 0
        or position(lower(p_search) in lower(coalesce(c.phone,''))) > 0
      )
      and (coalesce(p_status,'') = '' or c.pipeline_status = p_status)
      and (
        coalesce(p_source,'') = ''
        or position(lower(p_source) in lower(coalesce(c.source,''))) > 0
      )
  ),
  ranked as (
    select filtered.*,
      row_number() over (
        order by
          case when p_sort='name_asc' then lower(name) end asc nulls last,
          case when p_sort='created_desc' then created_at end desc nulls last,
          case when p_sort='updated_asc' then updated_at end asc nulls last,
          case when p_sort='updated_desc' then updated_at end desc nulls last,
          updated_at desc nulls last,
          id
      ) as result_order
    from filtered
  ),
  paged as (
    select *
    from ranked
    where result_order > p_offset
      and result_order <= p_offset + 51
  )
  select jsonb_build_object(
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',rows.id,
        'name',rows.name,
        'email',rows.email,
        'phone',rows.phone,
        'brand_id',rows.brand_id,
        'brand',rows.brand,
        'pipeline_status',rows.pipeline_status,
        'source',rows.source,
        'created_at',rows.created_at,
        'updated_at',rows.updated_at,
        'assigned_to_member',rows.assigned_to_member,
        'approved_joint_lead',rows.approved_joint_lead
      ) order by rows.result_order)
      from paged rows
      where rows.result_order <= p_offset + 50
    ), '[]'::jsonb),
    'hasMore', (select count(*) > 50 from paged),
    'summary', jsonb_build_object(
      'matchedCount', (select count(*)::integer from filtered),
      'staleCount', (
        select count(*)::integer from filtered
        where updated_at is null or updated_at < now() - interval '7 days'
      ),
      'assignedCount', (
        select count(*)::integer from filtered where assigned_to_member
      ),
      'statusCounts', coalesce((
        select jsonb_object_agg(status_key,status_count order by status_key)
        from (
          select coalesce(nullif(pipeline_status,''),'UNSET') as status_key,
                 count(*)::integer as status_count
          from filtered
          group by 1
        ) counts
      ), '{}'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$workspace_zeneco_joint_contacts$;

revoke execute on function public.workspace_zeneco_joint_contacts(
  uuid,text,integer,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.workspace_zeneco_joint_contacts(
  uuid,text,integer,text,text,text,text
) to service_role;


create or replace function public.workspace_zeneco_joint_contact_update(
  p_user_id uuid,
  p_member_email text,
  p_contact_id uuid,
  p_name text,
  p_contact_email text,
  p_phone text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $joint_write$
declare
  v_contact record;
  v_brand_id uuid;
begin
  if p_user_id is null or p_contact_id is null
    or p_member_email is null or p_member_email <> lower(btrim(p_member_email))
    or p_member_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_name is null or length(btrim(p_name)) < 1 or length(btrim(p_name)) > 140
    or p_contact_email is null or length(btrim(p_contact_email)) > 254
    or (length(btrim(p_contact_email)) > 0 and
      btrim(p_contact_email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
    or p_phone is null or length(btrim(p_phone)) > 60
  then return null;
  end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key='zeneco'
  where m.user_id=p_user_id
    and m.email=p_member_email
    and m.status='active'
    and m.permissions @> array['crm.joint.read','crm.joint.write']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  perform 1
  from public.contacts c
  where c.id=p_contact_id
    and c.brand_id='zeneco'
    and c.brand='zeneco'
  for update;
  if not found then return null; end if;

  update public.contacts c
  set name=btrim(p_name),
      email=nullif(lower(btrim(p_contact_email)),''),
      phone=nullif(btrim(p_phone),''),
      updated_at=now()
  where c.id=p_contact_id
    and c.brand_id='zeneco'
    and c.brand='zeneco'
    and (
      exists(
        select 1
        from core.workspace_customer_assignments a
        where a.contact_id=c.id
          and a.brand_id=v_brand_id
          and a.user_id=p_user_id
          and a.email=p_member_email
      )
      or exists(
        select 1
        from core.zeneco_joint_lead_cohort j
        where j.contact_id=c.id
          and j.brand_id=v_brand_id
          and j.eligibility='approved'
          and j.first_genuine_enquiry_at >= timestamptz '2026-09-23 22:00:00+00'
          and length(btrim(coalesce(j.evidence_reference,''))) >= 8
          and j.reviewed_at is not null
      )
    )
  returning c.id,c.name,c.email,c.phone,c.brand_id,c.brand,c.created_at,c.updated_at
  into v_contact;

  if not found then return null; end if;

  insert into core.zeneco_joint_contact_edit_audit
    (contact_id,actor_user_id,actor_email,changed_fields)
  values (
    v_contact.id,p_user_id,p_member_email,
    array['name','email','phone']::text[]
  );

  return jsonb_build_object(
    'id',v_contact.id,
    'name',v_contact.name,
    'email',v_contact.email,
    'phone',v_contact.phone,
    'brand_id',v_contact.brand_id,
    'brand',v_contact.brand,
    'created_at',v_contact.created_at,
    'updated_at',v_contact.updated_at
  );
end;
$joint_write$;

revoke execute on function public.workspace_zeneco_joint_contact_update(
  uuid,text,uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.workspace_zeneco_joint_contact_update(
  uuid,text,uuid,text,text,text
) to service_role;