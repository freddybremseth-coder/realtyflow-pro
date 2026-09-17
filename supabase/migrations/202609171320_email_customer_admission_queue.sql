create table if not exists public.email_admission_queue (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.brand_email_configs(id) on delete cascade,
  brand_id text not null,
  external_message_id text not null,
  external_thread_id text,
  mailbox_role text not null check (mailbox_role in ('inbox','sent')),
  from_address text not null,
  from_name text,
  to_addresses text[] not null default '{}',
  cc_addresses text[],
  subject text,
  body_text text,
  body_html text,
  received_at timestamptz,
  admission_status text not null check (admission_status in ('filtered','review','promoted')),
  admission_reason text not null,
  crm_contact_id uuid references public.contacts(id) on delete set null,
  promoted_email_message_id uuid references public.email_messages(id) on delete set null,
  is_historical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, external_message_id)
);

create index if not exists idx_email_admission_queue_status
  on public.email_admission_queue(admission_status, brand_id, received_at desc);
create index if not exists idx_email_admission_queue_sender
  on public.email_admission_queue(brand_id, lower(from_address));

alter table public.email_admission_queue enable row level security;
revoke all on table public.email_admission_queue from anon, authenticated;
grant all on table public.email_admission_queue to service_role;

alter table public.email_history_backfill_jobs
  add column if not exists total_filtered integer not null default 0;
alter table public.email_history_backfill_jobs
  add column if not exists total_review integer not null default 0;
