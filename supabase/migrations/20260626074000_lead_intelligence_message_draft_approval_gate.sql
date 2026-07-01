-- Lead Intelligence message draft approval gate.
--
-- This migration allows the Lead Intelligence runtime role to approve an
-- already-created internal email draft. It does not send email, publish a
-- presentation, create leads, create contacts, or start follow-up automation.

begin;

do $$
begin
  if to_regclass('public.lead_customer_message_drafts') is null then
    raise exception 'LEAD_INTELLIGENCE_MESSAGE_APPROVAL_SCHEMA_NOT_READY: missing public.lead_customer_message_drafts';
  end if;

  if to_regclass('public.lead_customer_presentations') is null then
    raise exception 'LEAD_INTELLIGENCE_MESSAGE_APPROVAL_SCHEMA_NOT_READY: missing public.lead_customer_presentations';
  end if;

  if coalesce(obj_description('public.lead_customer_message_drafts'::regclass, 'pg_class'), '') <> 'Lead Intelligence presentation draft foundation v1' then
    raise exception 'LEAD_INTELLIGENCE_MESSAGE_APPROVAL_SCHEMA_INCOMPATIBLE: reviewed message draft schema is required';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'realtyflow_lead_intelligence_runtime') then
    raise exception 'LEAD_INTELLIGENCE_MESSAGE_APPROVAL_RUNTIME_ROLE_MISSING: runtime role is required';
  end if;
end $$;

grant update (status, approved_by, approved_at) on public.lead_customer_message_drafts
  to realtyflow_lead_intelligence_runtime;

drop policy if exists lead_customer_message_drafts_runtime_approve on public.lead_customer_message_drafts;
create policy lead_customer_message_drafts_runtime_approve
  on public.lead_customer_message_drafts
  for update
  to realtyflow_lead_intelligence_runtime
  using (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    and status = 'draft'
    and approved_by is null
    and approved_at is null
    and sent_at is null
    and cancelled_at is null
  )
  with check (
    brand = nullif(current_setting('app.lead_intelligence_brand', true), '')
    and status = 'approved'
    and approved_by is not null
    and approved_at is not null
    and sent_at is null
    and cancelled_at is null
  );

comment on policy lead_customer_message_drafts_runtime_approve on public.lead_customer_message_drafts is
  'Lead Intelligence runtime can approve draft message records for the server-validated brand without sending email.';

do $$
begin
  if has_table_privilege('anon', 'public.lead_customer_message_drafts', 'select')
     or has_table_privilege('authenticated', 'public.lead_customer_message_drafts', 'select')
     or has_table_privilege('anon', 'public.lead_customer_message_drafts', 'update')
     or has_table_privilege('authenticated', 'public.lead_customer_message_drafts', 'update') then
    raise exception 'LEAD_INTELLIGENCE_MESSAGE_APPROVAL_PRIVILEGE_DRIFT: browser roles must not access message drafts';
  end if;

  if has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_message_drafts', 'delete') then
    raise exception 'LEAD_INTELLIGENCE_MESSAGE_APPROVAL_PRIVILEGE_DRIFT: runtime role must not delete message drafts';
  end if;
end $$;

commit;
