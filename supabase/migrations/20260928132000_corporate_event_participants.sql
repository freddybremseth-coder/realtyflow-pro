create table if not exists public.corporate_event_participants (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null default 'zeneco' check (brand_id = 'zeneco'),
  event_id text not null,
  event_name text not null,
  email text not null,
  name text not null,
  organization_name text,
  organization_type text,
  contact_role text,
  contact_id uuid,
  status text not null default 'REGISTERED'
    check (status in ('REGISTERED','ATTENDED','CTA_CLICKED','ASSESSMENT_REQUESTED','NO_SHOW','CANCELLED')),
  registered_at timestamptz not null default now(),
  attended_at timestamptz,
  cta_clicked_at timestamptz,
  assessment_requested_at timestamptz,
  source_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists corporate_event_participants_event_email_unique
  on public.corporate_event_participants (event_id, email);

create index if not exists corporate_event_participants_status_idx
  on public.corporate_event_participants (event_id, status, updated_at desc);

comment on table public.corporate_event_participants is
  'Zen Corporate webinar/event engagement ledger. Registration and attendance are engagement evidence only and must not automatically qualify a sales prospect or mutate pipeline state.';

alter table public.corporate_event_participants enable row level security;
revoke all on table public.corporate_event_participants from public, anon, authenticated;
grant select, insert, update, delete on table public.corporate_event_participants to service_role;
