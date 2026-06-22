-- Lead Intelligence CRM context read surface.
-- Additive, read-only, and intentionally separate from broad public.contacts APIs.
-- This migration must not be run before:
--   20260614164309_lead_intelligence_persistence_foundation.sql
--   20260617130114_lead_intelligence_runtime_rls.sql

do $$
declare
  missing_columns text[];
begin
  if to_regrole('realtyflow_lead_intelligence_runtime') is null then
    raise exception 'LEAD_INTELLIGENCE_CRM_CONTEXT_SCHEMA_NOT_READY: runtime role is missing';
  end if;

  if to_regclass('public.contacts') is null then
    raise exception 'LEAD_INTELLIGENCE_CRM_CONTEXT_SCHEMA_NOT_READY: public.contacts is missing';
  end if;

  select array_agg(column_name order by column_name)
  into missing_columns
  from (
    values
      ('id'),
      ('brand'),
      ('name'),
      ('email'),
      ('phone'),
      ('pipeline_status'),
      ('pipeline_value'),
      ('property_interest'),
      ('source'),
      ('sentiment'),
      ('notes'),
      ('interactions'),
      ('last_contact'),
      ('next_followup'),
      ('created_at'),
      ('updated_at')
  ) required(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'contacts'
      and c.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'LEAD_INTELLIGENCE_CRM_CONTEXT_SCHEMA_INCOMPATIBLE: public.contacts missing required columns %', missing_columns;
  end if;

  if has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.contacts', 'select') then
    raise exception 'LEAD_INTELLIGENCE_CRM_CONTEXT_ROLE_INCOMPATIBLE: runtime role has direct contacts select';
  end if;
end $$;

drop view if exists public.lead_intelligence_crm_context_lookup;
create view public.lead_intelligence_crm_context_lookup
with (security_barrier = true)
as
select
  id,
  brand,
  name,
  email,
  phone,
  pipeline_status,
  pipeline_value,
  property_interest,
  source,
  sentiment,
  left(coalesce(notes, ''), 500) as notes_excerpt,
  case
    when jsonb_typeof(interactions) = 'array' then jsonb_array_length(interactions)
    else 0
  end as interaction_count,
  last_contact,
  next_followup,
  created_at,
  updated_at
from public.contacts
where brand = nullif(current_setting('app.lead_intelligence_brand', true), '');

comment on view public.lead_intelligence_crm_context_lookup is
  'Lead Intelligence read-only CRM context v1. Filtered by app.lead_intelligence_brand and granted only to the dedicated runtime role.';

revoke all on public.lead_intelligence_crm_context_lookup from public;
revoke all on public.lead_intelligence_crm_context_lookup from anon;
revoke all on public.lead_intelligence_crm_context_lookup from authenticated;
revoke all on public.lead_intelligence_crm_context_lookup from realtyflow_lead_intelligence_runtime;

grant select on public.lead_intelligence_crm_context_lookup to realtyflow_lead_intelligence_runtime;

do $$
begin
  if has_table_privilege('anon', 'public.lead_intelligence_crm_context_lookup', 'select')
    or has_table_privilege('authenticated', 'public.lead_intelligence_crm_context_lookup', 'select')
    or exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
      where n.nspname = 'public'
        and c.relname = 'lead_intelligence_crm_context_lookup'
        and acl.grantee = 0
        and acl.privilege_type = 'SELECT'
    ) then
    raise exception 'LEAD_INTELLIGENCE_CRM_CONTEXT_PRIVILEGE_ERROR: browser/public roles can select CRM context view';
  end if;

  if not has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_intelligence_crm_context_lookup', 'select') then
    raise exception 'LEAD_INTELLIGENCE_CRM_CONTEXT_PRIVILEGE_ERROR: runtime role cannot select CRM context view';
  end if;

  if has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.contacts', 'select') then
    raise exception 'LEAD_INTELLIGENCE_CRM_CONTEXT_PRIVILEGE_ERROR: runtime role has direct contacts select';
  end if;
end $$;
