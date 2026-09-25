-- Atomic CRM access for non-Zen brand workspaces.
-- Zen Eco Homes is intentionally excluded: Zen staff use only the individually
-- owner-reviewed joint cohort functions. This migration creates no membership
-- and moves no existing customer.

-- PII-minimal staff write audit. Only actor, contact ID, action and the NAMES
-- of changed fields are recorded; customer field values are never copied here.
create table if not exists core.brand_workspace_contact_write_audit (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references core.brands(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null,
  action text not null check (action in ('created','updated')),
  changed_fields text[] not null,
  at timestamptz not null default now()
);
alter table core.brand_workspace_contact_write_audit enable row level security;
revoke all on core.brand_workspace_contact_write_audit from public, anon, authenticated;
revoke all on core.brand_workspace_contact_write_audit from service_role;
grant select, insert on core.brand_workspace_contact_write_audit to service_role;
comment on table core.brand_workspace_contact_write_audit is
  'PII-minimal audit for atomic non-Zen workspace CRM writes. Never stores changed values.';

-- Member CRM reads are executed inside the database rather than via a separate
-- membership check followed by a service-role table read. FOR SHARE serializes
-- a waiting read with an owner/admin membership revocation.
create or replace function public.workspace_brand_contacts(
  p_brand_key text, p_user_id uuid, p_email text, p_offset integer, p_search text
) returns jsonb language plpgsql security invoker set search_path = '' as $workspace_brand_contacts$
declare
  v_brand_id uuid;
  v_result jsonb;
begin
  if p_brand_key is null or p_brand_key = 'zeneco'
    or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_offset is null or p_offset < 0 or p_offset > 49950
    or length(coalesce(p_search,'')) > 80
  then return null; end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['crm.read']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  select jsonb_build_object(
    'contacts', coalesce(jsonb_agg(jsonb_build_object(
      'id',rows.id,'name',rows.name,'email',rows.email,'phone',rows.phone,
      'brand_id',rows.brand_id,'brand',rows.brand,
      'pipeline_status',rows.pipeline_status,'source',rows.source,
      'updated_at',rows.updated_at
    ) order by rows.updated_at desc nulls last,rows.id), '[]'::jsonb),
    'hasMore',count(*) > 50
  ) into v_result
  from (
    select c.id,c.name,c.email,c.phone,c.brand_id,c.brand,
      c.pipeline_status,c.source,c.updated_at
    from public.contacts c
    where c.brand_id=p_brand_key and c.brand=p_brand_key
      and (
        coalesce(p_search,'') = ''
        or position(lower(p_search) in lower(coalesce(c.name,''))) > 0
        or position(lower(p_search) in lower(coalesce(c.email,''))) > 0
        or position(lower(p_search) in lower(coalesce(c.phone,''))) > 0
      )
    order by c.updated_at desc nulls last,c.id
    offset p_offset limit 51
  ) rows;

  return v_result;
end; $workspace_brand_contacts$;

revoke execute on function public.workspace_brand_contacts(text,uuid,text,integer,text)
  from public, anon, authenticated;
grant execute on function public.workspace_brand_contacts(text,uuid,text,integer,text)
  to service_role;

-- Staff create is an atomic membership check + insert. Generic brand CRM is
-- explicitly forbidden for Zen Eco Homes.
create or replace function public.workspace_brand_contact_create(
  p_brand_key text, p_user_id uuid, p_email text,
  p_name text, p_contact_email text, p_phone text
) returns jsonb language plpgsql security invoker set search_path = '' as $workspace_contact_create$
declare
  v_brand_id uuid;
  v_contact record;
begin
  if p_brand_key is null or p_brand_key = 'zeneco'
    or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_name is null or length(btrim(p_name)) < 1 or length(btrim(p_name)) > 140
    or (p_contact_email is not null and (
      length(btrim(p_contact_email)) > 254 or
      (length(btrim(p_contact_email)) > 0 and
       btrim(p_contact_email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
    ))
    or (p_phone is not null and length(btrim(p_phone)) > 60)
  then return null; end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['crm.read','crm.write']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  insert into public.contacts
    (name,email,phone,brand_id,brand,pipeline_status)
  values (
    btrim(p_name),
    nullif(lower(btrim(coalesce(p_contact_email,''))), ''),
    nullif(btrim(coalesce(p_phone,'')), ''),
    p_brand_key,p_brand_key,'NEW'
  )
  returning id,name,email,phone,brand_id,brand,pipeline_status,source,created_at,updated_at
    into v_contact;

  insert into core.brand_workspace_contact_write_audit
    (brand_id,contact_id,actor_user_id,actor_email,action,changed_fields)
  values (
    v_brand_id,v_contact.id,p_user_id,p_email,'created',
    array_remove(array[
      'name',
      case when p_contact_email is not null then 'email' end,
      case when p_phone is not null then 'phone' end
    ]::text[],null)
  );

  return jsonb_build_object(
    'id',v_contact.id,'name',v_contact.name,'email',v_contact.email,'phone',v_contact.phone,
    'brand_id',v_contact.brand_id,'brand',v_contact.brand,
    'pipeline_status',v_contact.pipeline_status,'source',v_contact.source,
    'created_at',v_contact.created_at,'updated_at',v_contact.updated_at
  );
end; $workspace_contact_create$;

revoke execute on function public.workspace_brand_contact_create(text,uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.workspace_brand_contact_create(text,uuid,text,text,text,text)
  to service_role;

-- Partial staff update with explicit "set" flags so null can mean "clear this
-- optional field" rather than "field omitted". Exact brand labels are required.
create or replace function public.workspace_brand_contact_update(
  p_brand_key text, p_user_id uuid, p_email text, p_contact_id uuid,
  p_set_name boolean, p_name text,
  p_set_email boolean, p_contact_email text,
  p_set_phone boolean, p_phone text
) returns jsonb language plpgsql security invoker set search_path = '' as $workspace_contact_update$
declare
  v_brand_id uuid;
  v_contact record;
begin
  if p_brand_key is null or p_brand_key = 'zeneco'
    or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null or p_contact_id is null
    or p_email is null or p_email <> lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or not (coalesce(p_set_name,false) or coalesce(p_set_email,false) or coalesce(p_set_phone,false))
    or (coalesce(p_set_name,false) and
      (p_name is null or length(btrim(p_name)) < 1 or length(btrim(p_name)) > 140))
    or (coalesce(p_set_email,false) and p_contact_email is not null and (
      length(btrim(p_contact_email)) > 254 or
      (length(btrim(p_contact_email)) > 0 and
       btrim(p_contact_email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
    ))
    or (coalesce(p_set_phone,false) and p_phone is not null and length(btrim(p_phone)) > 60)
  then return null; end if;

  select b.id into v_brand_id
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['crm.read','crm.write']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  update public.contacts c set
    name = case when p_set_name then btrim(p_name) else c.name end,
    email = case when p_set_email then nullif(lower(btrim(coalesce(p_contact_email,''))), '') else c.email end,
    phone = case when p_set_phone then nullif(btrim(coalesce(p_phone,'')), '') else c.phone end,
    updated_at = now()
  where c.id=p_contact_id and c.brand_id=p_brand_key and c.brand=p_brand_key
  returning c.id,c.name,c.email,c.phone,c.brand_id,c.brand,c.pipeline_status,c.source,c.created_at,c.updated_at
    into v_contact;
  if not found then return null; end if;

  insert into core.brand_workspace_contact_write_audit
    (brand_id,contact_id,actor_user_id,actor_email,action,changed_fields)
  values (
    v_brand_id,v_contact.id,p_user_id,p_email,'updated',
    array_remove(array[
      case when p_set_name then 'name' end,
      case when p_set_email then 'email' end,
      case when p_set_phone then 'phone' end
    ]::text[],null)
  );

  return jsonb_build_object(
    'id',v_contact.id,'name',v_contact.name,'email',v_contact.email,'phone',v_contact.phone,
    'brand_id',v_contact.brand_id,'brand',v_contact.brand,
    'pipeline_status',v_contact.pipeline_status,'source',v_contact.source,
    'created_at',v_contact.created_at,'updated_at',v_contact.updated_at
  );
end; $workspace_contact_update$;

revoke execute on function public.workspace_brand_contact_update(
  text,uuid,text,uuid,boolean,text,boolean,text,boolean,text
) from public, anon, authenticated;
grant execute on function public.workspace_brand_contact_update(
  text,uuid,text,uuid,boolean,text,boolean,text,boolean,text
) to service_role;
