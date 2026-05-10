/**
 * social_channels + oauth_tokens CRUD layer.
 *
 * This module is the only place in the app that should read or write the
 * encrypted token columns. Routes call into `getDecryptedTokens()`; the
 * publish path calls `getActiveChannel()` / `getChannelsByBrand()` to find
 * which channel to post to. Keeping the crypto and the column shape behind
 * a single module means we can rotate keys, add a `key_id v2`, or change the
 * envelope format without touching every callsite.
 */

import { createServerClient } from "@/lib/supabase/server";
import {
  CURRENT_KEY_ID,
  decryptOptional,
  encrypt,
  encryptOptional,
  type KeyId,
} from "./crypto";
import type { OAuthPlatform } from "./state";

export interface SocialChannel {
  id: string;
  brand_id: string;
  platform: OAuthPlatform;
  external_id: string;
  display_name: string;
  metadata: Record<string, unknown>;
  is_active: boolean;
  connected_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertChannelInput {
  brandId: string;
  platform: OAuthPlatform;
  externalId: string;
  displayName: string;
  metadata?: Record<string, unknown>;
  connectedByUserId?: string | null;
  /** Defaults to true on insert; pass false to soft-disconnect. */
  isActive?: boolean;
}

export interface SaveTokensInput {
  socialChannelId: string;
  accessToken: string;
  /** Some providers (Facebook Page tokens) don't issue refresh tokens. */
  refreshToken?: string | null;
  /**
   * Optional access-token expiry. NULL means "long-lived / no expiry hint"
   * (e.g. Page tokens, IG tokens that inherit Page lifetime).
   */
  expiresAt?: Date | null;
  scopes: string[];
  tokenType?: string;
}

export interface DecryptedTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
  tokenType: string;
  rotatedAt: Date;
  keyId: KeyId;
}

// ─── Channel CRUD ───────────────────────────────────────────────────────────

/**
 * Insert or update a (brand_id, platform, external_id) tuple. The unique
 * constraint on those three columns means re-running the same OAuth for the
 * same brand/page produces an UPDATE rather than a duplicate row — which is
 * the safe behavior. If you want to attach the same external account to a
 * different brand, that's a separate row by design (and the multi-brand
 * concern this whole refactor is meant to enforce).
 */
export async function upsertChannel(input: UpsertChannelInput): Promise<SocialChannel> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("social_channels")
    .upsert(
      {
        brand_id: input.brandId,
        platform: input.platform,
        external_id: input.externalId,
        display_name: input.displayName,
        metadata: input.metadata ?? {},
        connected_by_user_id: input.connectedByUserId ?? null,
        is_active: input.isActive ?? true,
      },
      { onConflict: "brand_id,platform,external_id" },
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert social_channel: ${error?.message ?? "no data returned"}`);
  }
  return data as SocialChannel;
}

export async function getChannelById(id: string): Promise<SocialChannel | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("social_channels")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[oauth/channels] getChannelById failed:", error);
    return null;
  }
  return (data as SocialChannel | null) ?? null;
}

export async function getChannelsByBrand(
  brandId: string,
  platform?: OAuthPlatform,
): Promise<SocialChannel[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("social_channels")
    .select("*")
    .eq("brand_id", brandId)
    .eq("is_active", true);
  if (platform) query = query.eq("platform", platform);
  const { data, error } = await query.order("platform").order("display_name");
  if (error) {
    console.error("[oauth/channels] getChannelsByBrand failed:", error);
    return [];
  }
  return (data as SocialChannel[]) ?? [];
}

/**
 * The publish path's "find me the channel for (brand, platform)" lookup.
 * Returns null when zero matches. Returns the single match when exactly one.
 * Throws when there are multiple — which is the intentional signal to the
 * UI/caller that they need to pick a `social_channel_id` explicitly. This
 * replaces the `normalizeBrand()` fuzzy-matching in
 * src/services/publishing/publisher.ts that has been silently posting to the
 * wrong account.
 */
export async function getActiveChannel(
  brandId: string,
  platform: OAuthPlatform,
): Promise<SocialChannel | null> {
  const matches = await getChannelsByBrand(brandId, platform);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  throw new AmbiguousChannelError(brandId, platform, matches);
}

export class AmbiguousChannelError extends Error {
  constructor(
    public readonly brandId: string,
    public readonly platform: OAuthPlatform,
    public readonly candidates: SocialChannel[],
  ) {
    super(
      `Multiple active ${platform} channels for brand "${brandId}" (${candidates.length}). ` +
        `Caller must pass an explicit social_channel_id to disambiguate.`,
    );
    this.name = "AmbiguousChannelError";
  }
}

export async function setChannelActive(id: string, isActive: boolean): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("social_channels")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw new Error(`Failed to update channel.is_active: ${error.message}`);
}

/**
 * Hard-delete a channel (and, via FK cascade, its oauth_tokens row).
 * Prefer `setChannelActive(id, false)` for normal disconnects so the audit
 * trail survives — only call this for "user explicitly wants this gone".
 */
export async function deleteChannel(id: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from("social_channels").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete social_channel: ${error.message}`);
}

