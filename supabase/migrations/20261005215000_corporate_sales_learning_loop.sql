-- Corporate B2B learning loop + explicit sales-stage gates.
-- Coach output remains advisory until a human explicitly applies selected fields.

alter table public.corporate_account_strategies
  add column if not exists problem_acceptance_status text not null default 'UNKNOWN',
  add column if not exists problem_acceptance_evidence text,
  add column if not exists solution_acceptance_status text not null default 'UNKNOWN',
  add column if not exists solution_acceptance_evidence text,
  add column if not exists stage_override_reason text;

alter table public.corporate_account_strategies
  drop constraint if exists corporate_account_strategies_problem_acceptance_status_check;
alter table public.corporate_account_strategies
  add constraint corporate_account_strategies_problem_acceptance_status_check
  check (problem_acceptance_status in ('UNKNOWN','PARTIAL','CONFIRMED','REJECTED'));

alter table public.corporate_account_strategies
  drop constraint if exists corporate_account_strategies_solution_acceptance_status_check;
alter table public.corporate_account_strategies
  add constraint corporate_account_strategies_solution_acceptance_status_check
  check (solution_acceptance_status in ('UNKNOWN','PARTIAL','CONFIRMED','REJECTED'));

alter table public.corporate_sales_coach_runs
  add column if not exists applied_at timestamptz,
  add column if not exists applied_by_email text,
  add column if not exists applied_fields jsonb not null default '[]'::jsonb;

revoke all on table public.corporate_sales_coach_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.corporate_sales_coach_runs to service_role;

comment on column public.corporate_account_strategies.problem_acceptance_status is
  'Explicit seller-recorded customer acceptance state. Never inferred from AI output.';
comment on column public.corporate_account_strategies.solution_acceptance_status is
  'Explicit seller-recorded solution-fit acceptance state. Never inferred from AI output.';
comment on column public.corporate_account_strategies.stage_override_reason is
  'Human-entered reason for advancing a stage before deterministic exit criteria are complete.';
comment on column public.corporate_sales_coach_runs.applied_fields is
  'Whitelisted strategy fields a human explicitly applied from this coach run.';
