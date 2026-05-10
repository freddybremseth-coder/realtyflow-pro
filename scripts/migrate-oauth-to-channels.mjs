#!/usr/bin/env node
/**
 * One-shot backfill: legacy → new OAuth tables.
 *
 * Reads:
 *   - public.social_accounts  (legacy plaintext token rows)
 *   - public.brand_settings.settings.youtube_refresh_token (legacy YT path)
 *
 * Writes:
 *   - public.social_channels  (one row per brand+platform+external_id)
 *   - public.oauth_tokens     (encrypted with OAUTH_ENCRYPTION_KEY,
 *                              same AES-256-GCM envelope the app uses)
 *
 * Usage:
 *   OAUTH_ENCRYPTION_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *     SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/migrate-oauth-to-channels.mjs [--dry-run] [--brand=<id>] [--platform=<p>]
 *
 * Optional for YouTube channel-id resolution:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (or YOUTUBE_*)
 *
 * Flags:
 *   --dry-run   Print what would be written; do not touch the database.
 *   --brand=X   Only migrate rows for this canonical brand id.
 *   --platform=fb  Only migrate one platform.
 *   --force-skip-youtube  Skip the brand_settings YouTube backfill.
 *
 * Safety:
 *   - Idempotent. Re-running upserts on (brand_id, platform, external_id),
 *     so it's safe to run as many times as you want. The unique constraint
 *     guarantees no duplicates.
 *   - Read-only on legacy rows. social_accounts is never modified or
 *     deleted; the publisher's LEGACY_FALLBACK keeps reading it until you
 *     manually decommission those rows after verifying.
 *   - Tokens that are obviously empty / malformed are logged and skipped,
 *     not blindly upserted.
 *
 * What it does NOT do:
 *   - Validate that legacy tokens still work. That's the Settings UI's
 *     "Test" button. A token that was already broken before the migration
 *     stays broken — the script just moves it into the new schema. The
 *     user re-OAuths from Settings to fix.
 *   - Decommission legacy rows. Manual step after you're sure publish is
 *     hitting oauth_tokens (verify via the `source` field returned in
 *     /api/publish responses).
 */

import { createClient } from '@supabase/supabase-js';
import { createCipheriv, randomBytes } from 'node:crypto';

// ─── Args ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_YOUTUBE = args.includes('--force-skip-youtube');
const ONLY_BRAND = args.find((a) => a.startsWith('--brand='))?.split('=')[1] || null;
const ONLY_PLATFORM = args.find((a) => a.startsWith('--platform='))?.split('=')[1] || null;

// ─── Env / supabase / crypto setup ──────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENC_KEY_RAW = process.env.OAUTH_ENCRYPTION_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}
if (!ENC_KEY_RAW) {
  console.error(
    '❌ OAUTH_ENCRYPTION_KEY is required. Generate with: openssl rand -hex 32',
  );
  process.exit(1);
}

