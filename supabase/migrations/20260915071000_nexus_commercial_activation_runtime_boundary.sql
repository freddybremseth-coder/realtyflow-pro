-- Keep Nexus Commercial Activation inside the existing least-privilege Lead Intelligence boundary.
-- The runtime role must not receive general contacts/work_items privileges.

create or replace function public.nexus_commercial_activation_contact_guard(
  p_contact_id uuid,
  p_brand text,
  p_expected_updated_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.contacts c
     where c.id = p_contact_id
       and upper(coalesce(c.pipeline_status, '')) in ('VIEWING', 'QUALIFIED')
       and coalesce(c.do_not_contact, false) = false
       and coalesce(c.email_suppressed, false) = false
       and lower(coalesce(nullif(c.brand_id, ''), nullif(c.brand, ''), '')) = lower(coalesce(p_brand, ''))
       and c.updated_at is not distinct from p_expected_updated_at
  );
$$;

revoke all on function public.nexus_commercial_activation_contact_guard(uuid, text, timestamptz) from public;
grant execute on function public.nexus_commercial_activation_contact_guard(uuid, text, timestamptz)
  to realtyflow_lead_intelligence_runtime;

create unique index if not exists work_items_commercial_activation_source_unique
  on public.work_items (source_type, source_id)
  where source_type = 'ai_agent'
    and source_id like 'commercial-activation:%';

create or replace function public.ensure_nexus_commercial_activation_work_item(
  p_contact_id uuid,
  p_brand text,
  p_expected_updated_at timestamptz,
  p_source_id text,
  p_title text,
  p_description text,
  p_next_action text,
  p_priority text,
  p_ai_score integer,
  p_metadata jsonb
)
returns table(id uuid, inserted boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_id uuid;
  inserted_id uuid;
  normalized_brand text := lower(coalesce(p_brand, ''));
begin
  if normalized_brand not in ('zeneco', 'soleada', 'pinosoecolife') then
    raise exception 'COMMERCIAL_ACTIVATION_INVALID_BRAND' using errcode = '22023';
  end if;

  if p_source_id is null
     or p_source_id not like ('commercial-activation:' || p_contact_id::text || ':%')
     or length(p_source_id) > 240 then
    raise exception 'COMMERCIAL_ACTIVATION_INVALID_SOURCE_ID' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_title, '')), '') is null
     or nullif(btrim(coalesce(p_description, '')), '') is null
     or nullif(btrim(coalesce(p_next_action, '')), '') is null then
    raise exception 'COMMERCIAL_ACTIVATION_INVALID_WORK_ITEM' using errcode = '22023';
  end if;

  if p_priority not in ('HIGH', 'MEDIUM') or p_ai_score not between 0 and 100 then
    raise exception 'COMMERCIAL_ACTIVATION_INVALID_PRIORITY' using errcode = '22023';
  end if;

  if coalesce(p_metadata ->> 'domain', '') <> 'real_estate'
     or coalesce(p_metadata ->> 'contact_id', '') <> p_contact_id::text
     or coalesce(p_metadata ->> 'performed_by', '') <> 'Nexus Commercial Activation'
     or coalesce(p_metadata ->> 'customer_send', '') <> 'false'
     or coalesce(p_metadata ->> 'kind', '') not in (
       'buyer_profile_evidence_conflict',
       'buyer_profile_discovery',
       'buyer_profile_commercial_activation_review'
     ) then
    raise exception 'COMMERCIAL_ACTIVATION_INVALID_METADATA' using errcode = '22023';
  end if;

  -- Revalidate the exact CRM snapshot before any durable preparation work is written.
  -- A CRM change during the LI transaction makes the whole transaction fail closed.
  if not public.nexus_commercial_activation_contact_guard(
    p_contact_id,
    normalized_brand,
    p_expected_updated_at
  ) then
    raise exception 'COMMERCIAL_ACTIVATION_STALE_CONTACT' using errcode = '40001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_source_id, 0));

  select w.id
    into existing_id
    from public.work_items w
   where w.source_type = 'ai_agent'
     and w.source_id = p_source_id
   limit 1;

  if existing_id is not null then
    return query select existing_id, false;
    return;
  end if;

  insert into public.work_items (
    title,
    description,
    status,
    priority,
    brand_id,
    source_type,
    source_id,
    assigned_agent,
    next_action,
    ai_score,
    metadata
  ) values (
    p_title,
    p_description,
    'TO_DO',
    p_priority,
    normalized_brand,
    'ai_agent',
    p_source_id,
    'nexus_buyer_intelligence',
    p_next_action,
    p_ai_score,
    p_metadata
  )
  on conflict do nothing
  returning work_items.id into inserted_id;

  if inserted_id is not null then
    return query select inserted_id, true;
    return;
  end if;

  select w.id
    into existing_id
    from public.work_items w
   where w.source_type = 'ai_agent'
     and w.source_id = p_source_id
   limit 1;

  if existing_id is null then
    raise exception 'COMMERCIAL_ACTIVATION_WORK_ITEM_NOT_DURABLE' using errcode = '40001';
  end if;

  return query select existing_id, false;
end;
$$;

revoke all on function public.ensure_nexus_commercial_activation_work_item(
  uuid, text, timestamptz, text, text, text, text, text, integer, jsonb
) from public;
grant execute on function public.ensure_nexus_commercial_activation_work_item(
  uuid, text, timestamptz, text, text, text, text, text, integer, jsonb
) to realtyflow_lead_intelligence_runtime;
