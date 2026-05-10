/**
 * facebook-token-helper — sanitize, validate, and upgrade Facebook/Instagram
 * access tokens stored in either:
 *
 *   - the new `oauth_tokens` table (post-Phase-3 OAuth flow), or
 *   - the legacy `social_accounts.access_token` column (pre-migration rows).
 *
 * Phase 4 changes the helper's contract: callers now pass `{channelId,
 * legacyAccountId}` so that token upgrades (USER→PAGE) write back to the
 * correct store. Without this, an upgrade applied to a legacy row would
 * silently leave the new oauth_tokens row stale, or vice versa, and the
 * next publish would re-trigger the same upgrade roundtrip.
 *
 * Failure modes handled (unchanged from pre-Phase-4):
 *   1. Tokens saved with wrapping whitespace/quotes (Graph rejects with
 *      "Cannot parse access token")
 *   2. USER tokens saved where a PAGE token is required — Graph rejects with
 *      "...permission(s) must be granted before impersonating a user's page"
 *   3. Expired/revoked tokens that need a re-OAuth to recover
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { encrypt } from "@/lib/oauth/crypto";
import { getMetaCredentials } from "@/lib/oauth/providers";

const GRAPH = "https://graph.facebook.com/v19.0";

export interface TokenDebugInfo {
  valid: boolean;
  type?: "USER" | "PAGE" | "APP" | "unknown";
  appId?: string;
  userId?: string;
  scopes?: string[];
  expiresAt?: number | null;
  error?: string;
}

export interface ResolvedToken {
  /** The token string ready to pass to Graph (trimmed, validated). */
  token: string;
  /** Whether the token was rewritten in storage during resolution. */
  refreshed: boolean;
  /** Human-readable note on what happened (shown to user on failure). */
  note?: string;
}

export class TokenError extends Error {
  constructor(
    message: string,
    public readonly userFacing: string,
  ) {
    super(message);
    this.name = "TokenError";
  }
}

/**
 * Strip whitespace, wrapping quotes, and `Bearer ` prefix from a token string.
 * Returns empty string for null/undefined/effectively-empty input.
 */
export function sanitizeToken(raw: string | null | undefined): string {
  if (!raw) return "";
  let t = String(raw).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  if (t.toLowerCase().startsWith("bearer ")) t = t.slice(7).trim();
  return t;
}

function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * Call Graph's `/debug_token` endpoint with an app token to introspect the
 * given user/page token. Returns null on network failure.
 */
