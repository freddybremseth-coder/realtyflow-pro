# Social OAuth Setup

This document describes how to configure the Google Cloud Console, Meta
Developer Console, and LinkedIn Developer Portal so that the app's
multi-brand OAuth system (Phase 1–5) can connect Facebook Pages, Instagram
Business accounts, YouTube channels, Google Drive, and LinkedIn profiles
to specific brands.

The system stores one `social_channels` row per (brand, platform, external
account) and one encrypted `oauth_tokens` row per channel. Tokens are never
shared across brands — each brand authorizes independently.

---

## 1. Required environment variables

Set these in `.env.local` for development and on Vercel for production. The
canonical names are:

| Name | What it's for |
| --- | --- |
| `OAUTH_ENCRYPTION_KEY` | 32-byte AES-256-GCM key for `oauth_tokens` ciphertext. Generate with `openssl rand -hex 32`. |
| `NEXT_PUBLIC_APP_URL` | Public origin used to build redirect URIs, e.g. `https://kai.chatgenius.pro`. |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID. Used for YouTube + Drive. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. |
| `META_APP_ID` | Meta (Facebook) app ID. Used for Facebook + Instagram. |
| `META_APP_SECRET` | Meta app secret. |
| `LINKEDIN_CLIENT_ID` | LinkedIn OAuth 2.0 client ID. |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth 2.0 client secret. |
| `SUPABASE_SERVICE_ROLE_KEY` | Required so the OAuth callbacks can write to `oauth_tokens` and `social_channels`. |

Legacy names that the code still accepts as a fallback (planned removal —
prefer the canonical names):

| Legacy name | Replaced by |
| --- | --- |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | `META_APP_ID` / `META_APP_SECRET` |
| `YOUTUBE_REFRESH_TOKEN` | Per-channel `oauth_tokens` row (set via Settings → Sosiale medier). Still consulted as a last-resort fallback. |

> Generate the encryption key once and treat it as a long-lived secret.
> Rotating it currently invalidates every stored token (Phase 1 reserved a
> `key_id` column for future rotation, but rotation logic is not implemented
> yet). Back it up in your password manager alongside `SUPABASE_SERVICE_ROLE_KEY`.

---

## 2. Redirect URIs

Each provider requires the redirect URI to be pre-registered. The app uses
exactly one URI per provider, derived from `NEXT_PUBLIC_APP_URL`:

| Provider | Redirect URI shape |
| --- | --- |
| Google (YouTube + Drive) | `${NEXT_PUBLIC_APP_URL}/api/oauth/google/callback` |
| Meta (Facebook + Instagram) | `${NEXT_PUBLIC_APP_URL}/api/oauth/facebook/callback` |
| LinkedIn | `${NEXT_PUBLIC_APP_URL}/api/oauth/linkedin/callback` |

Register the **production** URI (from `kai.chatgenius.pro` or whichever
domain is live) plus any **preview** URIs you actually use, plus the local
dev URIs:

- `http://localhost:3000/api/oauth/google/callback`
- `http://localhost:3000/api/oauth/facebook/callback`
- `http://localhost:3000/api/oauth/linkedin/callback`

For the developer-only YouTube CLI helper (`scripts/youtube-auth.mjs`) also
register:

- `http://localhost:8976/callback`

These must match the running URL **byte-for-byte**, including the trailing
path. A single trailing slash difference is enough for the providers to
reject the token exchange with `redirect_uri_mismatch`.

---

## 3. Google Cloud Console

### 3.1 Create / pick the project

1. Go to <https://console.cloud.google.com>.
2. Pick the project you want the OAuth client to live in (or create one).
   The same project can host both YouTube and Drive scopes — they share
   one OAuth client.

### 3.2 Enable APIs

`APIs & Services → Library`, enable:

- **YouTube Data API v3** — required to list / upload videos.
- **Google Drive API** — only if you'll use Drive archive features.
- **People API** (often pre-enabled) — used by the userinfo endpoint.

### 3.3 OAuth consent screen

`APIs & Services → OAuth consent screen`:

- User type: **External** (lets accounts outside your Workspace consent).
- App name, support email, logo (optional but reduces user friction).
- **Authorised domains**: the bare host of `NEXT_PUBLIC_APP_URL`, e.g.
  `chatgenius.pro`. Do not include the scheme or path.