// Same key parsing rule as src/lib/oauth/crypto.ts: hex (64 chars) or base64,
// must decode to 32 bytes. Reject anything else loudly so we don't silently
// produce ciphertext with the wrong key.
let ENC_KEY;
{
  const raw = ENC_KEY_RAW.trim();
  ENC_KEY = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');
  if (ENC_KEY.length !== 32) {
    console.error(`❌ OAUTH_ENCRYPTION_KEY must decode to 32 bytes (got ${ENC_KEY.length}).`);
    process.exit(1);
  }
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Crypto envelope (matches src/lib/oauth/crypto.ts) ──────────────────────
//
// AES-256-GCM, 12-byte IV, 16-byte tag. Returns the same bytea-friendly
// hex format the channels module produces ('\\x' + hex). We can't import the
// TS module from a .mjs script without a build step, so the algorithm is
// duplicated here — keep them in sync.

function encrypt(plaintext) {
  if (!plaintext) throw new Error('Refusing to encrypt empty token.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext_hex: '\\x' + ciphertext.toString('hex'),
    iv_hex: '\\x' + iv.toString('hex'),
    tag_hex: '\\x' + tag.toString('hex'),
  };
}

// ─── Brand id normalization ─────────────────────────────────────────────────
//
// Legacy `social_accounts.brand` and `brand_settings.brand_id` use a mix of
// dashed slugs ("zen-eco") and the canonical IDs from src/lib/constants.ts
// ("zeneco"). The new social_channels table uses ONLY canonical IDs, so we
// normalise here. Anything not in the table gets logged + skipped — better
// than guessing.
const CANONICAL_BRANDS = new Set([
  'zeneco',
  'soleada',
  'chatgenius',
  'donaanna',
  'freddypublishing',
  'freddyb',
  'pinosoecolife',
  'neuralbeat',
]);

const BRAND_ALIASES = {
  // dash variants of canonical
  'zen-eco': 'zeneco',
  'dona-anna': 'donaanna',
  'pinoso-ecolife': 'pinosoecolife',
  'freddy-bremseth': 'freddyb',
  'neural-beat': 'neuralbeat',
  'freddy-publishing': 'freddypublishing',
  // semantic aliases observed in the codebase
  remasterfreddy: 'neuralbeat',
  'remaster-freddy': 'neuralbeat',
};

function canonicalBrand(legacy) {
  if (!legacy) return null;
  const t = legacy.trim();
  if (CANONICAL_BRANDS.has(t)) return t;
  const aliased = BRAND_ALIASES[t.toLowerCase()];
  if (aliased) return aliased;
  // Last attempt: strip dashes and try again.
  const stripped = t.toLowerCase().replace(/[-_.\s]/g, '');
  if (CANONICAL_BRANDS.has(stripped)) return stripped;
  return null;
}

// ─── Stats ──────────────────────────────────────────────────────────────────

const stats = {
  social_accounts_total: 0,
  social_accounts_skipped: 0,
  channels_upserted: 0,
  tokens_upserted: 0,
  brand_settings_total: 0,
  brand_settings_skipped: 0,
  errors: [],
  // Tracks (platform, external_id) → set of brands. Surfaces the cross-brand
  // contamination Freddy was experiencing: the same FB Page mapped to
  // multiple brands in the legacy table. Both bindings get migrated (we
  // don't know which one is "correct"), but we flag them so they can be
  // disconnected via Settings post-migration.
  externalIdBrands: new Map(),
};

function trackBinding(platform, externalId, brand) {
  const key = `${platform}|${externalId}`;
  const set = stats.externalIdBrands.get(key) ?? new Set();
  set.add(brand);
  stats.externalIdBrands.set(key, set);
}

function note(msg) {
  console.log(`  ${msg}`);
}
function warn(msg) {
  console.warn(`  ⚠ ${msg}`);
}
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  stats.errors.push(msg);
}

// ─── Step 1: social_accounts → social_channels + oauth_tokens ──────────────

async function migrateSocialAccounts() {
  console.log(`\n📦 Step 1 — social_accounts → social_channels + oauth_tokens`);
  // The legacy table only has a `brand` column. The `brand_id` column we
  // sometimes look at in the publisher is a later addition that may or may
  // not exist depending on how the project was set up; probing for both
  // would fail the SELECT here. So we pick `brand` only and trust
  // canonicalBrand() to handle the various spellings.
  const { data, error } = await supabase
    .from('social_accounts')
    .select('id, platform, account_id, account_name, access_token, brand, is_active')
    .eq('is_active', true);
  if (error) {
    fail(`Failed to query social_accounts: ${error.message}`);
    return;
  }
  stats.social_accounts_total = data?.length || 0;
  if (!data || data.length === 0) {
    note('Nothing in social_accounts to migrate.');
    return;
  }

  for (const row of data) {
    if (ONLY_PLATFORM && row.platform !== ONLY_PLATFORM) {
      stats.social_accounts_skipped++;
      continue;
    }

    const legacyBrand = row.brand;
    const brand = canonicalBrand(legacyBrand);
    if (!brand) {
      warn(
        `social_accounts ${row.id} (${row.platform}/${row.account_name}): unknown brand "${legacyBrand}" — skipped`,
      );
      stats.social_accounts_skipped++;
      continue;
    }
    if (ONLY_BRAND && brand !== ONLY_BRAND) {
      stats.social_accounts_skipped++;
      continue;
    }

    if (!row.access_token || row.access_token.trim().length < 10) {
      warn(`social_accounts ${row.id}: empty / suspiciously short token — skipped`);
      stats.social_accounts_skipped++;
      continue;
    }
    if (!row.account_id) {
      warn(
        `social_accounts ${row.id} (${row.platform}/${row.account_name}): missing account_id — skipped`,
      );
      stats.social_accounts_skipped++;
      continue;
    }

    const platform = row.platform; // already 'facebook'|'instagram'|'linkedin'|'youtube' etc.

    trackBinding(platform, row.account_id, brand);

    if (DRY_RUN) {
      note(`[DRY] would upsert ${platform} channel for ${brand}: ${row.account_name} (${row.account_id})`);
      stats.channels_upserted++;
      stats.tokens_upserted++;
      continue;
    }

    // Upsert the channel row.
    const { data: channelData, error: chErr } = await supabase
      .from('social_channels')
      .upsert(
        {
          brand_id: brand,
          platform,
          external_id: row.account_id,
          display_name: row.account_name || `${platform}-${row.account_id.slice(0, 6)}`,
          metadata: { migrated_from_social_accounts: row.id },
          is_active: true,
        },
        { onConflict: 'brand_id,platform,external_id' },
      )
      .select('id')
      .single();

    if (chErr || !channelData) {
      fail(`upsert social_channels for ${brand}/${platform}/${row.account_id}: ${chErr?.message || 'no row'}`);
      continue;
    }
    stats.channels_upserted++;

    // Encrypt + upsert tokens. Legacy rows never had refresh tokens — they
    // stored the long-lived FB Page token (or LinkedIn access token) in
    // access_token. So refresh is NULL.
    const env = encrypt(row.access_token);
    const { error: tokErr } = await supabase.from('oauth_tokens').upsert(
      {
        social_channel_id: channelData.id,
        key_id: 'v1',
        access_token_ciphertext: env.ciphertext_hex,
        access_token_iv: env.iv_hex,
        access_token_tag: env.tag_hex,
        refresh_token_ciphertext: null,
        refresh_token_iv: null,
        refresh_token_tag: null,
        expires_at: null,
        scopes: [],
        token_type: 'Bearer',
        rotated_at: new Date().toISOString(),
      },
      { onConflict: 'social_channel_id' },
    );

    if (tokErr) {
      fail(`upsert oauth_tokens for channel ${channelData.id}: ${tokErr.message}`);
      continue;
    }
    stats.tokens_upserted++;
    note(`✓ ${brand} / ${platform} / ${row.account_name} (${row.account_id})`);
  }
}

