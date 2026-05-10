/**
 * Google-side helpers: token exchange, channel enumeration, and the
 * "finalize one channel" routine shared by both the auto-finalize path
 * (callback when there's exactly one channel) and the picker finalize path
 * (POST /api/oauth/google/finalize after the user picks).
 */

import { saveTokens, upsertChannel } from "./channels";
import { createServerClient } from "@/lib/supabase/server";

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
 * Finalize a single Google channel: upsert the social_channels row, save
 * encrypted tokens, and (legacy compat) mirror the refresh token into
 * brand_settings.settings.youtube_refresh_token so the existing token-walker
 * in src/services/integrations/youtube-client.ts keeps finding it during
 * the Phase 4 transition.
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

  if (input.platform === "youtube") {
    await mirrorYoutubeRefreshTokenToBrandSettings(input.brandId, input.refreshToken);
  }
}

async function mirrorYoutubeRefreshTokenToBrandSettings(
  brandId: string,
  refreshToken: string,
): Promise<void> {
  try {
    const supabase = createServerClient();
    const { data: existing } = await supabase
      .from("brand_settings")
      .select("settings")
      .eq("brand_id", brandId)
      .maybeSingle();
    const merged = {
      ...((existing?.settings as Record<string, unknown> | undefined) || {}),
      youtube_refresh_token: refreshToken,
    };
    await supabase.from("brand_settings").upsert(
      { brand_id: brandId, settings: merged, updated_at: new Date().toISOString() },
      { onConflict: "brand_id" },
    );
  } catch (err) {
    // Non-fatal — the new oauth_tokens row is the source of truth. The
    // legacy mirror is purely a transition aid.
    console.warn("[Google OAuth] Legacy brand_settings mirror failed (non-fatal):", err);
  }
}
