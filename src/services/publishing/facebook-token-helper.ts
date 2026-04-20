/**
 * facebook-token-helper — sanitize, validate, and upgrade Facebook/Instagram
 * access tokens stored in `social_accounts`.
 *
 * Handles three recurring failure modes we've observed in production:
 *   1. Tokens saved with wrapping whitespace/quotes (Graph rejects with
 *      "Cannot parse access token")
 *   2. USER tokens saved where a PAGE token is required — Graph rejects with
 *      "...permission(s) must be granted before impersonating a user's page"
 *   3. Expired/revoked tokens that need a re-OAuth to recover
 *
 * We try to auto-recover case (2) by calling `/me/accounts` with the stored
 * user token to find the matching Page and its Page token, then upserting it
 * into `social_accounts` so subsequent posts use the right token.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const GRAPH = 'https://graph.facebook.com/v19.0';

export interface TokenDebugInfo {
  valid: boolean;
  type?: 'USER' | 'PAGE' | 'APP' | 'unknown';
  appId?: string;
  userId?: string;
  scopes?: string[];
  expiresAt?: number | null;
  error?: string;
}

export interface ResolvedToken {
  /** The token string ready to pass to Graph (trimmed, validated). */
  token: string;
  /** Whether the token was rewritten in Supabase during resolution. */
  refreshed: boolean;
  /** Human-readable note on what happened (shown to user on failure). */
  note?: string;
}

export class TokenError extends Error {
  constructor(message: string, public readonly userFacing: string) {
    super(message);
    this.name = 'TokenError';
  }
}

/**
 * Strip whitespace, wrapping quotes, and `Bearer ` prefix from a token string.
 * Returns empty string for null/undefined/effectively-empty input.
 */
export function sanitizeToken(raw: string | null | undefined): string {
  if (!raw) return '';
  let t = String(raw).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  if (t.toLowerCase().startsWith('bearer ')) t = t.slice(7).trim();
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
    return { valid: false, error: 'Token is empty' };
  }

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    return { valid: false, error: 'FACEBOOK_APP_ID / FACEBOOK_APP_SECRET not set' };
  }

  try {
    const res = await fetch(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(clean)}&access_token=${appId}|${appSecret}`,
    );
    const body = await res.json();
    if (body.error) {
      return { valid: false, error: body.error.message || 'debug_token error' };
    }
    const d = body.data || {};
    if (d.is_valid === false) {
      return { valid: false, error: d.error?.message || 'Token marked invalid by Graph' };
    }
    return {
      valid: !!d.is_valid,
      type: d.type as TokenDebugInfo['type'],
      appId: d.app_id,
      userId: d.user_id,
      scopes: d.scopes || [],
      expiresAt: d.expires_at ?? null,
    };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Network error' };
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
    const match = (body.data || []).find((p: { id: string; access_token?: string }) => p.id === pageId);
    return match?.access_token ? sanitizeToken(match.access_token) : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a token for a Facebook Page row: ensure it's a Page token. If the
 * stored token is a User token, try to upgrade by calling `/me/accounts` and
 * persist the upgrade to `social_accounts` for next time.
 *
 * Throws TokenError with a user-facing Norwegian message on unrecoverable state.
 */
export async function resolveFacebookPageToken(
  accountRowId: string,
  pageId: string,
  storedToken: string,
): Promise<ResolvedToken> {
  const clean = sanitizeToken(storedToken);
  if (!clean) {
    throw new TokenError(
      'Empty Facebook token',
      'Facebook-tilkoblingen mangler token. Gå til Innstillinger og koble til Facebook på nytt.',
    );
  }

  const debug = await debugToken(clean);

  // If trimming changed the token, always persist the clean version so we
  // don't re-debug whitespace next time.
  let refreshed = clean !== storedToken;

  if (!debug.valid) {
    throw new TokenError(
      `Facebook token invalid: ${debug.error || 'unknown'}`,
      `Facebook-token er ugyldig eller utløpt (${debug.error || 'ukjent'}). Koble til Facebook på nytt.`,
    );
  }

  // Happy path: it's already a Page token
  if (debug.type === 'PAGE') {
    if (refreshed) await persistToken(accountRowId, clean);
    return { token: clean, refreshed, note: 'PAGE token OK' };
  }

  // USER token saved for a Page row → attempt upgrade
  if (debug.type === 'USER') {
    const pageToken = await fetchPageTokenFromUserToken(clean, pageId);
    if (!pageToken) {
      throw new TokenError(
        'User token cannot be upgraded to Page token (missing scopes or not admin)',
        `Du har ikke riktige tillatelser til Facebook-siden "${pageId}". Gå til Innstillinger → Koble til Facebook på nytt og godta alle tillatelser (pages_show_list, pages_manage_posts, pages_read_engagement).`,
      );
    }
    // Persist the upgraded token so next post doesn't re-upgrade
    await persistToken(accountRowId, pageToken);
    return { token: pageToken, refreshed: true, note: 'Upgraded USER→PAGE token' };
  }

  // Some other token type (APP, unknown) — fail with guidance
  throw new TokenError(
    `Unexpected token type: ${debug.type}`,
    `Uventet tokentype (${debug.type || 'ukjent'}). Koble til Facebook på nytt for å få et gyldig Page-token.`,
  );
}

/**
 * Instagram Business publishing always uses the linked Facebook Page's token.
 * Validate shape + issue a Page-flavored error message. We don't try to
 * auto-upgrade here because the FB Page row (if any) would have been handled
 * separately — but we DO sanitize + debug.
 */
export async function resolveInstagramToken(
  accountRowId: string,
  storedToken: string,
): Promise<ResolvedToken> {
  const clean = sanitizeToken(storedToken);
  if (!clean) {
    throw new TokenError(
      'Empty Instagram token',
      'Instagram-tilkoblingen mangler token. Gå til Innstillinger → Koble til Facebook på nytt (Instagram bruker FB Page-token).',
    );
  }

  const debug = await debugToken(clean);
  const refreshed = clean !== storedToken;

  if (!debug.valid) {
    throw new TokenError(
      `Instagram token invalid: ${debug.error || 'unknown'}`,
      `Instagram-token er ugyldig (${debug.error || 'ukjent'}). Koble til Facebook på nytt — Instagram bruker Facebook-siden sitt token.`,
    );
  }

  if (debug.type !== 'PAGE') {
    throw new TokenError(
      `Instagram requires Page token, got ${debug.type}`,
      `Instagram krever et Facebook Page-token (fikk ${debug.type || 'ukjent'}). Koble til Facebook på nytt.`,
    );
  }

  if (refreshed) await persistToken(accountRowId, clean);
  return { token: clean, refreshed, note: 'Instagram PAGE token OK' };
}

async function persistToken(accountRowId: string, token: string): Promise<void> {
  try {
    const supabase = getSupabase();
    await supabase
      .from('social_accounts')
      .update({ access_token: token })
      .eq('id', accountRowId);
  } catch (err) {
    console.warn('[FBTokenHelper] Failed to persist refreshed token:', err);
  }
}
