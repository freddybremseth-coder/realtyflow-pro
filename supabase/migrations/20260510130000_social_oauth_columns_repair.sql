-- ============================================================================
-- 20260510130000_social_oauth_columns_repair.sql
--
-- Defensive repair for `20260510120000_social_oauth_multibrand.sql`.
--
-- The original migration uses `CREATE TABLE IF NOT EXISTS`. If a previous
-- partial run (or a hand-rolled `CREATE TABLE` from the Supabase SQL
-- editor) had already created `oauth_tokens` / `social_channels` /
-- `oauth_states` with a subset of the expected columns, the
-- `CREATE TABLE IF NOT EXISTS` no-ops and the missing columns stay missing.
-- Symptom: app code throws  "ERROR: 42703: column \"key_id\" of relation
-- \"oauth_tokens\" does not exist" the moment it tries to insert.
--
-- This migration walks every expected column with ADD COLUMN IF NOT EXISTS
-- so the schema converges to the intended shape regardless of which subset
-- happened to make it in. Re-running this migration is safe (every
-- statement is idempotent).
--
-- It also (re)installs the indexes, the `Allow all` RLS policies, the
-- updated_at trigger, and the unique constraints — all wrapped in the same
-- IF NOT EXISTS / DO-block guards so a fully-applied environment is a no-op.
-- ============================================================================

-- pgcrypto is also required by the original migration; harmless to ensure.
create extension if not exists pgcrypto;

-- ─── social_channels ────────────────────────────────────────────────────────
alter table if exists social_channels
  add column if not exists id uuid primary key default gen_random_uuid();
alter table if exists social_channels
  add column if not exists brand_id text;
alter table if exists social_channels
  add column if not exists platform text;
alter table if exists social_channels
  add column if not exists external_id text;
alter table if exists social_channels
  add column if not exists display_name text;
alter table if exists social_channels
  add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists social_channels
  add column if not exists is_active boolean not null default true;
alter table if exists social_channels
  add column if not exists connected_by_user_id uuid;
alter table if exists social_channels
  add column if not exists created_at timestamptz not null default now();
alter table if exists social_channels
  add column if not exists updated_at timestamptz not null default now();

-- The CHECK constraint can't use IF NOT EXISTS, so we look it up first.
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'social_channels')
     and not exists (
       select 1 from information_schema.table_constraints
       where table_name = 'social_channels' and constraint_name = 'social_channels_platform_check'
     ) then
    alter table social_channels
      add constraint social_channels_platform_check check (platform in (
        'youtube', 'google_drive', 'gmail',
        'facebook', 'instagram', 'linkedin',
        'tiktok', 'pinterest', 'twitter'
      ));
  end if;

  if exists (select 1 from information_schema.tables where table_name = 'social_channels')
     and not exists (
       select 1 from information_schema.table_constraints
       where table_name = 'social_channels' and constraint_name = 'social_channels_brand_platform_external_unique'
     ) then
    alter table social_channels
      add constraint social_channels_brand_platform_external_unique
        unique (brand_id, platform, external_id);
  end if;
end$$;

create index if not exists idx_social_channels_brand_platform
  on social_channels (brand_id, platform);
create index if not exists idx_social_channels_platform_external
  on social_channels (platform, external_id);
create index if not exists idx_social_channels_active
  on social_channels (is_active) where is_active;

-- ─── oauth_tokens ───────────────────────────────────────────────────────────
-- This is the table that triggered the original error report. The required
-- column set must include `key_id` and the encrypted-token bytea trio.
alter table if exists oauth_tokens
  add column if not exists id uuid primary key default gen_random_uuid();
alter table if exists oauth_tokens
  add column if not exists social_channel_id uuid;
alter table if exists oauth_tokens
  add column if not exists key_id text not null default 'v1';
alter table if exists oauth_tokens
  add column if not exists access_token_ciphertext bytea;
alter table if exists oauth_tokens
  add column if not exists access_token_iv bytea;
alter table if exists oauth_tokens
  add column if not exists access_token_tag bytea;
alter table if exists oauth_tokens
  add column if not exists refresh_token_ciphertext bytea;
