-- Nexus property-level recommendation feedback v1.
-- Append-only observations derived from customer replies to previously sent,
-- explicitly approved property recommendation presentations.

create table if not exists public.nexus_property_feedback_events (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  email_message_id uuid not null references public.email_messages(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  send_receipt_id uuid not null references public.nexus_property_recommendation_send_receipts(id) on delete cascade,
  presentation_id uuid not null references public.lead_customer_presentations(id) on delete cascade,
  buyer_profile_id uuid not null references public.buyer_profiles(id) on delete cascade,
  property_key text not null,
  property_id text,
  property_reference text,
  property_ordinal integer not null,
  sentiment text not null,
  confidence numeric(5,4) not null,
  signals jsonb not null default '[]'::jsonb,
  source_text text not null,
  buyer_profile_suggestions jsonb not null default '[]'::jsonb,
  requires_human_review boolean not null default false,
  created_at timestamptz not null default now(),
  constraint nexus_property_feedback_events_brand_check check (brand in ('zeneco','soleada','pinosoecolife')),
  constraint nexus_property_feedback_events_sentiment_check check (sentiment in ('positive','negative','question','viewing','neutral')),
  constraint nexus_property_feedback_events_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint nexus_property_feedback_events_ordinal_check check (property_ordinal > 0),
  constraint nexus_property_feedback_events_property_key_check check (length(property_key) between 1 and 256),
  constraint nexus_property_feedback_events_source_text_check check (length(source_text) between 1 and 1600),
  constraint nexus_property_feedback_events_unique unique (email_message_id, property_key)
);

create index if not exists idx_nexus_property_feedback_contact_created
  on public.nexus_property_feedback_events (contact_id, created_at desc);
create index if not exists idx_nexus_property_feedback_presentation
  on public.nexus_property_feedback_events (presentation_id, created_at desc);
create index if not exists idx_nexus_property_feedback_sentiment
  on public.nexus_property_feedback_events (sentiment, created_at desc);

alter table public.nexus_property_feedback_events enable row level security;
revoke all on public.nexus_property_feedback_events from public, anon, authenticated;
grant select, insert on public.nexus_property_feedback_events to service_role;

comment on table public.nexus_property_feedback_events is
  'Append-only property-level customer feedback extracted from replies to approved Nexus property recommendation sends.';
