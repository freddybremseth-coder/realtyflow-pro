/**
 * Google-side helpers: token exchange, channel enumeration, and the
 * "finalize one channel" routine shared by both the auto-finalize path
 * (callback when there's exactly one channel) and the picker finalize path
 * (POST /api/oauth/google/finalize after the user picks).
 */

import { saveTokens, upsertChannel } from "./channels";

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  customUrl?: string;
  thumbnail?: string;
  subscriberCount?: number;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(
      `Google token exchange failed: ${data.error_description || data.error || res.status}`,
    );
  }
  return data as GoogleTokenResponse;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<{
  sub: string;
  name?: string;
  email?: string;
}> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  return res.json();
}

export async function listYouTubeChannels(accessToken: string): Promise<YouTubeChannelInfo[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("mine", "true");
  url.searchParams.set("maxResults", "50");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`channels.list failed: ${data.error?.message || res.status}`);
  }
  const items = (data.items || []) as Array<{
    id: string;
    snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } };
    statistics?: { subscriberCount?: string };
  }>;
  return items.map((item) => ({
    id: item.id,
    title: item.snippet?.title || `Channel ${item.id}`,
    customUrl: item.snippet?.customUrl,
    thumbnail: item.snippet?.thumbnails?.default?.url,
    subscriberCount: item.statistics?.subscriberCount
      ? Number(item.statistics.subscriberCount)
      : undefined,
  }));
}

/**
 * Finalize one Google channel into the canonical connection store only.
 * `social_channels + oauth_tokens` is the source of truth for YouTube and
 * Google Drive. We intentionally no longer mirror refresh tokens into
 * `brand_settings`; dual-write allowed stale or cross-brand legacy tokens to
 * survive after the canonical channel binding had changed.
 */
export async function finalizeGoogleChannel(input: {
  brandId: string;
  platform: "youtube" | "google_drive";
  channel: YouTubeChannelInfo;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
  scopes: string[];
}): Promise<void> {
  const channelRow = await upsertChannel({
    brandId: input.brandId,
    platform: input.platform,
    externalId: input.channel.id,
    displayName: input.channel.title,
    metadata: {
      handle: input.channel.customUrl,
      thumbnail: input.channel.thumbnail,
      subscribers: input.channel.subscriberCount,
    },
  });

  await saveTokens({
    socialChannelId: channelRow.id,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: input.expiresAt,
    scopes: input.scopes,
  });
}