- Scopes (click *Add or remove scopes*): add at minimum

  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/userinfo.profile`
  - `https://www.googleapis.com/auth/youtube`
  - `https://www.googleapis.com/auth/youtube.upload`
  - `https://www.googleapis.com/auth/youtube.readonly`
  - `https://www.googleapis.com/auth/youtube.force-ssl`
  - `https://www.googleapis.com/auth/drive.file` *(only if Drive enabled)*

- **Publishing status**: while in *Testing*, only listed test users can
  consent and refresh tokens are limited to **7 days**. Add every Google
  account that will connect a brand under *Test users*. For production,
  submit the app for verification (required for any non-`drive.file` Drive
  scope or any YouTube scope after the user count grows).

### 3.4 Create the OAuth Client ID

`APIs & Services → Credentials → + Create Credentials → OAuth client ID`:

- Application type: **Web application**.
- Authorized JavaScript origins:
  - `https://<your-prod-host>`
  - `http://localhost:3000`
- Authorized redirect URIs (see §2):
  - `https://<your-prod-host>/api/oauth/google/callback`
  - `http://localhost:3000/api/oauth/google/callback`
  - `http://localhost:8976/callback` *(only if you use the CLI helper)*

Copy the **Client ID** and **Client secret** into the env vars from §1.

### 3.5 Per-brand consent

There is no per-brand setup in Google Cloud Console — you have one OAuth
client and the **brand** is decided at consent time by which Google account
the user logs in with. To connect, e.g., the Re-Master Freddy YouTube
channel to brand `neuralbeat`:

