-- Corporate Account Strategy v2 + AI Sales Coach.
-- Extends the existing human-governed Corporate workspace. Coach output is advisory only;
-- no email, LinkedIn message, call or meeting is executed automatically.

alter table public.corporate_account_strategies
  add column if not exists account_role text not null default 'END_CUSTOMER',
  add column if not exists primary_model text,
  add column if not exists secondary_model text,
  add column if not exists expansion_model text,
  add column if not exists recommended_entry_role text,
  add column if not exists champion_hypothesis text,
  add column if not exists problem_hypothesis text,
  add column if not exists problem_acceptance_goal text,
  add column if not exists solution_hypothesis text,
  add column if not exists solution_acceptance_goal text,
  add column if not exists core_message text,
  add column if not exists avoid_message text,
  add column if not exists next_best_action text,
  add column if not exists next_action_reason text,
  add column if not exists business_case jsonb not null default '{}'::jsonb;

alter table public.corporate_account_strategies
  drop constraint if exists corporate_account_strategies_account_role_check;
alter table public.corporate_account_strategies
  add constraint corporate_account_strategies_account_role_check
  check (account_role in ('END_CUSTOMER','PARTNER','MEMBER_ORGANIZATION','ADVISOR','REFERRAL_PARTNER'));

create table if not exists public.corporate_sales_coach_runs (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.corporate_prospects(id) on delete cascade,
  mode text not null
    check (mode in ('NEXT_STEP','DISCOVERY','EMAIL','ARGUMENTS','OBJECTION','MEETING')),
  source_text text,
  seller_context text,
  output jsonb not null default '{}'::jsonb,
  provider text,
  model text,
  created_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists corporate_sales_coach_runs_account_idx
  on public.corporate_sales_coach_runs (prospect_id, created_at desc);

alter table public.corporate_sales_coach_runs enable row level security;
revoke all on table public.corporate_sales_coach_runs from public, anon, authenticated;
grant select, insert, delete on table public.corporate_sales_coach_runs to service_role;

comment on table public.corporate_sales_coach_runs is
  'Account-specific AI sales coaching. Advisory output and draft copy only; never an automatic external action.';
comment on column public.corporate_account_strategies.problem_acceptance_goal is
  'What the seller needs the buyer to explicitly acknowledge before presenting a solution.';
comment on column public.corporate_account_strategies.solution_acceptance_goal is
  'What the buyer should validate about solution fit before moving to the next commitment.';
