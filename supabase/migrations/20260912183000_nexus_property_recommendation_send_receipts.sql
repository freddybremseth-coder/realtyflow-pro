-- Nexus property recommendation send receipts v1.
--
-- Purpose:
-- - allow an approved customer property recommendation to be sent exactly once
-- - retain a durable provider-side-effect receipt
-- - fail closed on ambiguous/in-flight provider outcomes
-- - extend lead_customer_message_drafts with an explicit sent lifecycle state

alter table public.lead_customer_message_drafts
  drop constraint if exists lead_customer_message_drafts_status_check;

alter table public.lead_customer_message_drafts
  add constraint lead_customer_message_drafts_status_check
  check (status in ('draft', 'approved', 'sent', 'cancelled'));

alter table public.lead_customer_message_drafts
  drop constraint if exists lead_customer_message_drafts_lifecycle_check;

alter table public.lead_customer_message_drafts
  add constraint lead_customer_message_drafts_lifecycle_check
  check (
    (status = 'draft' and approved_by is null and approved_at is null and sent_at is null and cancelled_at is null)
    or (status = 'approved' and approved_by is not null and approved_at is not null and sent_at is null and cancelled_at is null)
    or (status = 'sent' and approved_by is not null and approved_at is not null and sent_at is not null and cancelled_at is null)
    or (status = 'cancelled' and sent_at is null and cancelled_at is not null)
  );

create table if not exists public.nexus_property_recommendation_send_receipts (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  message_draft_id uuid not null references public.lead_customer_message_drafts(id) on delete cascade,
  presentation_id uuid not null references public.lead_customer_presentations(id) on delete cascade,
  buyer_profile_id uuid not null references public.buyer_profiles(id) on delete cascade,
  shortlist_id uuid not null references public.lead_property_shortlists(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  recipient text not null,
  payload_hash text not null,
  status text not null default 'sending',
  provider_message_id text,
  last_error text,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nexus_property_recommendation_send_receipts_brand_check
    check (brand in ('zeneco', 'soleada', 'pinosoecolife')),
  constraint nexus_property_recommendation_send_receipts_status_check
    check (status in ('sending', 'sent', 'failed', 'ambiguous')),
  constraint nexus_property_recommendation_send_receipts_payload_hash_check
    check (payload_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  constraint nexus_property_recommendation_send_receipts_recipient_check
    check (length(recipient) between 3 and 320),
  constraint nexus_property_recommendation_send_receipts_error_check
    check (last_error is null or length(last_error) <= 2000),
  constraint nexus_property_recommendation_send_receipts_draft_unique unique (message_draft_id)
);

create index if not exists idx_nexus_property_recommendation_send_receipts_status
  on public.nexus_property_recommendation_send_receipts (status, updated_at desc);
create index if not exists idx_nexus_property_recommendation_send_receipts_contact
  on public.nexus_property_recommendation_send_receipts (contact_id, created_at desc);

alter table public.nexus_property_recommendation_send_receipts enable row level security;
revoke all on public.nexus_property_recommendation_send_receipts from public, anon, authenticated;
grant select, insert, update, delete on public.nexus_property_recommendation_send_receipts to service_role;

comment on table public.nexus_property_recommendation_send_receipts is
  'Durable exactly-once control record for Nexus customer property recommendation sends.';
comment on column public.nexus_property_recommendation_send_receipts.status is
  'sending=claimed before provider call; sent=provider accepted; failed=safe known failure before acceptance; ambiguous=provider outcome cannot safely be retried automatically.';
