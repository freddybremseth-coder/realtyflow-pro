-- Brand-scoped newsletter marketing for employee workspaces.
-- Subscribers are never inferred from CRM membership; explicit documented consent is required.
create table if not exists core.workspace_newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references core.brands(id) on delete cascade,
  email text not null,
  name text,
  status text not null default 'active' check (status in ('active','unsubscribed','bounced')),
  consent_source text not null,
  consent_note text,
  consent_at timestamptz not null,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  unsubscribed_at timestamptz,
  created_by_user_id uuid references auth.users(id),
  created_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, email)
);

create table if not exists core.workspace_newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references core.brands(id) on delete cascade,
  title text not null,
  subject text not null,
  preheader text not null default '',
  body_text text not null,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','failed','cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by_user_id uuid references auth.users(id),
  created_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.workspace_newsletter_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references core.workspace_newsletter_campaigns(id) on delete cascade,
  subscriber_id uuid not null references core.workspace_newsletter_subscribers(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, subscriber_id)
);

alter table core.workspace_newsletter_subscribers enable row level security;
alter table core.workspace_newsletter_campaigns enable row level security;
alter table core.workspace_newsletter_deliveries enable row level security;

revoke all on core.workspace_newsletter_subscribers from public, anon, authenticated;
revoke all on core.workspace_newsletter_campaigns from public, anon, authenticated;
revoke all on core.workspace_newsletter_deliveries from public, anon, authenticated;
grant all on core.workspace_newsletter_subscribers to service_role;
grant all on core.workspace_newsletter_campaigns to service_role;
grant all on core.workspace_newsletter_deliveries to service_role;

create index if not exists workspace_newsletter_subscribers_brand_status_idx
  on core.workspace_newsletter_subscribers(brand_id,status,created_at desc);
create index if not exists workspace_newsletter_campaigns_brand_status_idx
  on core.workspace_newsletter_campaigns(brand_id,status,created_at desc);
create index if not exists workspace_newsletter_deliveries_campaign_status_idx
  on core.workspace_newsletter_deliveries(campaign_id,status);
