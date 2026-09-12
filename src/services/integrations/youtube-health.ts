import { OAuth2Client } from "google-auth-library";
import {
  getChannelById,
  getChannelsByBrand,
  getDecryptedTokens,
  type SocialChannel,
} from "@/lib/oauth/channels";
import { getGoogleCredentials } from "@/lib/oauth/providers";
import { createYoutubeOAuthClient } from "@/services/integrations/youtube-oauth-client";

const YOUTUBE_ANALYTICS_SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/^["']|["']$/g, "").trim() : "";
}

function hasAnalyticsScope(scopes: string[] | undefined) {
  return Array.isArray(scopes) && scopes.some((scope) => clean(scope) === YOUTUBE_ANALYTICS_SCOPE);
}

function isRevoked(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /invalid[_\s]grant|expired|revoked/i.test(message);
}

async function verifyCanonicalChannel(channel: SocialChannel) {
  const tokens = await getDecryptedTokens(channel.id);
  if (!tokens) {
    return {
      connected: false,
      configured: true,
      analyticsReady: false,
      analyticsScope: YOUTUBE_ANALYTICS_SCOPE,
      reason: "missing_oauth_token",
      message: "YouTube-kanalen mangler canonical OAuth-token. Koble den på nytt i Channel Connections.",
    };
  }

  const credentials = getGoogleCredentials();

  try {
    const auth = new OAuth2Client(credentials.clientId, credentials.clientSecret);
    const accessTokenStillValid =
      Boolean(clean(tokens.accessToken)) &&
      Boolean(tokens.expiresAt) &&
      tokens.expiresAt!.getTime() > Date.now() + 60_000;

    if (accessTokenStillValid) {
      auth.setCredentials({
        access_token: clean(tokens.accessToken),
        expiry_date: tokens.expiresAt!.getTime(),
      });
    } else if (clean(tokens.refreshToken)) {
      auth.setCredentials({ refresh_token: clean(tokens.refreshToken) });
      await auth.getAccessToken();
    } else {
      return {
        connected: false,
        configured: true,
        analyticsReady: false,
        analyticsScope: YOUTUBE_ANALYTICS_SCOPE,
        reason: "expired_access_without_refresh",
        message: "YouTube access-tokenet er utløpt og kanalen mangler refresh token. Koble den på nytt.",
      };
    }

    const client = createYoutubeOAuthClient(auth);
    const result = await client.channels.list({
      part: ["snippet", "statistics"],
      mine: true,
      maxResults: 50,
    });
    const items = result.data.items ?? [];
    const exact = items.find((item) => String(item.id) === String(channel.external_id));

    if (!exact?.id) {
      const actual = items[0];
      return {
        connected: false,
        configured: true,
        analyticsReady: false,
        analyticsScope: YOUTUBE_ANALYTICS_SCOPE,
        reason: "channel_mismatch",
        message: actual?.id
          ? `OAuth-tokenet tilhører YouTube-kanalen ${actual.snippet?.title || actual.id}, ikke ${channel.display_name}. Koble riktig kanal på nytt.`
          : "OAuth-tokenet virker, men Google returnerte ingen YouTube-kanal for denne tilkoblingen.",
        expectedChannelId: channel.external_id,
        actualChannelId: actual?.id || null,
      };
    }

    return {
      connected: true,
      configured: true,
      analyticsReady: hasAnalyticsScope(tokens.scopes),
      analyticsScope: YOUTUBE_ANALYTICS_SCOPE,
      tokenSource: `oauth_tokens:${channel.display_name}`,
      channel: {
        id: exact.id,
        title: exact.snippet?.title || "",
        thumbnailUrl: exact.snippet?.thumbnails?.high?.url || "",
        subscriberCount: Number(exact.statistics?.subscriberCount || 0),
        videoCount: Number(exact.statistics?.videoCount || 0),
        viewCount: Number(exact.statistics?.viewCount || 0),
      },
    };
  } catch (error) {
    const revoked = isRevoked(error);
    return {
      connected: false,
      configured: true,
      analyticsReady: false,
      analyticsScope: YOUTUBE_ANALYTICS_SCOPE,
      reason: revoked ? "token_expired_or_revoked" : "connection_failed",
      message: revoked
        ? "YouTube refresh-tokenet er utløpt eller tilbakekalt. Koble kanalen på nytt."
        : "Den canonical YouTube-tilkoblingen kunne ikke verifiseres.",
    };
  }
}

/**
 * Validate one exact canonical social_channels row. This is used by the
 * integration health surface so an expired access token can be refreshed and
 * the refreshed credential is still required to resolve to the exact external
 * YouTube channel stored on the row.
 */
export async function checkYouTubeChannelHealth(channelId: string) {
  const channel = await getChannelById(channelId);
  if (!channel || !channel.is_active || channel.platform !== "youtube") {
    return {
      connected: false,
      configured: false,
      analyticsReady: false,
      analyticsScope: YOUTUBE_ANALYTICS_SCOPE,
      reason: "missing_canonical_channel",
      message: "Ingen aktiv canonical YouTube-kanal finnes for denne tilkoblingen.",
    };
  }
  return verifyCanonicalChannel(channel);
}

/**
 * Brand-level health is deliberately canonical-only. Historical
 * brand_settings.youtube_refresh_token fallback made stale or cross-brand
 * bindings look healthy even after social_channels had been corrected.
 *
 * Multiple active YouTube rows are also a hard routing ambiguity: do not pick
 * whichever token happens to validate first. The brand must have exactly one
 * active canonical YouTube channel before autonomous publishing can treat it
 * as healthy.
 */
export async function checkBrandYouTubeHealth(brandId: string) {
  const channels = await getChannelsByBrand(brandId, "youtube");
  if (channels.length === 0) {
    return {
      connected: false,
      configured: false,
      analyticsReady: false,
      analyticsScope: YOUTUBE_ANALYTICS_SCOPE,
      reason: "missing_brand_token",
      message: "Ingen aktiv canonical YouTube-tilkobling er lagret for brandet.",
    };
  }

  if (channels.length > 1) {
    return {
      connected: false,
      configured: true,
      analyticsReady: false,
      analyticsScope: YOUTUBE_ANALYTICS_SCOPE,
      reason: "ambiguous_channel",
      message: `Brandet har ${channels.length} aktive YouTube-kanaler. Velg én canonical kanal før publisering.`,
      candidates: channels.map((channel) => ({
        id: channel.id,
        externalId: channel.external_id,
        displayName: channel.display_name,
      })),
    };
  }

  return verifyCanonicalChannel(channels[0]);
}