// ─── Step 2: brand_settings.youtube_refresh_token → YouTube channels ────────

async function migrateBrandSettingsYoutube() {
  console.log(
    `\n📺 Step 2 — brand_settings.youtube_refresh_token → social_channels(youtube) + oauth_tokens`,
  );
  if (SKIP_YOUTUBE) {
    note('Skipped (--force-skip-youtube).');
    return;
  }
  const { data, error } = await supabase.from('brand_settings').select('brand_id, settings');
  if (error) {
    fail(`Failed to query brand_settings: ${error.message}`);
    return;
  }
  if (!data || data.length === 0) {
    note('Nothing in brand_settings to migrate.');
    return;
  }

  for (const row of data) {
    const refresh = row.settings?.youtube_refresh_token;
    if (!refresh || typeof refresh !== 'string' || refresh.length < 20) continue;

    stats.brand_settings_total++;

    // _system / system are the global fallback, not real brands. Skip —
    // once every brand has its own row, these become dead weight.
    if (row.brand_id === '_system' || row.brand_id === 'system') {
      warn(`brand_settings ${row.brand_id}: skipping system-global token (no brand owner).`);
      stats.brand_settings_skipped++;
      continue;
    }

    const brand = canonicalBrand(row.brand_id);
    if (!brand) {
      warn(`brand_settings: unknown brand "${row.brand_id}" — skipped`);
      stats.brand_settings_skipped++;
      continue;
    }
    if (ONLY_BRAND && brand !== ONLY_BRAND) {
      stats.brand_settings_skipped++;
      continue;
    }
    if (ONLY_PLATFORM && ONLY_PLATFORM !== 'youtube') {
      stats.brand_settings_skipped++;
      continue;
    }

    // Resolve the YouTube channel id by exchanging the refresh token for an
    // access token, then calling channels.list({mine:true}). This lets us
    // store a real `external_id` so the unique constraint behaves correctly
    // when the same brand is connected to multiple channels later.
    const channelInfo = await resolveYouTubeChannelInfo(refresh);
    if (!channelInfo) {
      warn(
        `brand_settings ${row.brand_id}: refresh token did not yield a valid YT channel (revoked / wrong scopes?) — skipped`,
      );
      stats.brand_settings_skipped++;
      continue;
    }

    if (DRY_RUN) {
      note(
        `[DRY] would upsert youtube channel for ${brand}: ${channelInfo.title} (${channelInfo.id})`,
      );
      stats.channels_upserted++;
      stats.tokens_upserted++;
      continue;
    }

    const { data: channelData, error: chErr } = await supabase
      .from('social_channels')
      .upsert(
        {
          brand_id: brand,
          platform: 'youtube',
          external_id: channelInfo.id,
          display_name: channelInfo.title,
          metadata: {
            migrated_from_brand_settings: row.brand_id,
            handle: channelInfo.customUrl,
          },
          is_active: true,
        },
        { onConflict: 'brand_id,platform,external_id' },
      )
      .select('id')
      .single();

    if (chErr || !channelData) {
      fail(`upsert YT channel for ${brand}: ${chErr?.message || 'no row'}`);
      continue;
    }
    stats.channels_upserted++;

    // YouTube tokens DO have a refresh token. The access_token from the
    // refresh exchange is short-lived (~1 hour); we store it but the
    // app's youtube-client will refresh it on next use.
    const refreshEnv = encrypt(refresh);
    const accessEnv = encrypt(channelInfo.access_token);
    const { error: tokErr } = await supabase.from('oauth_tokens').upsert(
      {
        social_channel_id: channelData.id,
        key_id: 'v1',
        access_token_ciphertext: accessEnv.ciphertext_hex,
        access_token_iv: accessEnv.iv_hex,
        access_token_tag: accessEnv.tag_hex,
        refresh_token_ciphertext: refreshEnv.ciphertext_hex,
        refresh_token_iv: refreshEnv.iv_hex,
        refresh_token_tag: refreshEnv.tag_hex,
        expires_at: channelInfo.expires_at,
        scopes: [
          'https://www.googleapis.com/auth/youtube',
          'https://www.googleapis.com/auth/youtube.upload',
          'https://www.googleapis.com/auth/youtube.readonly',
          'https://www.googleapis.com/auth/youtube.force-ssl',
        ],
        token_type: 'Bearer',
        rotated_at: new Date().toISOString(),
      },
      { onConflict: 'social_channel_id' },
    );
    if (tokErr) {
      fail(`upsert oauth_tokens for YT channel ${channelData.id}: ${tokErr.message}`);
      continue;
    }
    stats.tokens_upserted++;
    note(`✓ ${brand} / youtube / ${channelInfo.title} (${channelInfo.id})`);
  }
}

