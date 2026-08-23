-- Agentic Core 1.1 — durable persistens for agent runs og unifisert approval.
--
-- agent_runs: durable Agent Run + Action Trace + outcome (punkt 5). Kan
--   rekonstrueres etter restart/deploy. Kun redigert/summary-trace — aldri CoT.
-- agentic_approvals: ÉN godkjenningskø (punkt 6) som REFERERER eksisterende
--   RealtyFlow-approvals via (subject_type, subject_ref) — buyer_profile,
--   shortlist, presentation, message_draft — samt generic_agent_action.
--   Den erstatter ikke Lead Intelligence sine approvals; den aggregerer dem.
--
-- SECURITY DEFINER-triggere/agenter skriver via service_role; direkte anon/
-- authenticated API-tilgang nektes (samme mønster som business_financial_events).

create table if not exists public.agent_runs (
  id               text primary key,                 -- runId (run_...)
  agent_id         text not null,
  goal             text,
  status           text not null default 'running'
                     check (status in ('pending','running','waiting_approval','completed','failed','cancelled')),
  outcome          text check (outcome in ('recommended','approved','executed','failed','rejected')),
  correlation_id   text,
  idempotency_key  text unique,                       -- stabil dedupe (punkt 2/3)
  steps            jsonb not null default '[]'::jsonb, -- Action Trace (summary-only)
  decision         jsonb,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists idx_agent_runs_correlation on public.agent_runs (correlation_id);
create index if not exists idx_agent_runs_status on public.agent_runs (status);

create table if not exists public.agentic_approvals (
  id                        uuid primary key default gen_random_uuid(),
  run_id                    text references public.agent_runs(id) on delete set null,
  correlation_id            text,
  idempotency_key           text unique not null,     -- operasjons-scoped (punkt 4)
  title                     text not null,
  gated_action_class        text not null,
  subject_type              text not null
                              check (subject_type in ('buyer_profile','shortlist','presentation','message_draft','generic_agent_action')),
  subject_ref               text,                     -- peker til eksisterende approval-objekt
  customer_ref              text,
  draft_id                  text,
  reason                    text,
  risk                      text check (risk in ('low','medium','high','critical')),
  decision_mode             text check (decision_mode in ('live','draft-first','manual-review','human-required')),
  confidence                numeric,
  estimated_opportunity_eur numeric,
  status                    text not null default 'pending'
                              check (status in ('pending','approved','rejected','superseded')),
  resolved_by               text,
  resolved_at               timestamptz,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);
create index if not exists idx_agentic_approvals_status on public.agentic_approvals (status);
create index if not exists idx_agentic_approvals_run on public.agentic_approvals (run_id);
create index if not exists idx_agentic_approvals_subject on public.agentic_approvals (subject_type, subject_ref);

alter table public.agent_runs enable row level security;
alter table public.agentic_approvals enable row level security;

-- Skriving skjer via service_role (agent-runtime). Godkjenningskøen kan LESES av
-- innloggede med execution-tilgang; oppdatering (approve/reject) gjøres via
-- server-rute med service_role.
drop policy if exists "agent_runs_deny_direct" on public.agent_runs;
create policy "agent_runs_deny_direct" on public.agent_runs
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "agentic_approvals_read" on public.agentic_approvals;
create policy "agentic_approvals_read" on public.agentic_approvals
  for select to authenticated using (true);
drop policy if exists "agentic_approvals_deny_write" on public.agentic_approvals;
create policy "agentic_approvals_deny_write" on public.agentic_approvals
  for all to anon using (false) with check (false);