// ─── Token CRUD ─────────────────────────────────────────────────────────────

/**
 * Encrypt and persist an access token (and refresh token if present) for a
 * channel. Upserts on `social_channel_id` so re-running OAuth for the same
 * channel rotates the secret in place.
 */
export async function saveTokens(input: SaveTokensInput): Promise<void> {
  if (!input.accessToken) {
    throw new Error("saveTokens: accessToken is required");
  }
  const supabase = createServerClient();

  const accessEnv = encrypt(input.accessToken);
  const refreshEnv = encryptOptional(input.refreshToken ?? null);

  const row = {
    social_channel_id: input.socialChannelId,
    key_id: CURRENT_KEY_ID,
    access_token_ciphertext: bufferToBytea(accessEnv.ciphertext),
    access_token_iv: bufferToBytea(accessEnv.iv),
    access_token_tag: bufferToBytea(accessEnv.tag),
    refresh_token_ciphertext: refreshEnv ? bufferToBytea(refreshEnv.ciphertext) : null,
    refresh_token_iv: refreshEnv ? bufferToBytea(refreshEnv.iv) : null,
    refresh_token_tag: refreshEnv ? bufferToBytea(refreshEnv.tag) : null,
    expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
    scopes: input.scopes,
    token_type: input.tokenType ?? "Bearer",
    rotated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("oauth_tokens")
    .upsert(row, { onConflict: "social_channel_id" });

  if (error) {
    throw new Error(`Failed to upsert oauth_tokens: ${error.message}`);
  }
}

/**
 * Look up and decrypt the tokens for a channel. Returns null if no row exists
 * (e.g. channel is registered but never finished OAuth). Throws if decryption
 * fails — that's a corrupt row or wrong key, and silent fallback would let
 * the publisher post with a wrong/empty token.
 */
export async function getDecryptedTokens(socialChannelId: string): Promise<DecryptedTokens | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("oauth_tokens")
    .select("*")
    .eq("social_channel_id", socialChannelId)
    .maybeSingle();
  if (error) {
    console.error("[oauth/channels] getDecryptedTokens failed:", error);
    return null;
  }
  if (!data) return null;

  // Supabase returns bytea columns as base64 strings or hex `\x..` strings
  // depending on PostgREST settings. Normalize both shapes back into Buffers.
  const access = decryptOptional({
    ciphertext: byteaToBuffer(data.access_token_ciphertext),
    iv: byteaToBuffer(data.access_token_iv),
    tag: byteaToBuffer(data.access_token_tag),
    keyId: (data.key_id ?? CURRENT_KEY_ID) as KeyId,
  });
  if (!access) {
    throw new Error(
      `oauth_tokens row ${data.id} has empty or unreadable access token — re-OAuth required.`,
    );
  }

  const refresh = decryptOptional({
    ciphertext: byteaToBuffer(data.refresh_token_ciphertext),
    iv: byteaToBuffer(data.refresh_token_iv),
    tag: byteaToBuffer(data.refresh_token_tag),
    keyId: (data.key_id ?? CURRENT_KEY_ID) as KeyId,
  });

  return {
    accessToken: access,
    refreshToken: refresh,
    expiresAt: data.expires_at ? new Date(data.expires_at) : null,
    scopes: (data.scopes as string[]) ?? [],
    tokenType: (data.token_type as string) ?? "Bearer",
    rotatedAt: new Date(data.rotated_at as string),
    keyId: (data.key_id ?? CURRENT_KEY_ID) as KeyId,
  };
}

/**
 * Convenience: brand + platform → tokens. Wraps `getActiveChannel` and
 * `getDecryptedTokens` together for the publisher's "I just want a token to
 * post with" use case. Propagates `AmbiguousChannelError` so the publisher
 * can return a 400 with the candidate list rather than silently picking one.
 */
export async function getTokensForBrandPlatform(
  brandId: string,
  platform: OAuthPlatform,
): Promise<{ channel: SocialChannel; tokens: DecryptedTokens } | null> {
  const channel = await getActiveChannel(brandId, platform);
  if (!channel) return null;
  const tokens = await getDecryptedTokens(channel.id);
  if (!tokens) return null;
  return { channel, tokens };
}

// ─── bytea <-> Buffer helpers ───────────────────────────────────────────────
//
// Supabase's PostgREST returns bytea columns as `\x<hex>` strings when the
// "Bytea Output" project setting is `hex` (the default). When you write back
// you can pass either hex strings or base64; for clarity we write hex with
// the `\x` prefix.

function bufferToBytea(buf: Buffer): string {
  return "\\x" + buf.toString("hex");
}

function byteaToBuffer(value: unknown): Buffer | null {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") {
    if (value.startsWith("\\x")) {
      return Buffer.from(value.slice(2), "hex");
    }
    // Some PostgREST setups return base64 instead of \x-hex.
    return Buffer.from(value, "base64");
  }
  // Last resort: array of numbers (older supabase-js versions did this for
  // bytea). Coerce to Buffer.
  if (Array.isArray(value)) return Buffer.from(value as number[]);
  throw new Error(`Unrecognized bytea representation in row: ${typeof value}`);
}
