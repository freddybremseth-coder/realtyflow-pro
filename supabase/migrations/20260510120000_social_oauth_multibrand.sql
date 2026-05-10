-- ============================================================================
-- 20260510120000_social_oauth_multibrand.sql
--
-- Phase 1 of the multi-brand OAuth refactor.
--
-- Background: today, social tokens live in two places:
--   1) `social_accounts.access_token`  (one row per FB Page / IG account / LI)
--   2) `brand_settings.settings.youtube_refresh_token`  (one token per brand)
--
-- Both are plaintext, neither has a CSRF nonce on the OAuth roundtrip, and the
-- Facebook OAuth callback auto-creates a row for every Page Freddy admins —
-- which is how Zen Eco Homes posts ended up on freddybremseth.com.
--
-- This migration introduces the three tables the new OAuth flow will write to.
-- It is purely additive: legacy `social_accounts` and `brand_settings` rows are
-- left in place so the publish path keeps working until Phase 4 cuts over.
-- A separate one-shot script (`scripts/migrate-oauth-to-channels.mjs`,
-- coming in Phase 8) backfills existing rows into these new tables.
-- ============================================================================

create extension if not exists pgcrypto;

-- ─── social_channels ───────────────────────────────────────────────────────
-- One row per (brand, platform, external account). Tokens are NOT stored here
-- — they live in `oauth_tokens` so that revoking/rotating credentials never
-- requires touching the channel-identity row that the rest of the app joins
-- against.
create table if not exists social_channels (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null,
  platform text not null,
  external_id text not null,
  display_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  connected_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_channels_platform_check check (platform in (
    'youtube',
    'google_drive',
    'gmail',
    'facebook',
    'instagram',
    'linkedin',
    'tiktok',
    'pinterest',
    'twitter'
  )),
  constraint social_channels_brand_platform_external_unique
    unique (brand_id, platform, external_id)
);

create index if not exists idx_social_channels_brand_platform
  on social_channels (brand_id, platform);
create index if not exists idx_social_channels_platform_external
  on social_channels (platform, external_id);
create index if not exists idx_social_channels_active
  on social_channels (is_active) where is_active;

-- updated_at trigger
create or replace function social_channels_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_social_channels_updated_at on social_channels;
create trigger trg_social_channels_updated_at
  before update on social_channels
  for each row execute function social_channels_set_updated_at();

comment on table social_channels is
  'Canonical identity for each connected external account. One row per (brand_id, platform, external_id). Tokens live in oauth_tokens.';
comment on column social_channels.external_id is
  'Provider-side ID: YouTube channel id (UCxxx), FB Page id, IG ig_user_id, LinkedIn URN, etc.';
comment on column social_channels.metadata is
  'Provider-specific fields. FB: {tasks:[]}. IG: {linked_page_id, username}. YT: {handle, subscribers}. LI: {urn_kind}.';

-- ─── oauth_tokens ──────────────────────────────────────────────────────────
-- Encrypted with OAUTH_ENCRYPTION_KEY (32-byte key, AES-256-GCM). The IV and
-- auth tag are stored alongside the ciphertext so the same row can be
-- decrypted standalone. `key_id` lets us rotate the encryption key later
-- without breaking old rows (default 'v1'; reserved for future use).
--
-- One row per social_channel. Re-OAuthing the same channel UPDATEs in place
-- so we never accumulate dead refresh tokens that Google would silently
-- revoke when its 100-token-per-client cap is hit.
create table if not exists oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  social_channel_id uuid not null references social_channels(id) on delete cascade,
  key_id text not null default 'v1',
  access_token_ciphertext bytea not null,
  access_token_iv bytea not null,
  access_token_tag bytea not null,
  refresh_token_ciphertext bytea,
  refresh_token_iv bytea,
  refresh_token_tag bytea,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  token_type text not null default 'Bearer',
  rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oauth_tokens_one_per_channel unique (social_channel_id)
);

create index if not exists idx_oauth_tokens_expires_at
  on oauth_tokens (expires_at) where expires_at is not null;

drop trigger if exists trg_oauth_tokens_updated_at on oauth_tokens;
create trigger trg_oauth_tokens_updated_at
  before update on oauth_tokens
  for each row execute function social_channels_set_updated_at();

comment on table oauth_tokens is
  'Encrypted OAuth credentials, one row per social_channel. AES-256-GCM with key_id-tagged ciphertext for future rotation.';
comment on column oauth_tokens.key_id is
  'Identifier of the encryption key used. Default "v1". Reserved for future key rotation.';
comment on column oauth_tokens.refresh_token_ciphertext is
  'NULL when the provider does not issue refresh tokens (e.g. Facebook Page tokens, which are long-lived but not refreshable).';

-- ─── oauth_states ──────────────────────────────────────────────────────────
-- CSRF + brand routing for the OAuth roundtrip. Every /api/oauth/<provider>
-- request inserts one row, sends `state_nonce` as the OAuth `state` parameter,
-- and the callback consumes it. Expired or already-consumed nonces are
-- rejected. Rows older than the consumed/expiry window can be GC'd by a cron.
create table if not exists oauth_states (
  state_nonce text primary key,
  brand_id text not null,
  platform text not null,
  return_to text not null,
  initiated_by_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  consumed_at timestamptz,
  constraint oauth_states_platform_check check (platform in (
    'youtube',
    'google_drive',
    'gmail',
    'facebook',
    'instagram',
    'linkedin',
    'tiktok',
    'pinterest',
    'twitter'
  ))
);

create index if not exists idx_oauth_states_expires_at on oauth_states (expires_at);
create index if not exists idx_oauth_states_brand_platform on oauth_states (brand_id, platform);

comment on table oauth_states is
  'Short-lived (15 min) CSRF nonces for OAuth flows. Encodes which brand the in-flight authorization is for and where to redirect after completion.';
comment on column oauth_states.metadata is
  'Carrier slot for provider-specific intermediate state (e.g. Meta: {pages_pending_pick: [...]} between callback and page-picker confirm).';

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- Service role bypasses RLS, which is what every server-side caller in this
-- codebase uses. Policies below match the existing pattern (`Allow all`) used
-- by `social_accounts` and `brand_settings` so we don't accidentally lock
-- ourselves out via the anon key.
alter table social_channels enable row level security;
alter table oauth_tokens   enable row level security;
alter table oauth_states   enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Allow all on social_channels') then
    create policy "Allow all on social_channels" on social_channels for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Allow all on oauth_tokens') then
    create policy "Allow all on oauth_tokens" on oauth_tokens for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Allow all on oauth_states') then
    create policy "Allow all on oauth_states" on oauth_states for all using (true) with check (true);
  end if;
end$$;
