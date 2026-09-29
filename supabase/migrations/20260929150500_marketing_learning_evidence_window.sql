-- Learning freshness must reflect when the underlying evidence happened, not
-- when a rule was most recently recalculated.
alter table if exists public.marketing_learning_rules
  add column if not exists evidence_first_at timestamptz,
  add column if not exists evidence_last_at timestamptz;

create index if not exists idx_mkt_learn_scope_evidence_last
  on public.marketing_learning_rules (scope, evidence_last_at desc);
