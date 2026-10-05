-- Link governed Corporate email conversations to the Corporate account.
-- The column is server-managed and lets a reply inherit account context from
-- Message-ID / In-Reply-To / References without inferring a person's identity.

alter table public.email_messages
  add column if not exists corporate_prospect_id uuid
    references public.corporate_prospects(id) on delete set null;

create index if not exists email_messages_corporate_prospect_received_idx
  on public.email_messages (corporate_prospect_id, received_at desc)
  where corporate_prospect_id is not null;

comment on column public.email_messages.corporate_prospect_id is
  'Explicit Zen Corporate account linkage. Outbound is set from the approved draft target; inbound may inherit only from exact email thread references.';