1. Go to Settings → Sosiale medier in the app.
2. Pick brand `Re-Master Freddy` (or whichever brand you're connecting).
3. Click **Koble til** under YouTube.
4. On Google's account picker, sign in with the Google account that owns
   the YouTube channel.
5. If that Google account owns multiple YouTube channels, the app's
   `/oauth/select` page will ask you to pick exactly one — that's the
   structural fix. If it owns only one, the channel is bound automatically.

If the user accidentally connects the wrong account, click **Deaktiver**
on the channel row and re-run the connect flow with a different Google
account.

---

## 4. Meta (Facebook + Instagram) Developer Console

### 4.1 Create / pick the app

1. Go to <https://developers.facebook.com/apps>.
2. **Create App** → use case **"Other"** → app type **"Business"**. The
   *Business* type is what unlocks Pages and Instagram Graph API.
3. Link it to a Meta Business Account (creates one if you don't have one).

### 4.2 Add products

In the app's left nav, **Add products**:

- **Facebook Login for Business** — enables the OAuth flow.
- **Instagram Graph API** *(automatic when Facebook Login is added on a
  Business app)* — enables IG posting via linked Pages.

### 4.3 Configure Facebook Login for Business

Under **Facebook Login for Business → Settings**:

- **Valid OAuth Redirect URIs**: add (see §2)
  - `https://<your-prod-host>/api/oauth/facebook/callback`
  - `http://localhost:3000/api/oauth/facebook/callback`
- **Client OAuth Login**: ON.
- **Web OAuth Login**: ON.
- **Strict Mode for redirect URIs**: ON. (Meta will refuse anything not in
  the list above; this is the desired behavior.)
- Leave embedded browser / login.unity.com off.

### 4.4 Permissions and Features

The app requests these scopes at consent time. They are auto-approved
without app review for **Business-typed apps publishing to Pages owned by
the user's Business**:

- `pages_show_list` — list the user's Pages.
- `pages_read_engagement` — read Page metadata + IG link lookup.
- `pages_manage_posts` — post to a Page.
- `pages_read_user_content` — read Page comments etc.
- `business_management` — required for some Business-Suite Pages.
- `instagram_basic` — read IG Business profile info.
- `instagram_content_publish` — post to IG Business.

If your prod app is not yet through App Review, the connect flow only
works for **users listed under Roles → Roles** with the *Tester*,
*Developer*, or *Admin* role. Add Freddy's Facebook account there for
each brand that needs to connect.

### 4.5 App Review (when scaling beyond test users)

Submit for App Review when the connecting users won't all be added as
Roles. Meta will require a screencast showing the connect flow plus a
short justification per scope. The justifications you'll need:

- `pages_manage_posts` / `pages_read_engagement` — "post AI-generated
  content to the user's Facebook Page on their behalf via the connected
  brand."
- `instagram_basic` / `instagram_content_publish` — "post the same content
  to the Page's linked Instagram Business account."

### 4.6 Per-brand consent

Each brand binds **one Facebook Page** at a time. To connect:

1. Settings → Sosiale medier → pick the brand (e.g. **Zen Eco Homes**).
2. Click **Koble til** under Facebook.
3. Log in with the Facebook user who admins the target Page. **Important:**
   on the consent screen, click **Continue** (not "Edit access") and grant
   ALL requested permissions. Unchecking any breaks publishing.
4. If the Facebook user admins more than one Page, the app's
   `/oauth/select` page lists them and asks you to pick exactly one. The
   linked Instagram Business account, if any, is connected automatically
   for that Page.
5. To bind a different Page later (e.g. the same user manages both
   `Zen Eco Homes` and `Soleada` Facebook Pages and wants the Soleada
   Page on the `soleada` brand): repeat from step 1 with brand `Soleada`,
   pick the Soleada Page in the picker. Both brands now have their own
   page binding and tokens.

### 4.6.1 CRITICAL: choose "all Pages" on Meta's consent screen

Meta's *Facebook Login for Business* consent flow shows two radio options:

- **«Velg alle gjeldende og fremtidige Sider»** (Choose all current and future Pages)
- **«Velg bare gjeldende Sider»** (Choose only the Pages I select)

You **must** always pick the first option. The second one *replaces* the
app's previously-granted Page access — any Page not ticked in this round
loses app access, and any brand previously bound to one of those Pages
will fail at publish with:

> Facebook-token er ugyldig eller utløpt (Any of the
> pages_read_engagement, pages_manage_metadata, pages_read_user_content,
> pages_manage_ads, pages_show_list or pages_messaging permission(s)
> must be granted before impersonating a user's page.)

Picking "all Pages" on the consent screen does NOT auto-bind every Page
to the current brand — our app's `/oauth/select` picker still asks you to
choose exactly one Page per brand. The broad consent is purely about
keeping Meta-level app access alive across re-OAuths; brand-level
bindings stay narrow.

If you accidentally orphan a brand by picking "bare gjeldende Sider", the
Settings UI shows an amber warning listing which channels lost access.
Re-connect each one, this time choosing "Velg alle …". The orphan
detection runs on every successful FB OAuth so you'll know immediately.

### 4.6.2 Picking the wrong Page in our picker

If a Page has no `CREATE_CONTENT` task or fails the per-Page scope check,
it's surfaced under "Hoppet over" in the picker with the reason. Common
causes:

- The user is *Editor* on the Page in Business Suite but not *Manager*.
- The user manually unchecked a scope on the Meta consent screen.
- The Page is owned by a Business that hasn't approved this app.

Re-running the connect flow after fixing the role / scope clears it.

---

## 5. LinkedIn Developer Portal

### 5.1 Create the app

1. Go to <https://www.linkedin.com/developers/apps>.
2. **Create app**.
3. Associate it with a LinkedIn Page that represents your business. (This
   does not give the app Page-posting access — that requires Marketing
   Developer Platform — but LinkedIn requires every app to be linked to a
   Page.)
4. Verify the link with a code; LinkedIn DM's the Page admin.

### 5.2 Configure Auth

Under the app's **Auth** tab:

- **Authorized redirect URLs for your app**: add (see §2)
  - `https://<your-prod-host>/api/oauth/linkedin/callback`
  - `http://localhost:3000/api/oauth/linkedin/callback`
- **OAuth 2.0 scopes**: ensure these are listed under "OAuth 2.0 scopes
  available to your app":
  - `openid`
  - `profile`
  - `email`
  - `w_member_social` *(post on the authenticated member's behalf)*

If `w_member_social` is missing, request access via **Products → Share on
LinkedIn → Request access**. It's typically auto-approved within minutes
for a personal-feed app.

### 5.3 Per-brand consent

LinkedIn member auth is one-to-one — the auth subject's profile becomes
the channel. If multiple brands need posting on the same person's feed
(e.g. Freddy posts about both Zen Eco Homes and ChatGenius from his own
profile), connect each brand independently from Settings; the same
LinkedIn URN will end up bound to multiple brands as separate
`social_channels` rows with separate token rows.

LinkedIn Company Page posting (`w_organization_social`) is **not**
implemented — this would need the Marketing Developer Platform tier and a
picker flow analogous to Meta's Page picker.

---

## 6. Local development checklist

- [ ] `.env.local` has `OAUTH_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL=http://localhost:3000`, all six provider creds, and Supabase keys.
- [ ] Migration `20260510120000_social_oauth_multibrand.sql` has been applied (creates `social_channels`, `oauth_tokens`, `oauth_states`).
- [ ] All three providers list `http://localhost:3000/api/oauth/<provider>/callback` as an authorized redirect URI.
- [ ] Your test Google / Facebook / LinkedIn accounts are added under each app's test users / Roles.
- [ ] Run `OAUTH_ENCRYPTION_KEY=$(openssl rand -hex 32) node scripts/test-oauth-crypto.mjs` once — it asserts the GCM round-trip works on your Node version.
- [ ] Visit `/settings?tab=sosiale-medier`, pick a brand, click **Koble til** under each provider end-to-end.

---

## 7. Production rollout checklist

- [ ] Generate one production `OAUTH_ENCRYPTION_KEY` and store in 1Password / Vault. **Do not** reuse the dev key.
- [ ] `vercel env add OAUTH_ENCRYPTION_KEY production` (and `preview` if you OAuth from preview deploys).
- [ ] Set the canonical `GOOGLE_*`, `META_*`, `LINKEDIN_*` env vars on Vercel.
- [ ] Add prod redirect URIs to all three provider consoles.
- [ ] Submit Meta app for review if you'll go beyond Roles-listed users.
- [ ] Walk through Settings → Sosiale medier on prod for each brand:
  - Pick brand.
  - Connect Facebook (verify picker fires when user admins multiple Pages).
  - Connect YouTube (verify picker fires when Google account has multiple channels).
  - Connect LinkedIn.
  - Click **Test** on each connected row; verify all green.
- [ ] Run a smoke publish to a draft for each brand-connected platform.
- [ ] After 24 hours of dual-write, run the backfill script
      `scripts/migrate-oauth-to-channels.mjs` once (see §9). Verify the
      legacy `social_accounts` rows have matching `social_channels` rows
      and that the cross-brand collision report is clean.
- [ ] Once every brand has been re-OAuthed and verified, deprecate the
      legacy `YOUTUBE_REFRESH_TOKEN` env var on Vercel.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `redirect_uri_mismatch` from Google or Meta | Provider's redirect URI list doesn't match `${NEXT_PUBLIC_APP_URL}/api/oauth/<provider>/callback` exactly | Compare byte-for-byte. Trailing slash counts. |
| `OAUTH_ENCRYPTION_KEY is not set` on the callback | Env var missing on the deployment | Add it to Vercel → redeploy. New tokens cannot be persisted without it. |
| Picker page redirects with `state_invalid_or_expired` | State row >15 min old, or browser back-button replayed a callback | Re-run **Koble til** from Settings. State rows are single-use. |
| `Mangler Facebook-tillatelser: ...` after Meta consent | User clicked "Edit access" and unchecked a scope | Re-run, click **Continue** without editing access. |
| Connecting brand B silently breaks brand A's Facebook publishing with "permission(s) must be granted before impersonating a user's page" | On Meta's consent screen the user picked **«Velg bare gjeldende Sider»** and didn't tick brand A's Page. Facebook revoked the app's access to that Page. | Re-connect each orphaned brand. On the consent screen pick **«Velg alle gjeldende og fremtidige Sider»** (top radio). See §4.6.1. The Settings UI lists the orphaned channels for you. |
| `Channel <id> belongs to brand "X", not "Y"` from `/api/publish` | UI passed a `social_channel_id` that's bound to a different brand | This is the multi-brand guard firing. Don't reuse channel ids across brands; the Settings UI only ever shows ids for the selected brand. |
| `ambiguous_channels` (HTTP 409) from `/api/publish` | The brand has more than one active channel for that platform and no `social_channel_id` was passed | Either pass `social_channel_ids: { facebook: "<id>" }` from the UI, or deactivate the channels you don't want to use. |
| YouTube uploads land in the wrong channel | Old `brand_settings.youtube_refresh_token` mirror still routing the upload | Run the **Test** button on the new YouTube channel row in Settings. If green, delete the legacy `brand_settings` row's `youtube_refresh_token` field (Supabase SQL editor). |

---

## 9. One-shot backfill script

`scripts/migrate-oauth-to-channels.mjs` copies legacy connections into the
new tables in one pass. Use it when you don't want to wait for every brand
to be re-OAuthed manually through the Settings UI.

### What it migrates

| Source | Destination |
| --- | --- |
| `social_accounts` (active rows) | `social_channels` + `oauth_tokens` (encrypted) |
| `brand_settings.settings.youtube_refresh_token` (per brand) | `social_channels(platform=youtube)` + `oauth_tokens` (refresh + access) |

For YouTube specifically, the script redeems the legacy refresh token once
to call `youtube.channels.list({mine:true})`, so the new
`social_channels.external_id` is the real YouTube channel id rather than
a placeholder. This needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in
the env. If those are missing the YouTube backfill is skipped (the rest
proceeds normally).

### Safety properties

- **Read-only on legacy rows.** `social_accounts` and `brand_settings` are
  never modified or deleted. The publisher's `LEGACY_FALLBACK` keeps reading
  them until you decommission them manually.
- **Idempotent.** The unique constraint on
  `(brand_id, platform, external_id)` means re-running upserts in place. Run
  it as many times as you like.
- **Explicit dry-run.** The default mode without `--dry-run` writes to the
  database. Always run with `--dry-run` first to inspect the output.
- **Cross-brand collision report.** When the same external account
  (e.g. one Facebook Page) was bound to multiple brands in the legacy
  table, the script flags it at the end of the run with the actionable
  fix path ("disconnect the wrong-brand row in Settings").

### Usage

```bash
# Dry run — prints what would be written, makes no DB changes.
OAUTH_ENCRYPTION_KEY=$(openssl rand -hex 32) \
  NEXT_PUBLIC_SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
  node scripts/migrate-oauth-to-channels.mjs --dry-run

# Real run — writes social_channels + oauth_tokens.
# Use the SAME OAUTH_ENCRYPTION_KEY that's set in the running app, or the
# encrypted rows will be unreadable.
node scripts/migrate-oauth-to-channels.mjs
```

Optional flags:

- `--brand=<canonical_id>` — only migrate rows for one brand (e.g.
  `--brand=zeneco`). Useful for incremental rollout.
- `--platform=<platform>` — only one platform (e.g. `--platform=facebook`).
- `--force-skip-youtube` — skip the brand_settings YouTube step entirely.
  Use when GOOGLE_* env vars aren't available or you only want to move the
  social_accounts table.

### Post-run review

1. Read the **Summary** block — confirm `errors: 0` and the upsert counts
   match what you saw in the dry-run.
2. Read the **Cross-brand bindings detected** section if present. Each
   listed account is now bound to multiple brands as separate rows. For
   each one:
   - Open Settings → Sosiale medier.
   - Pick the brand that should NOT own this account.
   - Click **Deaktiver** on the matching row.
   - Repeat for each wrong-brand binding.
3. Verify a publish to a draft for at least one brand on each platform.
   The `/api/publish` response includes `resolved.source` per platform —
   look for `oauth_tokens` (new path) rather than `social_accounts_legacy`
   (fallback). If you still see `social_accounts_legacy`, the `social_channels`
   row didn't get created for that brand+platform — check the script log.
4. Once every brand has been verified through the new path, you can:
   - Set the legacy `social_accounts.is_active=false` for the rows you've
     migrated (manual SQL, or wait for natural attrition via the disconnect
     button in Settings).
   - Delete `brand_settings.settings.youtube_refresh_token` keys for the
     brands that now have `oauth_tokens` rows.
   - Remove `YOUTUBE_REFRESH_TOKEN` from Vercel.
   - Delete the `LEGACY_FALLBACK` branch in
     `src/lib/publishing/resolve-channel.ts`.
