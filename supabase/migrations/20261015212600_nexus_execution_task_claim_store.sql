-- Nexus controlled task-claim store. PREPARED MIGRATION ONLY; do not apply to production
-- until reviewed against the live schema and staging-tested. No seed grants,
-- API route, worker, mail sender or external execution is enabled here.
-- This migration relies on existing core.brands, core.brand_workspace_memberships
-- and auth.users. Tables are in the non-exposed core schema.

create table core.nexus_execution_tasks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references core.brands(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft','researching','review_required','approved',
      'rejected','executing','completed','failed','cancelled')),
  version integer not null default 1 check (version > 0),
  action_type text not null,
  action_digest text not null
    check (action_digest ~ '^sha256:[a-f0-9]{64}$'),
  proposed_by uuid not null references auth.users(id) on delete restrict,
  quality_reviewed boolean not null default false,
  evidence_refs text[] not null default '{}',
  preflight_passed boolean not null default false,
  preflight_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index nexus_execution_tasks_brand_status_idx
  on core.nexus_execution_tasks (brand_id,status,updated_at desc);

create table core.nexus_execution_approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references core.nexus_execution_tasks(id) on delete restrict,
  brand_id uuid not null references core.brands(id) on delete restrict,
  task_version integer not null check (task_version > 0),
  action_type text not null,
  action_digest text not null
    check (action_digest ~ '^sha256:[a-f0-9]{64}$'),
  decision text not null check (decision in ('approved','rejected')),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (task_id,task_version)
);

-- Independent, explicit allowlist. NO ROWS inserted or enabled by migration.
-- Separate from ordinary CRM permissions: a member must have both their
-- existing tasks.joint.write brand grant AND a dedicated active capability.
create table core.nexus_execution_authorizations (
  brand_id uuid not null,
  user_id uuid not null,
  capability text not null check (capability in ('review','execute')),
  enabled boolean not null default false,
  granted_at timestamptz,
  granted_by uuid references auth.users(id) on delete restrict,
  primary key (brand_id,user_id,capability),
  foreign key (brand_id,user_id)
    references core.brand_workspace_memberships(brand_id,user_id) on delete restrict,
  check (not enabled or (granted_at is not null and granted_by is not null))
);

create table core.nexus_execution_claims (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references core.nexus_execution_tasks(id) on delete restrict,
  brand_id uuid not null references core.brands(id) on delete restrict,
  task_version integer not null check (task_version > 0),
  approval_id uuid not null references core.nexus_execution_approvals(id) on delete restrict,
  action_type text not null,
  action_digest text not null
    check (action_digest ~ '^sha256:[a-f0-9]{64}$'),
  claimed_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null unique
    check (idempotency_key ~ '^op_[a-f0-9]{40}$'),
  claimed_at timestamptz not null default now()
);

-- Claim audit is append-only to service_role. Broader task/approval
-- lifecycle events require a separately reviewed phase-2 writer.
create table core.nexus_execution_claim_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references core.nexus_execution_tasks(id) on delete restrict,
  brand_id uuid not null references core.brands(id) on delete restrict,
  claim_id uuid not null unique references core.nexus_execution_claims(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null default 'execution_claimed'
    check (event_type = 'execution_claimed'),
  happened_at timestamptz not null default now()
);

alter table core.nexus_execution_tasks enable row level security;
alter table core.nexus_execution_approvals enable row level security;
alter table core.nexus_execution_authorizations enable row level security;
alter table core.nexus_execution_claims enable row level security;
alter table core.nexus_execution_claim_events enable row level security;

revoke all on core.nexus_execution_tasks,
  core.nexus_execution_approvals, core.nexus_execution_authorizations,
  core.nexus_execution_claims, core.nexus_execution_claim_events
  from public, anon, authenticated, service_role;
grant usage on schema core to service_role;
grant select on core.nexus_execution_tasks,
  core.nexus_execution_approvals, core.nexus_execution_authorizations,
  core.nexus_execution_claims, core.nexus_execution_claim_events
  to service_role;