async function resolveYouTubeChannelInfo(refreshToken) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    // Without client credentials we can't redeem the refresh token. We
    // still want the migration to proceed for the other steps, but we
    // can't create a useful YT channel row without a real external_id.
    return null;
  }
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return null;
    }
    const access = tokenData.access_token;
    const expires_at = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    const chRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${access}` } },
    );
    const chData = await chRes.json();
    const item = chData.items?.[0];
    if (!item || !item.id) return null;
    return {
      id: item.id,
      title: item.snippet?.title || `Channel ${item.id}`,
      customUrl: item.snippet?.customUrl,
      access_token: access,
      expires_at,
    };
  } catch {
    return null;
  }
}

// ─── Run ────────────────────────────────────────────────────────────────────

(async () => {
  console.log('═══════════════════════════════════════════════');
  console.log('  OAuth backfill: legacy → social_channels');
  console.log('═══════════════════════════════════════════════');
  console.log(`  mode:     ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'WRITE'}`);
  if (ONLY_BRAND) console.log(`  --brand=${ONLY_BRAND}`);
  if (ONLY_PLATFORM) console.log(`  --platform=${ONLY_PLATFORM}`);
  if (SKIP_YOUTUBE) console.log(`  --force-skip-youtube`);
  console.log('═══════════════════════════════════════════════');

  await migrateSocialAccounts();
  await migrateBrandSettingsYoutube();

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  Summary`);
  console.log(`═══════════════════════════════════════════════`);
  console.log(`  social_accounts read:    ${stats.social_accounts_total}`);
  console.log(`  social_accounts skipped: ${stats.social_accounts_skipped}`);
  console.log(`  brand_settings(yt) read: ${stats.brand_settings_total}`);
  console.log(`  brand_settings skipped:  ${stats.brand_settings_skipped}`);
  console.log(`  channels upserted:       ${stats.channels_upserted}`);
  console.log(`  tokens upserted:         ${stats.tokens_upserted}`);
  console.log(`  errors:                  ${stats.errors.length}`);
  if (stats.errors.length) {
    for (const e of stats.errors) console.log(`    - ${e}`);
  }

  // Cross-brand contamination report. If the same external account (FB Page,
  // IG account, etc.) was bound to more than one brand in the legacy table,
  // both bindings get migrated and the user needs to disconnect the wrong
  // one(s) via Settings → Sosiale medier. This is the actionable signal
  // that explains the bug Freddy reported.
  const collisions = [...stats.externalIdBrands.entries()].filter(
    ([, brands]) => brands.size > 1,
  );
  if (collisions.length) {
    console.log(`\n  ⚠ Cross-brand bindings detected (same account on >1 brand):`);
    for (const [key, brands] of collisions) {
      console.log(`    ${key}  →  ${[...brands].join(', ')}`);
    }
    console.log(
      `\n    These were migrated as separate rows (one per brand). Decide which`,
    );
    console.log(
      `    brand should actually own each account, then go to Settings →`,
    );
    console.log(
      `    Sosiale medier and click "Deaktiver" on the wrong-brand row(s).`,
    );
  }

  if (DRY_RUN) {
    console.log(`\n  This was a dry run. Re-run without --dry-run to apply.`);
  }
  process.exit(stats.errors.length ? 1 : 0);
})();
