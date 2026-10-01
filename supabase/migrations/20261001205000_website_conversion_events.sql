create table if not exists public.website_conversion_events (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null,
  event_type text not null check (
    event_type in ('next_step','demo','trial','booking','email','contact')
  ),
  path text not null,
  target text not null,
  landing_path text,
  discovery_source text check (
    discovery_source is null or discovery_source in (
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
  occurred_at timestamptz not null default now()
);

create index if not exists website_conversion_events_brand_time_idx
  on public.website_conversion_events (brand_id, occurred_at desc);

create index if not exists website_conversion_events_type_time_idx
  on public.website_conversion_events (event_type, occurred_at desc);

create index if not exists website_conversion_events_source_time_idx
  on public.website_conversion_events (discovery_source, occurred_at desc);

alter table public.website_conversion_events enable row level security;

revoke all on table public.website_conversion_events from anon, authenticated;

comment on table public.website_conversion_events is
  'Privacy-minimal first-party CTA events. Stores only brand, page, coarse action/target, optional known search/AI source and landing path. No user identifiers, IP addresses, cookies, email addresses or URL query strings.';
