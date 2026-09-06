import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { summarizeRemasterAnalytics } from "@/services/growth/remaster-analytics-observation";
import { readRemasterYouTubeAnalytics } from "@/services/integrations/remaster-youtube-analytics";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const METRIC_WINDOW = "28d";
const SNAPSHOT_SOURCE = "youtube_analytics_v2";

function utcDayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode("/api/cron/remaster-analytics-snapshot");
  if (safeMode.skip) {
    return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  }

  const analytics = await readRemasterYouTubeAnalytics(28);
  if (analytics.state === "NOT_READY") {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "youtube_analytics_not_ready",
      analyticsReady: false,
      reconnectHref: analytics.reconnectHref,
    });
  }
  if (analytics.state === "ERROR") {
    return NextResponse.json({ success: false, analyticsReady: true, error: analytics.error || "YouTube Analytics read failed" }, { status: 502 });
  }

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ success: false, error: "Supabase not configured" }, { status: 500 });

  const dayStart = utcDayStart();
  const { data: existing, error: existingError } = await supabase
    .from("engagement_snapshots")
    .select("post_id,raw_data")
    .eq("platform", "youtube")
    .eq("metric_window", METRIC_WINDOW)
    .gte("snapshot_at", dayStart);
  if (existingError) return NextResponse.json({ success: false, error: existingError.message }, { status: 500 });

  const existingIds = new Set(
    (existing || [])
      .filter((row: any) => row?.raw_data?.brand === "remasterfreddy" && row?.raw_data?.source === SNAPSHOT_SOURCE)
      .map((row: any) => String(row.post_id || ""))
      .filter(Boolean),
  );

  const observation = summarizeRemasterAnalytics(analytics.videos);
  const observationById = new Map(observation.observations.map((row) => [row.videoId, row]));
  const now = new Date().toISOString();
  const rows = analytics.videos
    .filter((video) => !existingIds.has(video.videoId))
    .map((video) => {
      const observed = observationById.get(video.videoId);
      return {
        platform: "youtube",
        post_id: video.videoId,
        likes: Math.round(video.likes),
        comments: Math.round(video.comments),
        shares: Math.round(video.shares),
        views: Math.round(video.views),
        saves: 0,
        total_interactions: Math.round(video.likes + video.comments + video.shares),
        media_type: "video",
        metric_window: METRIC_WINDOW,
        snapshot_at: now,
        raw_data: {
          brand: "remasterfreddy",
          source: SNAPSHOT_SOURCE,
          analytics_start_date: analytics.startDate,
          analytics_end_date: analytics.endDate,
          estimated_minutes_watched: video.estimatedMinutesWatched,
          average_view_duration: video.averageViewDuration,
          average_view_percentage: video.averageViewPercentage,
          subscribers_gained: video.subscribersGained,
          subscribers_lost: video.subscribersLost,
          net_subscribers: video.subscribersGained - video.subscribersLost,
          watch_quality: observed?.watchQuality || "INSUFFICIENT_DATA",
          engagement_quality: observed?.engagementQuality || "INSUFFICIENT_DATA",
          engagement_rate_pct: observed?.engagementRatePct ?? null,
          cohort_median_average_view_percentage: observation.cohort.medianAverageViewPercentage,
          cohort_median_engagement_rate_pct: observation.cohort.medianEngagementRatePct,
        },
      };
    });

  if (rows.length) {
    const { error: insertError } = await supabase.from("engagement_snapshots").insert(rows);
    if (insertError) return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    analyticsReady: true,
    measuredVideos: analytics.videos.length,
    snapshotsInserted: rows.length,
    alreadySnapshottedToday: analytics.videos.length - rows.length,
    metricWindow: METRIC_WINDOW,
    observation: {
      eligibleVideos: observation.eligibleVideos,
      insufficientVideos: observation.insufficientVideos,
      cohort: observation.cohort,
    },
  });
}
