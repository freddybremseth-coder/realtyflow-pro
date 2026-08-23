-- Marketing Growth OS — Phase 6 Hardening 1.1: eksperiment-evidens.
--
-- En avgjort A/B-test (klar vinner, >= reliable) mates til Learning som et eget
-- EVIDENCE-signal — IKKE som syntetisk content med vinnerens metrics. Det
-- hindrer at samme underliggende performance telles én gang som content og én
-- gang som eksperiment. Vi lagrer kun troverdighet + normalisert løft for den
-- testede dimensjonen, aldri revenue-totaler. unique(experiment_id) =
-- idempotent (gjentatt evaluering dupliserer aldri evidens).

create table if not exists public.marketing_experiment_evidence (
  id              uuid primary key default gen_random_uuid(),
  experiment_id   uuid unique not null references public.social_growth_experiments(id) on delete cascade,
  brand_id        text,
  scope           text not null,
  source          text not null default 'experiment' check (source in ('experiment')),
  dimension       text not null,
  tested_value    text not null,
  success_metric  text not null,
  control_value   numeric,   -- metrikk per observasjon (kontroll) — rapportering
  variant_value   numeric,   -- metrikk per observasjon (vinner) — rapportering
  normalized_lift numeric not null,
  evidence_level  text not null check (evidence_level in ('insufficient','directional','promising','reliable','strong')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_mkt_exp_evidence_scope on public.marketing_experiment_evidence (scope, dimension);

alter table public.marketing_experiment_evidence enable row level security;
drop policy if exists "marketing_experiment_evidence_deny_direct" on public.marketing_experiment_evidence;
create policy "marketing_experiment_evidence_deny_direct" on public.marketing_experiment_evidence
  for all to anon, authenticated using (false) with check (false);
