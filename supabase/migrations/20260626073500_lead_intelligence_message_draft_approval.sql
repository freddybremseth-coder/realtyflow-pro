-- Lead Intelligence message draft approval gate.
--
-- This migration enables a narrow runtime update for approving an internal
-- message draft after Freddy review. It does not add sending, provider calls,
-- publishing, leads, contacts, tasks, or automatic follow-up.

begin;

do $$
begin
  if to_regclass('public.lead_customer_message_drafts') is null then
    raise exception 'LEAD_INTELLIGENCE_MESSAGE_APPROVAL_SCHEMA_NOT_READY: missing public.lead_customer_message_drafts';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'realtyflow_lead_intelligence_runtime') then
    raise exception 'LEAD_INTELLIGENCE_MESSAGE_APPROVAL_RUNTIME_ROLE_MISSING: runtime role is missing';
  end if;
end $$;

grant update (status, approved_by, approved_at)
  on public.lead_customer_message_drafts
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
  'Allows the Lead Intelligence runtime role to approve a draft message only after server-side preflight and explicit Freddy/admin approval. Does not allow sending.';

commit;
