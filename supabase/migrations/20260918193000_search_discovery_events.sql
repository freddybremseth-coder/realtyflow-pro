create table if not exists public.search_discovery_events (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null,
  source text not null check (
    source in (
      'google_search',
      'bing_search',
      'chatgpt',
      'microsoft_copilot',
      'perplexity',
      'google_gemini',
      'brave_search',
      'duckduckgo'
    )
  ),
  path text not null,
  referrer_host text,
  occurred_at timestamptz not null default now()
);

create index if not exists search_discovery_events_brand_time_idx
  on public.search_discovery_events (brand_id, occurred_at desc);

create index if not exists search_discovery_events_source_time_idx
  on public.search_discovery_events (source, occurred_at desc);

create index if not exists search_discovery_events_path_time_idx
  on public.search_discovery_events (path, occurred_at desc);

alter table public.search_discovery_events enable row level security;

revoke all on table public.search_discovery_events from anon, authenticated;

comment on table public.search_discovery_events is
  'Privacy-minimal first-party landing events from known search and AI referrers. No user identifiers, IP addresses, cookies or query strings are stored.';
