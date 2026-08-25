create table if not exists public.property_feedback_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  property_id text not null,
  brand_id text null,
  action text not null check (action in ('interested','not_for_me')),
  source text not null default 'advisor_mail',
  campaign_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_property_feedback_contact_created
  on public.property_feedback_events(contact_id, created_at desc);

create index if not exists idx_property_feedback_property_created
  on public.property_feedback_events(property_id, created_at desc);

create index if not exists idx_property_feedback_action_created
  on public.property_feedback_events(action, created_at desc);

alter table public.property_feedback_events enable row level security;

comment on table public.property_feedback_events is
  'Customer preference signals from Nexus Advisor Mail and future property feedback surfaces. Server-side writes only.';