export async function debugToken(token: string): Promise<TokenDebugInfo> {
  const clean = sanitizeToken(token);
  if (!clean) {
    return { valid: false, error: "Token is empty" };
  }

  let credentials;
  try {
    credentials = getMetaCredentials();
  } catch {
    return { valid: false, error: "META_APP_ID / META_APP_SECRET not set" };
  }

  try {
    const res = await fetch(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(clean)}` +
        `&access_token=${encodeURIComponent(`${credentials.clientId}|${credentials.clientSecret}`)}`,
    );
    const body = await res.json();
    if (body.error) {
      return { valid: false, error: body.error.message || "debug_token error" };
    }
    const d = body.data || {};
    const base: TokenDebugInfo = {
      valid: !!d.is_valid,
      type: d.type as TokenDebugInfo["type"],
      appId: d.app_id,
      userId: d.user_id,
      scopes: d.scopes || [],
      expiresAt: d.expires_at ?? null,
    };
    if (d.is_valid === false) {
      return { ...base, valid: false, error: d.error?.message || "Token marked invalid by Graph" };
    }
    return base;
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Given what we think is a USER token, fetch the Page token for `pageId`
 * via `/me/accounts`. Returns null if the Page isn't in the user's list
 * (meaning scopes are wrong OR user doesn't admin this Page).
 */
export async function fetchPageTokenFromUserToken(
  userToken: string,
  pageId: string,
): Promise<string | null> {
  const clean = sanitizeToken(userToken);
  if (!clean) return null;
  try {
    const res = await fetch(
      `${GRAPH}/me/accounts?fields=id,access_token&limit=100&access_token=${encodeURIComponent(clean)}`,
    );
    const body = await res.json();
    if (!res.ok || body.error) return null;
    const match = (body.data || []).find(
      (p: { id: string; access_token?: string }) => p.id === pageId,
    );
    return match?.access_token ? sanitizeToken(match.access_token) : null;
  } catch {
    return null;
  }
}

interface TokenLocation {
  /** New-tables row id; null if the token came from the legacy fallback. */
  channelId: string | null;
  /** Legacy social_accounts row id; null if the token came from oauth_tokens. */
  legacyAccountId: string | null;
}

/**
 * Resolve a Page token: ensure it's a Page token (not the user token).
 * If we have a user token saved against a Page row, try to upgrade by
 * calling `/me/accounts` and persist the upgrade to the same store the
 * stale token came from.
 *
 * Throws TokenError with a user-facing Norwegian message on unrecoverable state.
 */
export async function resolveFacebookPageToken(input: {
  externalId: string;
  storedToken: string;
  channelId: string | null;
  legacyAccountId: string | null;
}): Promise<ResolvedToken> {
  const clean = sanitizeToken(input.storedToken);
  if (!clean) {
    throw new TokenError(
      "Empty Facebook token",
      "Facebook-tilkoblingen mangler token. Gå til Innstillinger og koble til Facebook på nytt.",
    );
  }

  const debug = await debugToken(clean);
  let refreshed = clean !== input.storedToken;

  if (!debug.valid) {
    throw new TokenError(
      `Facebook token invalid: ${debug.error || "unknown"}`,
      `Facebook-token er ugyldig eller utløpt (${debug.error || "ukjent"}). Koble til Facebook på nytt.`,
    );
  }

  if (debug.type === "PAGE") {
    if (refreshed) {
      await persistFacebookToken(clean, { channelId: input.channelId, legacyAccountId: input.legacyAccountId });
    }
    return { token: clean, refreshed, note: "PAGE token OK" };
  }

  if (debug.type === "USER") {
    const pageToken = await fetchPageTokenFromUserToken(clean, input.externalId);
    if (!pageToken) {
      throw new TokenError(
        "User token cannot be upgraded to Page token (missing scopes or not admin)",
        `Du har ikke riktige tillatelser til Facebook-siden "${input.externalId}". Gå til Innstillinger → Koble til Facebook på nytt og godta alle tillatelser.`,
      );
    }
    await persistFacebookToken(pageToken, { channelId: input.channelId, legacyAccountId: input.legacyAccountId });
    return { token: pageToken, refreshed: true, note: "Upgraded USER→PAGE token" };
  }

  throw new TokenError(
    `Unexpected token type: ${debug.type}`,
    `Uventet tokentype (${debug.type || "ukjent"}). Koble til Facebook på nytt for å få et gyldig Page-token.`,
  );
}

/**
 * Instagram Business publishing always uses the linked Facebook Page's token.
 * We don't try to auto-upgrade here because the FB Page row (if any) is
 * handled separately — but we DO sanitize + debug.
 */
export async function resolveInstagramToken(input: {
  storedToken: string;
  channelId: string | null;
  legacyAccountId: string | null;
}): Promise<ResolvedToken> {
  const clean = sanitizeToken(input.storedToken);
  if (!clean) {
    throw new TokenError(
      "Empty Instagram token",
      "Instagram-tilkoblingen mangler token. Gå til Innstillinger → Koble til Facebook på nytt (Instagram bruker FB Page-token).",
    );
  }

  const debug = await debugToken(clean);
  const refreshed = clean !== input.storedToken;

  if (!debug.valid) {
    throw new TokenError(
      `Instagram token invalid: ${debug.error || "unknown"}`,
      `Instagram-token er ugyldig (${debug.error || "ukjent"}). Koble til Facebook på nytt.`,
    );
  }

  if (debug.type !== "PAGE") {
    throw new TokenError(
      `Instagram requires Page token, got ${debug.type}`,
      `Instagram krever et Facebook Page-token (fikk ${debug.type || "ukjent"}). Koble til Facebook på nytt.`,
    );
  }

  if (refreshed) {
    await persistFacebookToken(clean, { channelId: input.channelId, legacyAccountId: input.legacyAccountId });
  }
  return { token: clean, refreshed, note: "Instagram PAGE token OK" };
}

/**
 * Persist a refreshed/upgraded token back to whichever table it came from.
 *
 * For new-tables channels: write through `oauth_tokens.access_token_*` with
 * the same encryption envelope schema the rest of the app uses (importing
 * `encrypt` so we don't ship a second crypto path).
 *
 * For legacy social_accounts rows: write the plaintext token back into the
 * old column. We KNOW this is plaintext-at-rest — that was always the case
 * for that table; the encrypted path is only for the new flow.
 */
async function persistFacebookToken(token: string, where: TokenLocation): Promise<void> {
  try {
    const supabase = getSupabase();

    if (where.channelId) {
      const env = encrypt(token);
      await supabase
        .from("oauth_tokens")
        .update({
          access_token_ciphertext: "\\x" + env.ciphertext.toString("hex"),
          access_token_iv: "\\x" + env.iv.toString("hex"),
          access_token_tag: "\\x" + env.tag.toString("hex"),
          rotated_at: new Date().toISOString(),
        })
        .eq("social_channel_id", where.channelId);
      return;
    }

    if (where.legacyAccountId) {
      await supabase
        .from("social_accounts")
        .update({ access_token: token })
        .eq("id", where.legacyAccountId);
    }
  } catch (err) {
    console.warn("[FBTokenHelper] Failed to persist refreshed token:", err);
  }
}
