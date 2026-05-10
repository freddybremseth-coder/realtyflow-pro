/**
 * OAuth state-parameter helpers.
 *
 * Every /api/oauth/<provider> request inserts a row into `oauth_states`,
 * sends `state_nonce` (a 32-byte hex string) as the OAuth `state` parameter,
 * and the callback consumes the row exactly once. This gives us:
 *
 *   1) CSRF protection — the callback won't act on a `state` it didn't issue.
 *   2) Brand routing   — we don't have to trust query params on the callback;
 *                        `brand_id` came from the originating request.
 *   3) Return-to       — the user lands back where they started without
 *                        having to encode it in the redirect URI.
 *   4) Carrier slot    — `metadata` lets the Meta callback stash the list of
 *                        Pages between the OAuth roundtrip and the page-picker
 *                        confirmation step (Phase 3).
 *
 * Replaces today's pattern of base64url-JSON-encoding `{brand, service}` into
 * the `state` field, which had no integrity check and was forgeable by anyone
 * who could trigger a callback URL hit.
 */

import { randomBytes } from "node:crypto";
import { createServerClient } from "@/lib/supabase/server";

export type OAuthPlatform =
  | "youtube"
  | "google_drive"
  | "gmail"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "pinterest"
  | "twitter";

export interface CreateStateInput {
  brandId: string;
  platform: OAuthPlatform;
  /** Where to send the user after the callback completes. Must be a same-origin path. */
  returnTo: string;
  /** Optional user id of whoever initiated the flow (audit trail only). */
  initiatedByUserId?: string | null;
  /** Optional carrier data, e.g. requested service variant for Google. */
  metadata?: Record<string, unknown>;
}

export interface OAuthStateRow {
  state_nonce: string;
  brand_id: string;
  platform: OAuthPlatform;
  return_to: string;
  initiated_by_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

/**
 * Generate a cryptographically random 32-byte hex nonce, persist a row in
 * `oauth_states`, and return the nonce. Caller passes the returned nonce as
 * the OAuth `state` parameter on the authorize URL.
 */
export async function createState(input: CreateStateInput): Promise<string> {
  // Same-origin guard: returnTo must be a path, not an absolute URL pointing
  // somewhere else. This stops a malicious caller from sending a victim
  // through our OAuth flow only to land them on attacker.com afterward.
  if (!input.returnTo.startsWith("/")) {
    throw new Error(
      `OAuth returnTo must be a relative path starting with "/". Got: ${input.returnTo}`,
    );
  }

  const stateNonce = randomBytes(32).toString("hex");
  const supabase = createServerClient();

  const { error } = await supabase.from("oauth_states").insert({
    state_nonce: stateNonce,
    brand_id: input.brandId,
    platform: input.platform,
    return_to: input.returnTo,
    initiated_by_user_id: input.initiatedByUserId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    throw new Error(`Failed to persist oauth_state: ${error.message}`);
  }
  return stateNonce;
}

/**
 * Atomically consume a state nonce: returns the row only if it exists, has
 * not yet been consumed, and has not expired. Marks it consumed in the same
 * call to prevent replay (re-running the same callback URL twice should fail
 * the second time).
 *
 * Returns null when the nonce is unknown, expired, or already consumed —
 * callers should treat all three identically (redirect to /settings with a
 * generic "OAuth flow expired, please try again" message).
 */
export async function consumeState(stateNonce: string): Promise<OAuthStateRow | null> {
  if (!stateNonce || typeof stateNonce !== "string" || !/^[0-9a-f]{64}$/.test(stateNonce)) {
    // Reject obviously-malformed nonces without hitting the DB. The format is
    // 64 hex chars from `randomBytes(32).toString('hex')`.
    return null;
  }

  const supabase = createServerClient();

  // Single-statement consume: UPDATE … WHERE not yet consumed AND not expired
  // RETURNING *. PostgREST exposes this via .update().eq().is().gt().select().
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("oauth_states")
    .update({ consumed_at: nowIso })
    .eq("state_nonce", stateNonce)
    .is("consumed_at", null)
    .gt("expires_at", nowIso)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[oauth/state] consumeState failed:", error);
    return null;
  }
  if (!data) return null;

  return {
    state_nonce: data.state_nonce as string,
    brand_id: data.brand_id as string,
    platform: data.platform as OAuthPlatform,
    return_to: data.return_to as string,
    initiated_by_user_id: (data.initiated_by_user_id as string | null) ?? null,
    metadata: (data.metadata as Record<string, unknown>) ?? {},
    created_at: data.created_at as string,
    expires_at: data.expires_at as string,
    consumed_at: data.consumed_at as string | null,
  };
}

/**
 * Update only the `metadata` field of an in-flight state row. Used by the
 * Meta callback to stash the Page list between the initial token exchange
 * and the user-confirmed page-picker submission. The state row stays
 * un-consumed until the picker finalize step calls `consumeState`.
 */
export async function updateStateMetadata(
  stateNonce: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("oauth_states")
    .update({ metadata })
    .eq("state_nonce", stateNonce)
    .is("consumed_at", null);
  if (error) {
    throw new Error(`Failed to update oauth_state metadata: ${error.message}`);
  }
}

/**
 * Best-effort GC. Safe to call from a cron route; idempotent and cheap
 * (indexed on expires_at). Removes consumed rows older than 1 day and
 * unconsumed rows past their expiry, so the table stays small.
 */
export async function gcExpiredStates(): Promise<{ deleted: number }> {
  const supabase = createServerClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // Two passes — Supabase doesn't support OR cleanly via the JS client
  // without raw SQL, and we're fine with two tiny deletes.
  const { count: c1 } = await supabase
    .from("oauth_states")
    .delete({ count: "exact" })
    .lt("expires_at", new Date().toISOString())
    .is("consumed_at", null);
  const { count: c2 } = await supabase
    .from("oauth_states")
    .delete({ count: "exact" })
    .lt("consumed_at", cutoff);
  return { deleted: (c1 ?? 0) + (c2 ?? 0) };
}