alter table if exists oauth_tokens
  add column if not exists refresh_token_iv bytea;
alter table if exists oauth_tokens
  add column if not exists refresh_token_tag bytea;
alter table if exists oauth_tokens
  add column if not exists expires_at timestamptz;
alter table if exists oauth_tokens
  add column if not exists scopes text[] not null default '{}';
alter table if exists oauth_tokens
  add column if not exists token_type text not null default 'Bearer';
alter table if exists oauth_tokens
  add column if not exists rotated_at timestamptz not null default now();
alter table if exists oauth_tokens
  add column if not exists created_at timestamptz not null default now();
alter table if exists oauth_tokens
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  -- FK to social_channels (cascade so tokens go away with their channel).
  if exists (select 1 from information_schema.tables where table_name = 'oauth_tokens')
     and not exists (
       select 1 from information_schema.table_constraints
       where table_name = 'oauth_tokens' and constraint_name = 'oauth_tokens_social_channel_id_fkey'
     ) then
    alter table oauth_tokens
      add constraint oauth_tokens_social_channel_id_fkey
        foreign key (social_channel_id) references social_channels(id) on delete cascade;
  end if;

  -- One token row per channel.
  if exists (select 1 from information_schema.tables where table_name = 'oauth_tokens')
     and not exists (
       select 1 from information_schema.table_constraints
       where table_name = 'oauth_tokens' and constraint_name = 'oauth_tokens_one_per_channel'
     ) then
    alter table oauth_tokens
      add constraint oauth_tokens_one_per_channel unique (social_channel_id);
  end if;
end$$;

create index if not exists idx_oauth_tokens_expires_at
  on oauth_tokens (expires_at) where expires_at is not null;

-- ─── oauth_states ───────────────────────────────────────────────────────────
alter table if exists oauth_states
  add column if not exists state_nonce text;
alter table if exists oauth_states
  add column if not exists brand_id text;
alter table if exists oauth_states
  add column if not exists platform text;
alter table if exists oauth_states
  add column if not exists return_to text;
alter table if exists oauth_states
  add column if not exists initiated_by_user_id uuid;
alter table if exists oauth_states
  add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists oauth_states
  add column if not exists created_at timestamptz not null default now();
alter table if exists oauth_states
  add column if not exists expires_at timestamptz not null default (now() + interval '15 minutes');
alter table if exists oauth_states
  add column if not exists consumed_at timestamptz;

do $$
begin
  -- state_nonce is the primary key. Adding PRIMARY KEY after the fact only
  -- works if no duplicates exist; that's a safe assumption for a new table.
  if exists (select 1 from information_schema.tables where table_name = 'oauth_states')
     and not exists (
       select 1 from information_schema.table_constraints
       where table_name = 'oauth_states' and constraint_type = 'PRIMARY KEY'
     ) then
    alter table oauth_states add primary key (state_nonce);
  end if;

  if exists (select 1 from information_schema.tables where table_name = 'oauth_states')
     and not exists (
       select 1 from information_schema.table_constraints
       where table_name = 'oauth_states' and constraint_name = 'oauth_states_platform_check'
     ) then
    alter table oauth_states
      add constraint oauth_states_platform_check check (platform in (
        'youtube', 'google_drive', 'gmail',
        'facebook', 'instagram', 'linkedin',
        'tiktok', 'pinterest', 'twitter'
      ));
  end if;
end$$;

create index if not exists idx_oauth_states_expires_at on oauth_states (expires_at);
create index if not exists idx_oauth_states_brand_platform on oauth_states (brand_id, platform);

-- ─── updated_at trigger ─────────────────────────────────────────────────────
-- The original migration creates the function and attaches it to
-- social_channels + oauth_tokens. Re-issuing CREATE OR REPLACE is safe.
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

drop trigger if exists trg_oauth_tokens_updated_at on oauth_tokens;
create trigger trg_oauth_tokens_updated_at
  before update on oauth_tokens
  for each row execute function social_channels_set_updated_at();

-- ─── RLS + policies ─────────────────────────────────────────────────────────
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
