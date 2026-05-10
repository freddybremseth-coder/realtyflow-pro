/**
 * Centralised resolver for OAuth app credentials.
 *
 * Why a separate module:
 *   - The user-facing requirement is to use the canonical names
 *     `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `META_APP_ID`,
 *     `META_APP_SECRET`. The codebase historically used
 *     `YOUTUBE_CLIENT_ID/SECRET` and `FACEBOOK_APP_ID/SECRET`.
 *   - Doing the rename in 9 places creates a window where half the routes
 *     read the new names and half read the old ones, and a misconfigured
 *     deploy silently disables one provider without anyone noticing until
 *     a publish fails. This module is the *only* place that resolves env
 *     vars; everywhere else imports from here.
 *   - We accept either name during the transition. New code should write
 *     only the canonical names to env files; the deprecated fallbacks will
 *     be removed once Vercel/.env.local are cleaned up.
 */

export interface OAuthAppCredentials {
  clientId: string;
  clientSecret: string;
}

function pick(env: Record<string, string | undefined>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = env[k];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Google / YouTube OAuth client. Same credentials work for YouTube, Drive,
 * Gmail, Calendar — Google groups them under one OAuth client.
 *
 * Canonical: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 * Deprecated: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET
 */
export function getGoogleCredentials(): OAuthAppCredentials {
  const clientId = pick(process.env, "GOOGLE_CLIENT_ID", "YOUTUBE_CLIENT_ID");
  const clientSecret = pick(process.env, "GOOGLE_CLIENT_SECRET", "YOUTUBE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local and Vercel.",
    );
  }
  return { clientId, clientSecret };
}

/**
 * Meta (Facebook + Instagram) OAuth client.
 *
 * Canonical: META_APP_ID, META_APP_SECRET
 * Deprecated: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
 */
export function getMetaCredentials(): OAuthAppCredentials {
  const clientId = pick(process.env, "META_APP_ID", "FACEBOOK_APP_ID");
  const clientSecret = pick(process.env, "META_APP_SECRET", "FACEBOOK_APP_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error(
      "Meta OAuth not configured. Set META_APP_ID and META_APP_SECRET in .env.local and Vercel.",
    );
  }
  return { clientId, clientSecret };
}

/**
 * LinkedIn OAuth client.
 *
 * Canonical: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
 */
export function getLinkedInCredentials(): OAuthAppCredentials {
  const clientId = pick(process.env, "LINKEDIN_CLIENT_ID");
  const clientSecret = pick(process.env, "LINKEDIN_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error(
      "LinkedIn OAuth not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in .env.local and Vercel.",
    );
  }
  return { clientId, clientSecret };
}

/**
 * Resolve the public app URL used as the OAuth redirect base. We strip
 * accidental `\n` literals (a recurring issue when env values get pasted
 * with surrounding whitespace through Vercel's UI) and trailing slashes.
 *
 * Falls back to the request origin so local dev works without setting the
 * env var explicitly.
 */
export function getAppUrl(requestOrigin?: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  const raw = (fromEnv && fromEnv.trim()) || requestOrigin || "";
  if (!raw) {
    throw new Error(
      "Cannot resolve app URL. Set NEXT_PUBLIC_APP_URL or call from a Next.js route.",
    );
  }
  return raw.replace(/\\n/g, "").replace(/\s+/g, "").replace(/\/+$/, "");
}

/**
 * Build a redirect URI for an OAuth callback. Centralised so the same
 * derivation runs in both the authorize-URL builder and the token-exchange
 * step (Google fails the exchange if the redirect_uri doesn't match
 * byte-for-byte what was used at authorize time).
 */
export function buildRedirectUri(provider: string, requestOrigin?: string): string {
  const base = getAppUrl(requestOrigin);
  return `${base}/api/oauth/${provider}/callback`;
}
