import { OAuth2Client } from "google-auth-library";
import { getGoogleCredentials } from "@/lib/oauth/providers";
import { getChannelsByBrand, getDecryptedTokens } from "@/lib/oauth/channels";

const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly";

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

export async function readRemasterYouTubeAnalytics(days = 28): Promise<RemasterAnalyticsResult> {
  const safeDays = Math.min(90, Math.max(7, Math.floor(days || 28)));
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (safeDays - 1));
  const startDate = isoDay(start);
  const endDate = isoDay(end);
  const reconnectHref = "/api/oauth/google?brand_id=remasterfreddy&service=youtube&return_to=/remaster-freddy";

  const channels = await getChannelsByBrand("remasterfreddy", "youtube");
  if (channels.length !== 1) {
    return {
      state: channels.length === 0 ? "NOT_READY" : "ERROR",
      analyticsReady: false,
      reconnectHref,
      startDate,
      endDate,
      videos: [],
      error: channels.length === 0 ? "No active Re-Master YouTube channel is connected." : "Multiple active Re-Master YouTube channels are connected.",
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
    const auth = new OAuth2Client(credentials.clientId, credentials.clientSecret);
    auth.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    const access = await auth.getAccessToken();
    const accessToken = typeof access === "string" ? access : access?.token;
    if (!accessToken) throw new Error("Unable to obtain Google access token");

    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate,
      endDate,
      metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost",
      dimensions: "video",
      sort: "-views",
      maxResults: "200",
    });

    const response = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof body?.error?.message === "string" ? body.error.message : `YouTube Analytics request failed (${response.status})`);
    }

    const headers = Array.isArray(body?.columnHeaders) ? body.columnHeaders.map((header: any) => String(header?.name || "")) : [];
    const index = new Map(headers.map((name: string, i: number) => [name, i]));
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const videos = rows.map((row: unknown[]) => ({
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
    })).filter((row: RemasterAnalyticsVideoRow) => Boolean(row.videoId));

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
