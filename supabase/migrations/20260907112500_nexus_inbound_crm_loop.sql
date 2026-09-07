begin;

alter table public.contacts
  add column if not exists do_not_contact boolean not null default false,
  add column if not exists email_suppressed boolean not null default false,
  add column if not exists unsubscribe_at timestamptz,
  add column if not exists suppression_reason text,
  add column if not exists lost_reason text,
  add column if not exists last_inbound_reply_at timestamptz,
  add column if not exists last_reply_classification text;

alter table public.email_messages
  add column if not exists crm_processed_at timestamptz,
  add column if not exists crm_reply_classification text,
  add column if not exists crm_contact_id uuid references public.contacts(id) on delete set null;

create index if not exists contacts_email_suppression_idx
  on public.contacts (email_suppressed, do_not_contact)
  where email_suppressed = true or do_not_contact = true;

create index if not exists contacts_last_inbound_reply_idx
  on public.contacts (last_inbound_reply_at desc)
  where last_inbound_reply_at is not null;

create index if not exists email_messages_crm_pending_idx
  on public.email_messages (received_at asc)
  where direction = 'inbound' and crm_processed_at is null;

commit;
