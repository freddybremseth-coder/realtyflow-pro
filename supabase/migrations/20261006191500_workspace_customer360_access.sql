
create or replace function public.workspace_customer360_access(
  p_brand_key text,
  p_user_id uuid,
  p_email text,
  p_contact_id uuid,
  p_permission text default 'customer360.read'
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
    or p_permission not in ('customer360.read','customer360.write')
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
    and coalesce(c.brand_id,c.brand)=p_brand_key;

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