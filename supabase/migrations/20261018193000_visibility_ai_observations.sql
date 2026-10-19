-- Altovena Visibility: append-only AI search observations.
-- No public access and no automatic claims of citations.
create table if not exists public.visibility_ai_observations (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null,
  provider text not null check (provider in ('chatgpt','perplexity','google_ai','copilot')),
  prompt text not null check (char_length(prompt) between 1 and 2000),
  locale text not null,
  observed_at timestamptz not null,
  response_excerpt text not null check (char_length(response_excerpt) between 1 and 4000),
  cited_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(cited_urls)='array'),
  brand_mentioned boolean not null default false,
  captured_by text not null check (captured_by in ('manual','authorized_api')),
  evidence_state text not null check (evidence_state in ('CITED','MENTIONED_NOT_CITED','NOT_OBSERVED')),
  verification_state text not null default 'UNVERIFIED' check (verification_state in ('UNVERIFIED','INDEPENDENTLY_VERIFIED')),
  inserted_at timestamptz not null default now()
);
create index if not exists visibility_ai_observations_brand_time_idx
  on public.visibility_ai_observations(brand_id,observed_at desc);
alter table public.visibility_ai_observations enable row level security;
revoke all on public.visibility_ai_observations from anon, authenticated;
grant select,insert on public.visibility_ai_observations to service_role;
comment on table public.visibility_ai_observations is
  'Manual reports are UNVERIFIED until independently authenticated; no observations does not imply zero visibility.';
