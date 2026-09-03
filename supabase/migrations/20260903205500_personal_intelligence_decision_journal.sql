-- Personal Intelligence OS — Decision Journal foundation.
-- Decision quality and outcome quality are intentionally separate.

create table if not exists mentor.decisions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  goal_id uuid references personal_core.goals(id) on delete set null,
  title text not null,
  decision_type text not null default 'operational'
    check (decision_type in ('trivial','operational','strategic','life')),
  description text,
  deadline timestamptz,
  reversibility text not null default 'unknown'
    check (reversibility in ('one_way','two_way','mixed','unknown')),
  stakes text not null default 'medium'
    check (stakes in ('low','medium','high','critical')),
  status text not null default 'open'
    check (status in ('open','analyzing','decided','review_due','reviewed','cancelled')),
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  chosen_option_id uuid,
  context_snapshot jsonb not null default '{}'::jsonb,
  evidence_snapshot jsonb not null default '[]'::jsonb,
  uncertainty_notes text,
  premortem text,
  scenario_notes text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mentor_decisions_owner_status_idx
  on mentor.decisions(owner_user_id, subject_entity_id, status, created_at desc);
create index if not exists mentor_decisions_review_idx
  on mentor.decisions(owner_user_id, deadline) where status in ('open','analyzing','review_due');

create trigger mentor_decisions_touch_updated_at
before update on mentor.decisions
for each row execute function personal_core.touch_updated_at();

create table if not exists mentor.decision_options (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid not null references mentor.decisions(id) on delete cascade,
  label text not null,
  description text,
  upside text,
  downside text,
  opportunity_cost text,
  complexity_score numeric(5,4) check (complexity_score is null or (complexity_score >= 0 and complexity_score <= 1)),
  strategic_fit numeric(5,4) check (strategic_fit is null or (strategic_fit >= 0 and strategic_fit <= 1)),
  life_fit numeric(5,4) check (life_fit is null or (life_fit >= 0 and life_fit <= 1)),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists mentor_decision_options_decision_idx
  on mentor.decision_options(owner_user_id, decision_id, position, created_at);

alter table mentor.decisions
  add constraint mentor_decisions_chosen_option_fk
  foreign key (chosen_option_id) references mentor.decision_options(id) on delete set null;

create table if not exists mentor.decision_assumptions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid not null references mentor.decisions(id) on delete cascade,
  statement text not null,
  importance numeric(5,4) check (importance is null or (importance >= 0 and importance <= 1)),
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  testability text not null default 'unknown'
    check (testability in ('testable','partly_testable','not_testable','unknown')),
  test_plan text,
  status text not null default 'active'
    check (status in ('active','testing','confirmed','weakened','invalidated','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mentor_decision_assumptions_decision_idx
  on mentor.decision_assumptions(owner_user_id, decision_id, status, created_at);

create trigger mentor_decision_assumptions_touch_updated_at
before update on mentor.decision_assumptions
for each row execute function personal_core.touch_updated_at();

create table if not exists mentor.decision_outcomes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid not null references mentor.decisions(id) on delete cascade,
  review_date timestamptz not null default now(),
  actual_outcome text,
  decision_quality numeric(5,4) check (decision_quality is null or (decision_quality >= 0 and decision_quality <= 1)),
  outcome_quality numeric(5,4) check (outcome_quality is null or (outcome_quality >= 0 and outcome_quality <= 1)),
  luck_factor numeric(5,4) check (luck_factor is null or (luck_factor >= 0 and luck_factor <= 1)),
  lesson text,
  belief_update text,
  created_at timestamptz not null default now()
);

create index if not exists mentor_decision_outcomes_decision_idx
  on mentor.decision_outcomes(owner_user_id, decision_id, review_date desc);

alter table mentor.decisions enable row level security;
alter table mentor.decision_options enable row level security;
alter table mentor.decision_assumptions enable row level security;
alter table mentor.decision_outcomes enable row level security;

revoke all on mentor.decisions, mentor.decision_options, mentor.decision_assumptions, mentor.decision_outcomes
  from public, anon, authenticated;

grant all on mentor.decisions, mentor.decision_options, mentor.decision_assumptions, mentor.decision_outcomes
  to service_role;

comment on table mentor.decisions is
  'Decision Journal snapshot of what was known, assumed and chosen at decision time; outcome quality must not be treated as decision quality.';
comment on table mentor.decision_assumptions is
  'Explicit assumption register for testing confidence, importance and falsifiability before or after a decision.';
comment on table mentor.decision_outcomes is
  'Outcome review separating process quality, realized outcome and luck.';

notify pgrst, 'reload schema';
