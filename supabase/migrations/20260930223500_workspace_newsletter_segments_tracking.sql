alter table core.workspace_newsletter_subscribers
  add column if not exists segments text[] not null default '{}';

alter table core.workspace_newsletter_campaigns
  add column if not exists segment_filter text[] not null default '{}',
  add column if not exists opened_count integer not null default 0,
  add column if not exists clicked_count integer not null default 0;

alter table core.workspace_newsletter_deliveries
  add column if not exists tracking_token uuid not null default gen_random_uuid(),
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists open_count integer not null default 0,
  add column if not exists click_count integer not null default 0;

create unique index if not exists workspace_newsletter_deliveries_tracking_token_idx
  on core.workspace_newsletter_deliveries(tracking_token);

create table if not exists core.workspace_newsletter_links (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references core.workspace_newsletter_deliveries(id) on delete cascade,
  tracking_token uuid not null default gen_random_uuid() unique,
  destination_url text not null,
  click_count integer not null default 0,
  clicked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table core.workspace_newsletter_links enable row level security;
revoke all on core.workspace_newsletter_links from public, anon, authenticated;
grant all on core.workspace_newsletter_links to service_role;

create index if not exists workspace_newsletter_links_delivery_idx
  on core.workspace_newsletter_links(delivery_id);
