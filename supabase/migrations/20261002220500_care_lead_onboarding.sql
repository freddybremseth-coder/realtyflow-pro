-- Atomic, admin-triggered conversion from a Care website lead into Care property/contract.
-- The function is service-role only; public/anon/authenticated callers cannot execute it.

create or replace function public.care_onboard_lead(
  p_work_item_id uuid,
  p_contact_id uuid,
  p_property_type text,
  p_name text,
  p_address_line text,
  p_municipality text,
  p_postcode text default null,
  p_has_pool boolean default false,
  p_has_garden boolean default false,
  p_plan_id uuid default null,
  p_starts_on date default current_date,
  p_billing_day integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, care, pg_temp
as $$
declare
  v_org_id uuid;
  v_work_item public.work_items%rowtype;
  v_plan care.kh_plans%rowtype;
  v_property_id uuid;
  v_contract_id uuid;
  v_reference text;
  v_existing_reference text;
  v_year text := to_char(current_date, 'YYYY');
begin
  if p_property_type not in ('apartment', 'townhouse', 'villa', 'finca') then
    raise exception 'Unsupported Care property type';
  end if;
  if nullif(btrim(p_address_line), '') is null or nullif(btrim(p_municipality), '') is null then
    raise exception 'Address and municipality are required';
  end if;
  if p_billing_day < 1 or p_billing_day > 28 then
    raise exception 'Billing day must be between 1 and 28';
  end if;

  select *
    into v_work_item
  from public.work_items
  where id = p_work_item_id
    and source_type = 'website_lead'
    and brand_id = 'zeneco'
    and source_id = p_contact_id
    and (
      coalesce(metadata->>'segment', '') = 'care'
      or coalesce(metadata->>'request_type', '') like 'care-%'
      or lower(coalesce(next_action, '')) like '%zen eco homes care%'
    )
  for update;

  if not found then
    raise exception 'Care lead work item was not found';
  end if;

  if not exists (select 1 from public.contacts where id = p_contact_id) then
    raise exception 'CRM contact was not found';
  end if;

  select id into v_org_id
  from care.orgs
  where slug = 'zeneco'
  limit 1;

  if v_org_id is null then
    raise exception 'Zen Eco Homes Care organisation is not configured';
  end if;

  if p_plan_id is not null then
    select *
      into v_plan
    from care.kh_plans
    where id = p_plan_id
      and org_id = v_org_id
      and is_active = true;

    if not found then
      raise exception 'Selected Care plan is not active';
    end if;
  end if;

  -- Reuse the same property if this contact/address was already onboarded.
  select id, reference
    into v_property_id, v_existing_reference
  from care.kh_properties
  where org_id = v_org_id
    and owner_id = p_contact_id
    and lower(btrim(address_line)) = lower(btrim(p_address_line))
    and lower(btrim(municipality)) = lower(btrim(p_municipality))
  order by created_at asc
  limit 1;

  if v_property_id is null then
    v_reference := 'CARE-' || v_year || '-' ||
      upper(substr(replace(p_work_item_id::text, '-', ''), 1, 8));

    insert into care.kh_properties (
      org_id,
      owner_id,
      reference,
      property_type,
      name,
      address_line,
      municipality,
      postcode,
      country,
      has_pool,
      has_garden,
      access_notes,
      status
    )
    values (
      v_org_id,
      p_contact_id,
      v_reference,
      p_property_type,
      nullif(btrim(coalesce(p_name, '')), ''),
      btrim(p_address_line),
      btrim(p_municipality),
      nullif(btrim(coalesce(p_postcode, '')), ''),
      'ES',
      coalesce(p_has_pool, false),
      coalesce(p_has_garden, false),
      jsonb_build_object(
        'created_from', 'care_lead_onboarding',
        'work_item_id', p_work_item_id,
        'service_intent', v_work_item.metadata->>'service_intent'
      ),
      'active'
    )
    returning id into v_property_id;
  else
    v_reference := v_existing_reference;
  end if;

  if p_plan_id is not null then
    select id
      into v_contract_id
    from care.kh_contracts
    where org_id = v_org_id
      and property_id = v_property_id
      and status in ('active', 'renewal_due')
    order by created_at desc
    limit 1;

    if v_contract_id is null then
      insert into care.kh_contracts (
        org_id,
        property_id,
        plan_id,
        plan_snapshot,
        starts_on,
        billing_day,
        status
      )
      values (
        v_org_id,
        v_property_id,
        v_plan.id,
        jsonb_build_object(
          'id', v_plan.id,
          'code', v_plan.code,
          'name', v_plan.name,
          'visits_per_month', v_plan.visits_per_month,
          'price_cents', v_plan.price_cents,
          'currency', v_plan.currency,
          'included_services', v_plan.included_services
        ),
        coalesce(p_starts_on, current_date),
        p_billing_day,
        'active'
      )
      returning id into v_contract_id;
    end if;
  end if;

  update public.work_items
  set
    status = case when v_contract_id is null then 'IN_PROGRESS' else 'DONE' end,
    next_action = case
      when v_contract_id is null
        then 'Care-eiendom opprettet. Avklar og aktiver riktig Care-plan før fakturering.'
      else 'Care-kunde og aktiv avtale er opprettet. Planlegg første besøk og nøkkeloverlevering.'
    end,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'care_property_id', v_property_id,
      'care_contract_id', v_contract_id,
      'care_reference', v_reference,
      'care_onboarded_at', now(),
      'care_plan_code', case when p_plan_id is null then null else v_plan.code end
    ),
    updated_at = now()
  where id = p_work_item_id;

  return jsonb_build_object(
    'property_id', v_property_id,
    'contract_id', v_contract_id,
    'reference', v_reference,
    'plan_code', case when p_plan_id is null then null else v_plan.code end,
    'price_cents', case when p_plan_id is null then null else v_plan.price_cents end,
    'currency', case when p_plan_id is null then null else v_plan.currency end
  );
end;
$$;

revoke all on function public.care_onboard_lead(
  uuid, uuid, text, text, text, text, text, boolean, boolean, uuid, date, integer
) from public, anon, authenticated;

grant execute on function public.care_onboard_lead(
  uuid, uuid, text, text, text, text, text, boolean, boolean, uuid, date, integer
) to service_role;
