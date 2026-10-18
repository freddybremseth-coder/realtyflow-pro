-- Altovena Visibility: isolated OpenAI API web-search sample ledger and atomic UTC daily quota.
-- A sample is not a ChatGPT consumer search result, a verified recommendation, or a rank.
-- Reserve the daily quota before any paid provider call; failures do not reset the quota.
create table if not exists public.visibility_ai_provider_sample_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null check (brand_id = 'zeneco'),
  provider text not null check (provider = 'openai_api_web_search'),
  sample_day date not null,
  prompt_id text not null check (char_length(prompt_id) between 1 and 100),
  prompt text not null check (char_length(prompt) between 1 and 2000),
  locale text not null check (char_length(locale) between 1 and 40),
  status text not null default 'RESERVED' check (status in ('RESERVED','COMPLETED','FAILED')),
  provider_response_id text unique,
  model text,
  answer text check (char_length(answer) <= 12000),
  cited_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(cited_urls)='array'),
  consulted_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(consulted_urls)='array'),
  brand_mentioned boolean,
  failure_category text check (failure_category in ('PROVIDER_ERROR','STORAGE_ERROR')),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (brand_id, sample_day)
);
create index if not exists visibility_ai_provider_sample_runs_brand_recent_idx
  on public.visibility_ai_provider_sample_runs (brand_id, created_at desc);
alter table public.visibility_ai_provider_sample_runs enable row level security;
revoke all on public.visibility_ai_provider_sample_runs from anon, authenticated;
grant select,insert,update on public.visibility_ai_provider_sample_runs to service_role;
comment on table public.visibility_ai_provider_sample_runs is
  'OpenAI API web_search samples only, maximum one reserved paid request per UTC day per brand. Does not represent ChatGPT Search rankings.';
