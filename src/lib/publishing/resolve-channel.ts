/**
 * Single resolver the publisher uses to find "which token do I post with?"
 *
 * Walks three sources in order:
 *
 *   1) Explicit `socialChannelId` (caller knows exactly which channel) →
 *      `oauth_tokens` lookup. This is the new contract /api/publish accepts
 *      from Phase 4 onward.
 *
 *   2) `(brandId, platform)` against the new `social_channels` table. If
 *      exactly one active row exists, use its decrypted token. If multiple
 *      exist, throw `AmbiguousChannelError` so the caller can return a 400
 *      with the candidate list — there is no "pick one and hope" behavior.
 *
 *   3) Legacy fallback: the old `social_accounts` table with `normalizeBrand`
 *      fuzzy matching. This is only consulted when (1) and (2) both came up
 *      empty, so it costs nothing for already-migrated channels. It exists
 *      so the moment Phase 4 ships, in-flight publishes for accounts that
 *      haven't been re-OAuthed yet keep working until the Phase 8 backfill
 *      script copies them into the new tables.
 *
 * After Phase 8 ships and the legacy table is empty, this fallback can be
 * deleted in a one-line change (search for LEGACY_FALLBACK below).
 */

import {
  AmbiguousChannelError,
  getActiveChannel,
  getChannelById,
  getDecryptedTokens,
  type SocialChannel,
} from "@/lib/oauth/channels";
import type { OAuthPlatform } from "@/lib/oauth/state";
import { createServerClient } from "@/lib/supabase/server";

import { normalizeBrand } from "./normalize-brand";

export type ResolveSource = "explicit" | "oauth_tokens" | "social_accounts_legacy";

export interface ResolvedChannel {
  source: ResolveSource;
  /** Always populated. */
  accessToken: string;
  /** Provider-side identifier (page id, channel id, IG user id, LinkedIn URN). */
  externalId: string;
  displayName: string;
  /** New-tables row id when source is `oauth_tokens` or `explicit`; null for legacy. */
  channelId: string | null;
  /** Identifies the legacy row when source is `social_accounts_legacy`; null otherwise. */
  legacyAccountId: string | null;
}

export interface ResolveOptions {
  /** Explicit channel pin, e.g. when the UI lets the user choose. */
  socialChannelId?: string;
}

/** Surfaces both ambiguity and missing-channel cases with structured detail. */
export class ChannelResolutionError extends Error {
  constructor(
    public readonly code: "ambiguous" | "missing" | "no_token" | "wrong_brand",
    public readonly brandId: string,
    public readonly platform: OAuthPlatform,
    message: string,
    public readonly candidates?: SocialChannel[],
  ) {
    super(message);
    this.name = "ChannelResolutionError";
  }
}

export async function resolveChannel(
  brandId: string,
  platform: OAuthPlatform,
  opts?: ResolveOptions,
): Promise<ResolvedChannel> {
  // ─── 1. Explicit social_channel_id ────────────────────────────────────────
  if (opts?.socialChannelId) {
    const channel = await getChannelById(opts.socialChannelId);
    if (!channel) {
      throw new ChannelResolutionError(
        "missing",
        brandId,
        platform,
        `Channel ${opts.socialChannelId} not found.`,
      );
    }
    if (channel.brand_id !== brandId) {
      // Defensive: the caller asked to publish for brand X using a channel
      // that's bound to brand Y. Refuse — this is the exact class of bug
      // the multi-brand refactor is designed to prevent.
      throw new ChannelResolutionError(
        "wrong_brand",
        brandId,
        platform,
        `Channel ${opts.socialChannelId} belongs to brand "${channel.brand_id}", not "${brandId}".`,
      );
    }
    if (channel.platform !== platform) {
      throw new ChannelResolutionError(
        "missing",
        brandId,
        platform,
        `Channel ${opts.socialChannelId} is platform "${channel.platform}", expected "${platform}".`,
      );
    }
    const tokens = await getDecryptedTokens(channel.id);
    if (!tokens) {
      throw new ChannelResolutionError(
        "no_token",
        brandId,
        platform,
        `Channel ${channel.id} has no stored token. Re-connect from Settings.`,
      );
    }
    return {
      source: "explicit",
      accessToken: tokens.accessToken,
      externalId: channel.external_id,
      displayName: channel.display_name,
      channelId: channel.id,
      legacyAccountId: null,
    };
  }

  // ─── 2. New tables lookup by (brand, platform) ───────────────────────────
  let resolvedChannel: SocialChannel | null = null;
  try {
    resolvedChannel = await getActiveChannel(brandId, platform);
  } catch (err) {
    if (err instanceof AmbiguousChannelError) {
      throw new ChannelResolutionError(
        "ambiguous",
        brandId,
        platform,
        `Multiple active ${platform} channels for brand "${brandId}". Pass social_channel_id to disambiguate.`,
        err.candidates,
      );
    }
    throw err;
  }

  if (resolvedChannel) {
    const tokens = await getDecryptedTokens(resolvedChannel.id);
    if (!tokens) {
      // Channel row exists but oauth_tokens missing — treat as "needs
      // re-OAuth" rather than silently falling back to a legacy row that
      // might be a different account.
      throw new ChannelResolutionError(
        "no_token",
        brandId,
        platform,
        `Channel ${resolvedChannel.id} has no stored token. Re-connect from Settings.`,
      );
    }
    return {
      source: "oauth_tokens",
      accessToken: tokens.accessToken,
      externalId: resolvedChannel.external_id,
      displayName: resolvedChannel.display_name,
      channelId: resolvedChannel.id,
      legacyAccountId: null,
    };
  }

  // ─── 3. LEGACY_FALLBACK: social_accounts with fuzzy brand matching ───────
  // Once the Phase 8 backfill script has copied every legacy row into the
  // new tables and the legacy table is empty, delete this block + the
  // `social_accounts_legacy` literal. Until then it keeps unmigrated
  // connections publishing.
  const legacy = await resolveFromLegacy(brandId, platform);
  if (legacy) return legacy;

  throw new ChannelResolutionError(
    "missing",
    brandId,
    platform,
    `No active ${platform} channel for brand "${brandId}".`,
  );
}

async function resolveFromLegacy(
  brandId: string,
  platform: OAuthPlatform,
): Promise<ResolvedChannel | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("social_accounts")
    .select("id, platform, account_id, account_name, access_token, brand, brand_id")
    .eq("is_active", true)
    .eq("platform", platform);
  if (error || !data || data.length === 0) return null;

  const target = normalizeBrand(brandId);
  const matches = data.filter(
    (a: { brand?: string; brand_id?: string }) =>
      normalizeBrand(a.brand || "") === target ||
      normalizeBrand(a.brand_id || "") === target,
  );
  if (matches.length === 0) return null;

  // The legacy publisher used `account_name` substring tiebreak when there
  // were multiple legacy rows for the same brand+platform. We replicate
  // that here ONLY as a transition aid; the new tables prevent this case
  // by design (unique on brand+platform+external_id).
  const pick = matches.length === 1
    ? matches[0]
    : matches.find((a: { account_name?: string }) => {
        const name = (a.account_name || "").toLowerCase().replace(/[-_.\s]/g, "");
        return name.includes(target) || target.includes(name.slice(0, 6));
      }) || matches[0];

  return {
    source: "social_accounts_legacy",
    accessToken: pick.access_token as string,
    externalId: pick.account_id as string,
    displayName: (pick.account_name as string) || pick.account_id,
    channelId: null,
    legacyAccountId: pick.id as string,
  };
}
