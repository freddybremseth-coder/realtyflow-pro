-- Atomic contact writes for non-Zen brand workspaces.
-- Zen Eco Homes is intentionally excluded: it uses the individually reviewed
-- joint cohort functions and must never fall back to brand-wide CRM writes.
-- No membership or customer is created by this migration.

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

  -- Serialize with any owner/admin membership update. If a revocation already
  -- holds the row lock, this statement waits and rechecks status/permissions
  -- after that transaction commits before any customer insert is attempted.
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
