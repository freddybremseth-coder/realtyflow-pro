import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { assessRemasterVideoPerformance, median } from "@/services/growth/remaster-growth-loop";
import { generateRemasterMetadataRefresh, selectBestRemasterPlaylist } from "@/services/growth/remaster-growth-optimizer";
import { listRemasterActionHistory, recordCompletedRemasterAction, type RemasterActionHistoryRow } from "@/services/growth/remaster-action-history";
import { addRemasterVideoToPlaylist, listRemasterChannelVideos, listRemasterPlaylists, updateRemasterVideoMetadata } from "@/services/integrations/remaster-youtube-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function videoIdFromHistory(row: RemasterActionHistoryRow) {
  try {
    const parsed = JSON.parse(row.learnings || "{}");
    return typeof parsed?.action?.videoId === "string" ? parsed.action.videoId : null;
  } catch {
    return null;
  }
}

function hasRecentAction(history: RemasterActionHistoryRow[], videoId: string, actionType: string, days: number) {
  const since = Date.now() - days * 86_400_000;
  return history.some((row) => row.action_type === actionType && row.status === "completed" && videoIdFromHistory(row) === videoId && Boolean(row.executed_at) && Date.parse(row.executed_at || "") >= since);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode("/api/cron/remaster-growth-loop");
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  if (process.env.REMASTER_GROWTH_AUTOPILOT_ENABLED !== "true") {
    return NextResponse.json({ success: true, skipped: true, reason: "REMASTER_GROWTH_AUTOPILOT_ENABLED is not true" });
  }

  try {
    const [{ channelId, channelTitle, videos }, playlistResult, history] = await Promise.all([
      listRemasterChannelVideos(50),
      listRemasterPlaylists(50),
      listRemasterActionHistory(100),
    ]);
    const now = Date.now();
    const rates = videos.map((video) => {
      const ageDays = Math.max(1, (now - Date.parse(video.publishedAt)) / 86_400_000);
      return video.viewCount / ageDays;
    });
    const channelMedianViewsPerDay = median(rates);
    const assessed = videos.map((video) => ({ video, assessment: assessRemasterVideoPerformance(video, channelMedianViewsPerDay, now) }));
    const topTitles = [...assessed].sort((a, b) => b.assessment.viewsPerDay - a.assessment.viewsPerDay).slice(0, 8).map((item) => item.video.title);
    const candidates = assessed.filter((item) => item.assessment.status === "UNDERPERFORMING").sort((a, b) => a.assessment.viewsPerDay - b.assessment.viewsPerDay).slice(0, 2);
    const actions: Array<Record<string, unknown>> = [];

    for (const { video, assessment } of candidates) {
      if ((assessment.actions.includes("REFRESH_DESCRIPTION") || assessment.actions.includes("REFRESH_TAGS")) && !hasRecentAction(history, video.videoId, "update_metadata", 14)) {
        const optimized = await generateRemasterMetadataRefresh({
          title: video.title,
          description: video.description || "",
          tags: video.tags || [],
          viewCount: video.viewCount,
          viewsPerDay: assessment.viewsPerDay,
          channelMedianViewsPerDay,
          topTitles,
        });
        const result = await updateRemasterVideoMetadata(video.videoId, { description: optimized.description, tags: optimized.tags });
        await recordCompletedRemasterAction({
          type: "update_metadata",
          videoId: video.videoId,
          currentTitle: video.title,
          newDescription: optimized.description,
          newTags: optimized.tags,
          details: `Autonomous metadata refresh after underperformance: ${assessment.reasons.join(" ")}`,
        }, {
          title: `Re-optimize ${video.title}`,
          impact: "Increase sustainable YouTube discovery and listener growth; measure again after cooldown.",
          priority: "medium",
          approvedBy: "remaster-growth-autopilot",
        }, { ...result, before: { viewCount: video.viewCount, viewsPerDay: assessment.viewsPerDay, channelMedianViewsPerDay } });
        actions.push({ videoId: video.videoId, type: "update_metadata", title: video.title });
      }

      if (assessment.actions.includes("ADD_TO_PLAYLIST") && !hasRecentAction(history, video.videoId, "add_to_playlist", 30)) {
        const playlist = selectBestRemasterPlaylist(video.title, playlistResult.playlists);
        if (playlist) {
          const result = await addRemasterVideoToPlaylist(video.videoId, playlist.playlistId);
          await recordCompletedRemasterAction({
            type: "add_to_playlist",
            videoId: video.videoId,
            playlistId: playlist.playlistId,
            playlistTitle: playlist.title,
            currentTitle: video.title,
            details: `Add underperforming track to relevant existing playlist: ${playlist.title}`,
          }, {
            title: `Playlist boost for ${video.title}`,
            impact: "Increase session discovery and listener exposure through a relevant Re-Master playlist.",
            priority: "medium",
            approvedBy: "remaster-growth-autopilot",
          }, { ...result, before: { viewCount: video.viewCount, viewsPerDay: assessment.viewsPerDay } });
          actions.push({ videoId: video.videoId, type: "add_to_playlist", playlistId: playlist.playlistId, playlistTitle: playlist.title, duplicate: result.duplicate });
        }
      }
    }

    return NextResponse.json({
      success: true,
      channelId,
      channelTitle,
      measuredVideos: videos.length,
      channelMedianViewsPerDay,
      underperforming: assessed.filter((item) => item.assessment.status === "UNDERPERFORMING").length,
      candidatesReviewed: candidates.length,
      actions,
      guardrails: { maxVideosPerRun: 2, metadataCooldownDays: 14, playlistCooldownDays: 30, automaticTitleChanges: false, automaticThumbnailChanges: false },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Re-Master growth loop failed" }, { status: 500 });
  }
}
