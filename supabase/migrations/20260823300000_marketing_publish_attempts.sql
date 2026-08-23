-- Marketing Growth OS — Phase 7.1B: ekstern publiserings-idempotens.
--
-- Attempt-ledger for kanal-publisering. Skrives FØR Graph-kallet med unik
-- idempotency_key. Et forsøk som timer ut står "posting"; neste retry avstemmer
-- mot kanalen (reconcile) i stedet for å poste på nytt — dobbelt innlegg er
-- umulig. Bærer alle identitetene (correlation/run/campaign/content/publication).

create table if not exists public.marketing_publish_attempts (
  id               uuid primary key default gen_random_uuid(),
  idempotency_key  text unique not null,
  publication_id   text,
  content_id       text,
  campaign_id      text,
  marketing_run_id text,
  correlation_id   text,
  channel          text,
  status           text not null default 'posting' check (status in ('posting','posted','failed')),
  external_id      text,
  dry_run          boolean not null default false,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_mkt_publish_attempts_pub on public.marketing_publish_attempts (publication_id);

alter table public.marketing_publish_attempts enable row level security;
drop policy if exists "marketing_publish_attempts_deny_direct" on public.marketing_publish_attempts;
create policy "marketing_publish_attempts_deny_direct" on public.marketing_publish_attempts
  for all to anon, authenticated using (false) with check (false);
