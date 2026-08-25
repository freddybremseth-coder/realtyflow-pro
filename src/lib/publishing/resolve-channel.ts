/**
 * Canonical publishing channel resolver.
 *
 * Publishing is allowed to resolve credentials from ONE source only:
 * `social_channels` + `oauth_tokens`.
 *
 * Legacy `social_accounts` fallback was removed because historical rows contain
 * ambiguous and incorrect brand bindings. A missing canonical channel must fail
 * closed and be reconnected through Nexus / Channel Connections.
 */

import {
  AmbiguousChannelError,
  getActiveChannel,
  getChannelById,
  getDecryptedTokens,
  type SocialChannel,
} from "@/lib/oauth/channels";
import type { OAuthPlatform } from "@/lib/oauth/state";

export type ResolveSource = "explicit" | "oauth_tokens";

export interface ResolvedChannel {
  source: ResolveSource;
  accessToken: string;
  externalId: string;
  displayName: string;
  channelId: string;
  legacyAccountId: null;
}

export interface ResolveOptions {
  socialChannelId?: string;
}

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
  if (opts?.socialChannelId) {
    const channel = await getChannelById(opts.socialChannelId);
    if (!channel) {
      throw new ChannelResolutionError("missing", brandId, platform, `Channel ${opts.socialChannelId} not found.`);
    }
    if (channel.brand_id !== brandId) {
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
        `Channel ${channel.id} has no stored token. Re-connect from Nexus → Channel Connections.`,
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
      throw new ChannelResolutionError(
        "no_token",
        brandId,
        platform,
        `Channel ${resolvedChannel.id} has no stored token. Re-connect from Nexus → Channel Connections.`,
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

  throw new ChannelResolutionError(
    "missing",
    brandId,
    platform,
    `No canonical active ${platform} channel for brand "${brandId}". Connect it from Nexus → Channel Connections.`,
  );
}
