-- Marketing Growth OS — Phase 7: Autonomous Loop 1.0.
--
-- Persistens for den kontrollerte sløyfen. marketing_runs holder run-tilstand +
-- checkpoints (resumable: en avbrutt run gjenopptas fra første ikke-ferdige
-- steg). marketing_publications holder publiserings-tilstand med idempotens-
-- nøkkel (ingen dobbel-posting ved retry). Ingen egen autonomi bor her — ALLE
-- beslutninger går gjennom den agentiske Policy Engine i app-laget. Systemet
-- starter på copilot (publisering krever godkjenning).

create table if not exists public.marketing_runs (
  marketing_run_id text primary key,
  correlation_id   text not null,
  brand_id         text not null,
  level            text not null default 'copilot' check (level in ('observe','copilot','guarded','optimized')),
  stage            text not null default 'plan',
  checkpoints      jsonb not null default '[]'::jsonb,
  plan             jsonb,
  action_trace     jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_marketing_runs_brand on public.marketing_runs (brand_id, created_at desc);

create table if not exists public.marketing_publications (
  id               uuid primary key default gen_random_uuid(),
  publication_id   text unique not null,
  idempotency_key  text unique not null,
  marketing_run_id text references public.marketing_runs(marketing_run_id) on delete set null,
  campaign_id      text,
  content_id       text,
  channel          text,
  state            text not null default 'draft' check (state in ('draft','scheduled','approved','publishing','published','failed','paused')),
  scheduled_for    timestamptz,
  approval_id      text,
  quality_score    integer,
  autonomy_mode    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_marketing_pub_run on public.marketing_publications (marketing_run_id);
create index if not exists idx_marketing_pub_content on public.marketing_publications (content_id);

alter table public.marketing_runs enable row level security;
alter table public.marketing_publications enable row level security;
drop policy if exists "marketing_runs_deny_direct" on public.marketing_runs;
create policy "marketing_runs_deny_direct" on public.marketing_runs for all to anon, authenticated using (false) with check (false);
drop policy if exists "marketing_publications_deny_direct" on public.marketing_publications;
create policy "marketing_publications_deny_direct" on public.marketing_publications for all to anon, authenticated using (false) with check (false);
