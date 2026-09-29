-- Outcome-aware Marketing Learning.
-- Separates vanity reach from traffic, leads, qualified pipeline and closed revenue.

alter table if exists public.marketing_learning_rules
  add column if not exists total_viewings numeric not null default 0,
  add column if not exists total_offers numeric not null default 0,
  add column if not exists total_clicks numeric not null default 0,
  add column if not exists total_exposure numeric not null default 0,
  add column if not exists outcome_tier text not null default 'none';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'marketing_learning_rules_outcome_tier_check'
  ) then
    alter table public.marketing_learning_rules
      add constraint marketing_learning_rules_outcome_tier_check
      check (outcome_tier in ('none','reach','traffic','lead','qualified_pipeline','sale'));
  end if;
end $$;

create index if not exists marketing_learning_rules_scope_outcome_tier_idx
  on public.marketing_learning_rules (scope, outcome_tier);
