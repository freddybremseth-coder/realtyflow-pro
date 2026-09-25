import { google } from "googleapis";
import { getGoogleCredentials } from "@/lib/oauth/providers";
import { getChannelsByBrand, getDecryptedTokens } from "@/lib/oauth/channels";

const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly";
const ANALYTICS_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "likes",
  "comments",
  "shares",
  "subscribersGained",
  "subscribersLost",
].join(",");

export type RemasterAnalyticsState = "READY" | "NOT_READY" | "ERROR";

export type RemasterAnalyticsVideoRow = {
  videoId: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  subscribersLost: number;
};

export type RemasterAnalyticsResult = {
  state: RemasterAnalyticsState;
  analyticsReady: boolean;
  reconnectHref: string;
  startDate: string;
  endDate: string;
  videos: RemasterAnalyticsVideoRow[];
  error?: string;
};

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function finite(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export async function readBrandYouTubeAnalytics(brandId: string, days = 28): Promise<RemasterAnalyticsResult> {
  const safeBrand = String(brandId || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,60}$/.test(safeBrand)) {
    return {
      state: "ERROR", analyticsReady: false, reconnectHref: "/connections",
      startDate: "", endDate: "", videos: [], error: "Invalid YouTube brand id.",
    };
  }
  const safeDays = Math.min(90, Math.max(7, Math.floor(days || 28)));
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (safeDays - 1));
  const startDate = isoDay(start);
  const endDate = isoDay(end);
  const reconnectHref = `/api/oauth/google?brand_id=${encodeURIComponent(safeBrand)}&service=youtube&return_to=/connections`;

  const channels = await getChannelsByBrand(safeBrand, "youtube");
  if (channels.length !== 1) {
    return {
      state: channels.length === 0 ? "NOT_READY" : "ERROR",
      analyticsReady: false,
      reconnectHref,
      startDate,
      endDate,
      videos: [],
      error: channels.length === 0
        ? `No active YouTube channel is connected for ${safeBrand}.`
        : `Multiple active YouTube channels are connected for ${safeBrand}.`,
    };
  }

  const tokens = await getDecryptedTokens(channels[0].id);
  if (!tokens?.refreshToken || !tokens.scopes.includes(ANALYTICS_SCOPE)) {
    return {
      state: "NOT_READY",
      analyticsReady: false,
      reconnectHref,
      startDate,
      endDate,
      videos: [],
      error: "YouTube Analytics readonly scope has not been granted yet.",
    };
  }

  try {
    const credentials = getGoogleCredentials();
    const auth = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret);
    auth.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    const analytics = google.youtubeAnalytics({ version: "v2", auth });
    const response = await analytics.reports.query({
      ids: "channel==MINE",
      startDate,
      endDate,
      metrics: ANALYTICS_METRICS,
      dimensions: "video",
      sort: "-views",
      maxResults: 200,
    });

    const headers = Array.isArray(response.data.columnHeaders)
      ? response.data.columnHeaders.map((header) => String(header.name || ""))
      : [];
    const index = new Map(headers.map((name, i) => [name, i]));
    const rows = Array.isArray(response.data.rows) ? response.data.rows : [];
    const videos = rows
      .map((row) => ({
        videoId: String(row[index.get("video") ?? -1] || ""),
        views: finite(row[index.get("views") ?? -1]),
        estimatedMinutesWatched: finite(row[index.get("estimatedMinutesWatched") ?? -1]),
        averageViewDuration: finite(row[index.get("averageViewDuration") ?? -1]),
        averageViewPercentage: finite(row[index.get("averageViewPercentage") ?? -1]),
        likes: finite(row[index.get("likes") ?? -1]),
        comments: finite(row[index.get("comments") ?? -1]),
        shares: finite(row[index.get("shares") ?? -1]),
        subscribersGained: finite(row[index.get("subscribersGained") ?? -1]),
        subscribersLost: finite(row[index.get("subscribersLost") ?? -1]),
      }))
      .filter((row): row is RemasterAnalyticsVideoRow => Boolean(row.videoId));

    return {
      state: "READY",
      analyticsReady: true,
      reconnectHref,
      startDate,
      endDate,
      videos,
    };
  } catch (error) {
    return {
      state: "ERROR",
      analyticsReady: true,
      reconnectHref,
      startDate,
      endDate,
      videos: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}


/** Backwards-compatible Re-Master reader used by the existing analytics cron. */
export async function readRemasterYouTubeAnalytics(days = 28): Promise<RemasterAnalyticsResult> {
  return readBrandYouTubeAnalytics("remasterfreddy", days);
}
