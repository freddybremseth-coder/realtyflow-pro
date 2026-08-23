-- Marketing Growth OS — Phase 5: Learning Engine.
--
-- Persisterte læringsregler: per genome-dimensjon (channel/format/hook/…) måler
-- vi forretningsverdi-lift mot baseline + evidenceLevel fra utvalgsstørrelse.
-- rule_key (scope|dimension|value) + unique = idempotent refresh (regler
-- oppdateres, dupliseres aldri). Content-agentene leser disse FØR generering.

create table if not exists public.marketing_learning_rules (
  id                       uuid primary key default gen_random_uuid(),
  rule_key                 text unique not null,
  scope                    text not null,
  dimension                text not null,
  value                    text not null,
  sample                   integer not null default 0,
  avg_business_value       numeric not null default 0,
  avg_qualified_lead_rate  numeric not null default 0,
  total_leads              numeric not null default 0,
  total_qualified          numeric not null default 0,
  total_sales              numeric not null default 0,
  total_commission_eur     numeric not null default 0,
  lift                     numeric not null default 0,
  evidence                 text not null check (evidence in ('insufficient','directional','promising','reliable','strong')),
  verdict                  text not null check (verdict in ('favor','avoid','neutral')),
  finding                  text,
  updated_at               timestamptz not null default now(),
  created_at               timestamptz default now()
);

create index if not exists idx_mkt_learn_scope on public.marketing_learning_rules (scope, lift desc);
create index if not exists idx_mkt_learn_dim on public.marketing_learning_rules (dimension, verdict);

alter table public.marketing_learning_rules enable row level security;
drop policy if exists "marketing_learning_rules_deny_direct" on public.marketing_learning_rules;
create policy "marketing_learning_rules_deny_direct" on public.marketing_learning_rules
  for all to anon, authenticated using (false) with check (false);
