-- Source identifiers preserve idempotency when historical messages are discovered
-- through more than one provider surface (Gmail API and IMAP).
create table if not exists public.email_message_source_ids (
  id uuid primary key default gen_random_uuid(),
  email_message_id uuid not null references public.email_messages(id) on delete cascade,
  source text not null,
  external_id text not null,
  external_thread_id text,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists idx_email_message_source_ids_message on public.email_message_source_ids(email_message_id);
alter table public.email_message_source_ids enable row level security;
revoke all on public.email_message_source_ids from anon, authenticated;
