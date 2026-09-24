-- Foundation only for Zen Eco Homes / Andrea NEW lead collaboration starting
-- 2026-09-24 00:00 Europe/Madrid (= 2026-09-23 22:00 UTC).
-- NO records are inserted by this migration; no employees receive CRM access.
-- An imported old contact can have a new CRM created_at. NEVER auto-approve based
-- on created_at alone. First genuine enquiry must be verified independently.

create table if not exists core.zeneco_joint_lead_cohort (
  contact_id uuid primary key references public.contacts(id) on delete restrict,
  brand_id uuid not null references core.brands(id) on delete restrict,
  eligibility text not null default 'pending'
    check (eligibility in ('pending', 'approved', 'excluded', 'revoked')),
  first_genuine_enquiry_at timestamptz,
  received_source text,
  review_reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    eligibility <> 'approved' or (
      first_genuine_enquiry_at is not null
      and first_genuine_enquiry_at >= timestamptz '2026-09-23 22:00:00+00'
      and received_source is not null and length(btrim(received_source)) > 0
      and reviewed_by is not null and length(btrim(reviewed_by)) > 0
      and reviewed_at is not null
    )
  )
);
create index if not exists zeneco_joint_lead_cohort_eligibility_idx
  on core.zeneco_joint_lead_cohort (brand_id, eligibility, first_genuine_enquiry_at);
alter table core.zeneco_joint_lead_cohort enable row level security;
revoke all on core.zeneco_joint_lead_cohort from anon, authenticated;
grant select, insert, update on core.zeneco_joint_lead_cohort to service_role;
comment on table core.zeneco_joint_lead_cohort is
  'Unactivated Zen Eco joint lead cohort. Requires owner-reviewed, independently verified first enquiry. Never permits workspace CRM by itself.';

-- Aggregate PREVIEW only, never an eligibility decision. CRM created_at can
-- reflect re-import, a migrated record, or a later new CRM record for an old lead.
-- This must remain service-only and be exposed only by an owner-session API.
create or replace function public.workspace_zeneco_new_crm_candidates_count()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'new_crm_records_to_review', count(*)::integer,
    'approved_joint_records', (
      select count(*)::integer
      from core.zeneco_joint_lead_cohort joint
      join core.brands brand on brand.id = joint.brand_id
      where brand.brand_key = 'zeneco' and joint.eligibility = 'approved'
    )
  )
  from public.contacts c
  where c.brand_id = 'zeneco'
    and c.brand = 'zeneco'
    and c.created_at >= timestamptz '2026-09-23 22:00:00+00'
    and not exists (
      select 1 from core.zeneco_joint_lead_cohort existing
      where existing.contact_id = c.id
    );
$$;
revoke execute on function public.workspace_zeneco_new_crm_candidates_count()
  from public, anon, authenticated;
grant execute on function public.workspace_zeneco_new_crm_candidates_count() to service_role;
