-- Nexus Social Communications canonical inbox schema.
-- Backfilled into repository from the production migration history.

create table if not exists public.nexus_social_conversations (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null,
  social_channel_id uuid not null references public.social_channels(id) on delete cascade,
  platform text not null,
  conversation_type text not null check (conversation_type in ('direct_message','comment_thread')),
  external_conversation_id text not null,
  external_post_id text,
  participant_external_id text,
  participant_name text,
  status text not null default 'open' check (status in ('open','draft_ready','awaiting_approval','replied','closed','ignored','blocked')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  ai_summary text,
  ai_intent text,
  ai_sentiment text,
  matched_contact_id uuid,
  matched_lead_id uuid,
  owner_focus_boost numeric not null default 0,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_channel_id, conversation_type, external_conversation_id)
);

create index if not exists idx_nexus_social_conversations_brand_status
  on public.nexus_social_conversations (brand_id, status, updated_at desc);
create index if not exists idx_nexus_social_conversations_channel
  on public.nexus_social_conversations (social_channel_id, last_synced_at desc);

create table if not exists public.nexus_social_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.nexus_social_conversations(id) on delete cascade,
  social_channel_id uuid not null references public.social_channels(id) on delete cascade,
  brand_id text not null,
  platform text not null,
  external_message_id text not null,
  parent_external_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  author_external_id text,
  author_name text,
  body_text text,
  media jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  ai_summary text,
  ai_intent text,
  ai_urgency text,
  ai_sentiment text,
  ai_suggested_action text,
  received_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (social_channel_id, external_message_id)
);

create index if not exists idx_nexus_social_messages_conversation
  on public.nexus_social_messages (conversation_id, coalesce(received_at, sent_at, created_at));

create table if not exists public.nexus_social_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.nexus_social_conversations(id) on delete cascade,
  source_message_id uuid references public.nexus_social_messages(id) on delete set null,
  brand_id text not null,
  platform text not null,
  body_text text not null,
  ai_confidence numeric,
  tone text,
  language text,
  status text not null default 'draft' check (status in ('draft','approved','rejected','sent','superseded')),
  ai_context jsonb not null default '{}'::jsonb,
  edited_by_user boolean not null default false,
  approved_by text,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_nexus_social_reply_drafts_status
  on public.nexus_social_reply_drafts (status, created_at desc);

create table if not exists public.nexus_social_communication_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.nexus_social_conversations(id) on delete cascade,
  message_id uuid references public.nexus_social_messages(id) on delete cascade,
  draft_id uuid references public.nexus_social_reply_drafts(id) on delete cascade,
  brand_id text not null,
  platform text not null,
  event_type text not null,
  outcome text,
  outcome_value_eur numeric,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_nexus_social_comm_events_brand
  on public.nexus_social_communication_events (brand_id, event_type, occurred_at desc);

alter table public.nexus_social_conversations enable row level security;
alter table public.nexus_social_messages enable row level security;
alter table public.nexus_social_reply_drafts enable row level security;
alter table public.nexus_social_communication_events enable row level security;

revoke all on public.nexus_social_conversations from anon, authenticated;
revoke all on public.nexus_social_messages from anon, authenticated;
revoke all on public.nexus_social_reply_drafts from anon, authenticated;
revoke all on public.nexus_social_communication_events from anon, authenticated;