-- Only this tightly scoped, service-role-only function can insert a claim
-- and progress the task to executing. No job is actually executed.
create function core.claim_nexus_execution_task(
  p_task_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_approval_id uuid,
  p_action_type text,
  p_action_digest text,
  p_idempotency_key text
)
returns table(outcome text, claim_id uuid)
language plpgsql
security definer
set search_path = ''
as $claim_nexus_execution_task$
declare
  v_task core.nexus_execution_tasks%rowtype;
  v_approval core.nexus_execution_approvals%rowtype;
  v_existing core.nexus_execution_claims%rowtype;
  v_claim_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  -- The application must additionally derive actor identity from a validated
  -- server-side session, not from an incoming request body.
  if p_task_id is null or p_actor_user_id is null or p_approval_id is null
    or p_expected_version is null
    or p_idempotency_key !~ '^op_[a-f0-9]{40}$'
    or p_action_digest !~ '^sha256:[a-f0-9]{64}$'
    or p_action_type not in (
      'shortlist_draft_prepare', 'presentation_draft_prepare',
      'property_match_prepare'
    )
  then
    raise exception 'NEXUS_CLAIM_INVALID_ARGUMENT' using errcode = '22023';
  end if;

  -- Serialize all claims for the same task, even across different workers.
  select * into v_task
  from core.nexus_execution_tasks t
  where t.id = p_task_id
  for update;
  if not found then
    raise exception 'NEXUS_CLAIM_TASK_NOT_FOUND' using errcode = '22023';
  end if;

  -- A repeat of the same already-committed claim is acknowledged but never
  -- issued a second claim. Changed actor, approval or action is rejected.
  select * into v_existing
  from core.nexus_execution_claims c
  where c.task_id = p_task_id
  for update;
  if found then
    if v_existing.idempotency_key = p_idempotency_key
      and v_existing.task_version = p_expected_version
      and v_existing.approval_id = p_approval_id
      and v_existing.action_type = p_action_type
      and v_existing.action_digest = p_action_digest
      and v_existing.claimed_by = p_actor_user_id
    then
      return query select 'duplicate'::text, v_existing.id;
      return;
    end if;
    raise exception 'NEXUS_CLAIM_ALREADY_RESERVED' using errcode = '23505';
  end if;

  if v_task.status <> 'approved'
    or v_task.version <> p_expected_version
    or v_task.action_type <> p_action_type
    or v_task.action_digest <> p_action_digest
  then
    raise exception 'NEXUS_CLAIM_STALE_TASK' using errcode = '40001';
  end if;
  if not v_task.quality_reviewed
    or cardinality(v_task.evidence_refs) = 0
    or array_position(v_task.evidence_refs, null) is not null
    or exists (select 1 from unnest(v_task.evidence_refs) ref where btrim(ref) = '')
  then
    raise exception 'NEXUS_CLAIM_EVIDENCE_REQUIRED' using errcode = '22023';
  end if;
  if not v_task.preflight_passed
    or v_task.preflight_checked_at is null
    or v_task.preflight_checked_at < v_now - interval '5 minutes'
    or v_task.preflight_checked_at > v_now + interval '30 seconds'
  then
    raise exception 'NEXUS_CLAIM_PREFLIGHT_STALE' using errcode = '22023';
  end if;

  -- Lock approval during claim so concurrent revocation cannot interleave.
  select * into v_approval
  from core.nexus_execution_approvals a
  where a.id = p_approval_id and a.task_id = p_task_id
  for update;
  if not found
    or v_approval.brand_id <> v_task.brand_id
    or v_approval.task_version <> v_task.version
    or v_approval.action_type <> v_task.action_type
    or v_approval.action_digest <> v_task.action_digest
    or v_approval.decision <> 'approved'
    or v_approval.revoked_at is not null
    or v_approval.expires_at <= v_now
    or v_approval.reviewed_by = v_task.proposed_by
    or v_approval.reviewed_by = p_actor_user_id
    or v_task.proposed_by = p_actor_user_id
  then
    raise exception 'NEXUS_CLAIM_APPROVAL_INVALID' using errcode = '22023';
  end if;

  -- Lock current grants so revocation and claim cannot race invisibly.
  perform 1
  from core.brand_workspace_memberships m
  join core.nexus_execution_authorizations a
    on a.brand_id = m.brand_id and a.user_id = m.user_id
  where m.brand_id = v_task.brand_id and m.user_id = p_actor_user_id
    and m.status = 'active'
    and 'tasks.joint.write' = any(m.permissions)
    and a.capability = 'execute' and a.enabled = true
  for share of m, a;
  if not found then
    raise exception 'NEXUS_CLAIM_EXECUTOR_SCOPE_DENIED' using errcode = '42501';
  end if;

  perform 1
  from core.brand_workspace_memberships m
  join core.nexus_execution_authorizations a
    on a.brand_id = m.brand_id and a.user_id = m.user_id
  where m.brand_id = v_task.brand_id and m.user_id = v_approval.reviewed_by
    and m.status = 'active'
    and 'tasks.joint.write' = any(m.permissions)
    and a.capability = 'review' and a.enabled = true
  for share of m, a;
  if not found then
    raise exception 'NEXUS_CLAIM_REVIEWER_SCOPE_DENIED' using errcode = '42501';
  end if;

  insert into core.nexus_execution_claims
    (task_id,brand_id,task_version,approval_id,action_type,action_digest,
     claimed_by,idempotency_key,claimed_at)
  values
    (v_task.id,v_task.brand_id,v_task.version,v_approval.id,
     v_task.action_type,v_task.action_digest,p_actor_user_id,p_idempotency_key,v_now)
  returning id into v_claim_id;

  update core.nexus_execution_tasks
  set status = 'executing', version = version + 1, updated_at = v_now
  where id = v_task.id;

  insert into core.nexus_execution_claim_events
    (task_id,brand_id,claim_id,actor_user_id,event_type,happened_at)
  values
    (v_task.id,v_task.brand_id,v_claim_id,p_actor_user_id,'execution_claimed',v_now);

  return query select 'claimed'::text, v_claim_id;
end;
$claim_nexus_execution_task$;

-- Database functions otherwise receive EXECUTE by default. Never expose to
-- anonymous, authenticated or PUBLIC roles; accessible only from server key.
revoke execute on function core.claim_nexus_execution_task(
  uuid,integer,uuid,uuid,text,text,text
) from public, anon, authenticated;
grant execute on function core.claim_nexus_execution_task(
  uuid,integer,uuid,uuid,text,text,text
) to service_role;

comment on function core.claim_nexus_execution_task(
  uuid,integer,uuid,uuid,text,text,text
) is 'Reserve an already approved Nexus task exactly once, with current scoped grants and a committed claim audit. Never performs the action.';
