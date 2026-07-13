-- ─── OpenArt integration ────────────────────────────────────────────────────
--
-- OpenArt (openart.ai) has no public API with API keys. The only server
-- integration path is their MCP server (https://mcp.openart.ai/mcp), which
-- authenticates with OAuth 2.0 (dynamic client registration + PKCE +
-- refresh tokens). This migration adds:
--
--   1. `openart_connection` — a singleton row holding the dynamically
--      registered OAuth client and the encrypted access/refresh tokens.
--      Tokens are AES-256-GCM envelopes (same scheme as `oauth_tokens`),
--      serialized to JSONB via src/lib/oauth/envelope.ts.
--   2. `oauth_states.platform` check extended with 'openart' so the
--      existing CSRF-state machinery can be reused for the connect flow.
--   3. `ad_campaigns.image_provider` — per-campaign choice between the
--      default Replicate pipeline and OpenArt (opt-in, costs OpenArt
--      credits).

-- 1. Singleton connection row (id is always 1).
create table if not exists openart_connection (
  id integer primary key default 1 check (id = 1),
  oauth_client_id text,
  redirect_uri text,
  access_token_envelope jsonb,
  refresh_token_envelope jsonb,
  token_expires_at timestamptz,
  account_email text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table openart_connection is
  'Singleton OpenArt MCP OAuth connection. Envelopes are AES-256-GCM SerializedEnvelope JSON (see src/lib/oauth/envelope.ts); OAUTH_ENCRYPTION_KEY is required to decrypt.';

alter table openart_connection enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'openart_connection' and policyname = 'Allow all'
  ) then
    create policy "Allow all" on openart_connection for all using (true) with check (true);
  end if;
end $$;

-- 2. Allow 'openart' in oauth_states.platform.
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
     where table_name = 'oauth_states' and constraint_name = 'oauth_states_platform_check'
  ) then
    alter table oauth_states drop constraint oauth_states_platform_check;
  end if;

  alter table oauth_states
    add constraint oauth_states_platform_check check (platform in (
      'youtube',
      'google_drive',
      'gmail',
      'facebook',
      'instagram',
      'linkedin',
      'tiktok',
      'pinterest',
      'twitter',
      'openart'
    ));
end $$;

-- 3. Per-campaign image provider for Ad Campaigns.
alter table ad_campaigns
  add column if not exists image_provider text not null default 'replicate';

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
     where table_name = 'ad_campaigns' and constraint_name = 'ad_campaigns_image_provider_check'
  ) then
    alter table ad_campaigns
      add constraint ad_campaigns_image_provider_check
      check (image_provider in ('replicate', 'openart'));
  end if;
end $$;

comment on column ad_campaigns.image_provider is
  'Which image backend generates the creatives: replicate (default) or openart (opt-in, uses OpenArt credits).';
