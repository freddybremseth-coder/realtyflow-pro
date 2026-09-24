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
  evidence_reference text,
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
      and evidence_reference is not null and length(btrim(evidence_reference)) >= 8
      and review_reason is not null and length(btrim(review_reason)) >= 8
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


-- Immutable audit entries for each owner review. Still NOT an access grant.
create table if not exists core.zeneco_joint_lead_review_audit (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete restrict,
  previous_status text,
  new_status text not null check (new_status in ('approved','excluded','revoked')),
  evidence_reference text,
  actor_email text not null,
  review_reason text not null,
  reviewed_at timestamptz not null default now()
);
alter table core.zeneco_joint_lead_review_audit enable row level security;
revoke all on core.zeneco_joint_lead_review_audit from anon, authenticated;
grant select, insert on core.zeneco_joint_lead_review_audit to service_role;

-- PREVIEW: names/identifiers returned only to the verified owner-session API.
-- Staff cannot execute this RPC or query core, even with a Zen brand grant.
create or replace function public.workspace_zeneco_review_candidates()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'contacts', coalesce(jsonb_agg(jsonb_build_object(
      'id', rows.id, 'brand_id', rows.brand_id, 'brand', rows.brand,
      'name', rows.name, 'email', rows.email,
      'created_at', rows.created_at, 'source', rows.source,
      'status', coalesce(rows.eligibility, 'unreviewed')
    ) order by rows.created_at desc, rows.id), '[]'::jsonb),
    'hasMore', count(*) > 25
  )
  from (
    select c.id, c.brand_id, c.brand, c.name, c.email, c.created_at, c.source, j.eligibility
    from public.contacts c
    left join core.zeneco_joint_lead_cohort j on j.contact_id = c.id
    where c.brand_id = 'zeneco' and c.brand = 'zeneco'
      and c.created_at >= timestamptz '2026-09-23 22:00:00+00'
    order by c.created_at desc, c.id
    limit 26
  ) rows;
$$;
revoke execute on function public.workspace_zeneco_review_candidates()
  from public, anon, authenticated;
grant execute on function public.workspace_zeneco_review_candidates() to service_role;

-- Only the owner-session backend can call this service-only reviewed write.
-- CRM created_at is just an additional necessary preflight, never sufficient
-- evidence of when a customer first approached the business.
create or replace function public.workspace_zeneco_review_lead(
  p_contact_id uuid, p_action text, p_first_genuine_enquiry_at timestamptz,
  p_received_source text, p_evidence_reference text, p_review_reason text,
  p_actor_email text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_brand_id uuid;
  v_existing text;
  v_next text;
begin
  if p_contact_id is null or p_action not in ('APPROVE','EXCLUDE','REVOKE')
     or length(btrim(coalesce(p_review_reason,''))) < 8
     or length(btrim(coalesce(p_review_reason,''))) > 1000
     or p_actor_email is null or p_actor_email <> lower(btrim(p_actor_email))
     or p_actor_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    return false;
  end if;
  select b.id into v_brand_id from core.brands b where b.brand_key = 'zeneco';
  if v_brand_id is null then return false; end if;

  -- Lock the actual CRM row to avoid concurrent transfer of its branding.
  perform 1 from public.contacts c
    where c.id = p_contact_id and c.brand_id = 'zeneco' and c.brand = 'zeneco'
      and c.created_at >= timestamptz '2026-09-23 22:00:00+00'
    for update;
  if not found then return false; end if;

  select j.eligibility into v_existing from core.zeneco_joint_lead_cohort j
    where j.contact_id = p_contact_id for update;
  if p_action = 'REVOKE' then
    if v_existing is distinct from 'approved' then return false; end if;
    v_next := 'revoked';
  elsif p_action = 'EXCLUDE' then
    if v_existing = 'approved' then return false; end if;
    v_next := 'excluded';
  else
    if v_existing = 'approved' then return false; end if;
    if p_first_genuine_enquiry_at is null
       or p_first_genuine_enquiry_at < timestamptz '2026-09-23 22:00:00+00'
       or p_first_genuine_enquiry_at > now()
       or length(btrim(coalesce(p_received_source,''))) < 3
       or length(btrim(coalesce(p_received_source,''))) > 200
       or length(btrim(coalesce(p_evidence_reference,''))) < 8
       or length(btrim(coalesce(p_evidence_reference,''))) > 256 then
      return false;
    end if;
    v_next := 'approved';
  end if;

  insert into core.zeneco_joint_lead_cohort as original (
    contact_id, brand_id, eligibility, first_genuine_enquiry_at,
    received_source, evidence_reference, review_reason, reviewed_by,
    reviewed_at, updated_at
  ) values (
    p_contact_id, v_brand_id, v_next,
    case when p_action = 'APPROVE' then p_first_genuine_enquiry_at else null end,
    case when p_action = 'APPROVE' then btrim(p_received_source) else null end,
    case when p_action = 'APPROVE' then btrim(p_evidence_reference) else null end,
    btrim(p_review_reason), p_actor_email, now(), now()
  ) on conflict (contact_id) do update
    set eligibility = excluded.eligibility,
      first_genuine_enquiry_at = case when p_action = 'REVOKE'
        then original.first_genuine_enquiry_at
        else excluded.first_genuine_enquiry_at end,
      received_source = case when p_action = 'REVOKE'
        then original.received_source
        else excluded.received_source end,
      evidence_reference = case when p_action = 'REVOKE'
        then original.evidence_reference
        else excluded.evidence_reference end,
      review_reason = excluded.review_reason,
      reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at,
      updated_at = excluded.updated_at;

  insert into core.zeneco_joint_lead_review_audit (
    contact_id, previous_status, new_status, evidence_reference,
    actor_email, review_reason
  ) values (
    p_contact_id, v_existing, v_next,
    case when p_action = 'APPROVE' then btrim(p_evidence_reference) else null end,
    p_actor_email, btrim(p_review_reason)
  );
  return true;
end; $$;
revoke execute on function public.workspace_zeneco_review_lead(
  uuid,text,timestamptz,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.workspace_zeneco_review_lead(
  uuid,text,timestamptz,text,text,text,text
) to service_role;
