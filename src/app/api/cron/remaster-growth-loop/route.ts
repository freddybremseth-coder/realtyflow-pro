import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { assessRemasterVideoPerformance, median } from "@/services/growth/remaster-growth-loop";
import { evaluateRemasterGrowthOutcome } from "@/services/growth/remaster-growth-feedback";
import { positiveMetadataTags, summarizeRemasterActionLearning } from "@/services/growth/remaster-growth-learning";
import { generateRemasterMetadataRefresh, selectBestRemasterPlaylist } from "@/services/growth/remaster-growth-optimizer";
import { findRemasterPlaylistGap } from "@/services/growth/remaster-playlist-gap";
import { listRemasterActionHistory, recordCompletedRemasterAction, recordRemasterActionFeedback, type RemasterActionHistoryRow } from "@/services/growth/remaster-action-history";
import { addRemasterVideoToPlaylist, createRemasterPlaylist, listRemasterChannelVideos, listRemasterPlaylists, updateRemasterVideoMetadata } from "@/services/integrations/remaster-youtube-actions";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const FULL_CATALOG_LIMIT = 250;
const MAX_VIDEOS_PER_RUN = 2;
const PLAYLIST_CREATE_COOLDOWN_DAYS = 30;
const PLAYLIST_CREATION_MARKER = "Autonomous playlist gap creation:";

function parsedLearnings(row: RemasterActionHistoryRow) {
  try {
    const parsed = JSON.parse(row.learnings || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function videoIdFromHistory(row: RemasterActionHistoryRow) {
  const parsed = parsedLearnings(row);
  return typeof parsed?.action?.videoId === "string" ? parsed.action.videoId : null;
}

function hasRecentAction(history: RemasterActionHistoryRow[], videoId: string, actionType: string, days: number) {
  const since = Date.now() - days * 86_400_000;
  return history.some((row) => row.action_type === actionType && row.status === "completed" && videoIdFromHistory(row) === videoId && Boolean(row.executed_at) && Date.parse(row.executed_at || "") >= since);
}

function hasRecentPlaylistCreation(history: RemasterActionHistoryRow[], days = PLAYLIST_CREATE_COOLDOWN_DAYS) {
  const since = Date.now() - days * 86_400_000;
  return history.some((row) => row.action_type === "strategy" && row.status === "completed" && row.content.startsWith(PLAYLIST_CREATION_MARKER) && Boolean(row.executed_at) && Date.parse(row.executed_at || "") >= since);
}

function hasMeasuredFeedback(row: RemasterActionHistoryRow) {
  const parsed = parsedLearnings(row);
  return Boolean(parsed?.feedback && parsed.feedback.outcome && parsed.feedback.outcome !== "INSUFFICIENT_DATA");
}

function youtubeVideoId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.hostname.includes("youtu.be")) return url.pathname.replace(/^\//, "").split("/")[0] || null;
    const id = url.searchParams.get("v");
    if (id) return id;
    const match = url.pathname.match(/\/(?:shorts|embed)\/([^/?#]+)/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode("/api/cron/remaster-growth-loop");
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  if (process.env.REMASTER_GROWTH_AUTOPILOT_ENABLED !== "true") {
    return NextResponse.json({ success: true, skipped: true, reason: "REMASTER_GROWTH_AUTOPILOT_ENABLED is not true" });
  }

  const supabase = getServiceSupabase();

  try {
    const [{ channelId, channelTitle, videos }, playlistResult, history, taxonomyResult] = await Promise.all([
      listRemasterChannelVideos(FULL_CATALOG_LIMIT),
      listRemasterPlaylists(50),
      listRemasterActionHistory(100),
      supabase
        ? supabase.from("songs").select("name,genre,mood,style,youtube_url,brand").not("youtube_url", "is", null)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (taxonomyResult.error) throw new Error(`Could not load canonical Re-Master taxonomy: ${taxonomyResult.error.message}`);

    const now = Date.now();
    const videoById = new Map(videos.map((video) => [video.videoId, video]));
    const feedback: Array<Record<string, unknown>> = [];

    for (const row of history) {
      if (!["update_metadata", "add_to_playlist"].includes(row.action_type) || row.status !== "completed" || !row.executed_at || hasMeasuredFeedback(row)) continue;
      const learnings = parsedLearnings(row);
      const videoId = videoIdFromHistory(row);
      const video = videoId ? videoById.get(videoId) : undefined;
      const before = learnings?.result?.before;
      const beforeViews = Number(before?.viewCount);
      const beforeViewsPerDay = Number(before?.viewsPerDay);
      const executedMs = Date.parse(row.executed_at);
      if (!video || !Number.isFinite(beforeViews) || !Number.isFinite(beforeViewsPerDay) || !Number.isFinite(executedMs)) continue;

      const observedDays = Math.max(0, (now - executedMs) / 86_400_000);
      const postActionViewsPerDay = observedDays > 0 ? Math.max(0, video.viewCount - beforeViews) / observedDays : 0;
      const outcome = evaluateRemasterGrowthOutcome({
        beforeViewsPerDay,
        afterViewsPerDay: postActionViewsPerDay,
        executedAt: row.executed_at,
        nowMs: now,
        minimumObservationDays: 7,
      });
      if (outcome.outcome === "INSUFFICIENT_DATA") continue;

      await recordRemasterActionFeedback(row, {
        ...outcome,
        videoId,
        currentViewCount: video.viewCount,
        beforeViewCount: beforeViews,
        measuredAt: new Date(now).toISOString(),
        actionType: row.action_type,
      });
      feedback.push({ actionId: row.id, videoId, actionType: row.action_type, outcome: outcome.outcome, liftPct: outcome.liftPct });
    }

    const metadataLearning = summarizeRemasterActionLearning(history, "update_metadata");
    const playlistLearning = summarizeRemasterActionLearning(history, "add_to_playlist");
    const learnedPositiveTags = positiveMetadataTags(history);

    const rates = videos.map((video) => {
      const ageDays = Math.max(1, (now - Date.parse(video.publishedAt)) / 86_400_000);
      return video.viewCount / ageDays;
    });
    const channelMedianViewsPerDay = median(rates);
    const assessed = videos.map((video) => ({ video, assessment: assessRemasterVideoPerformance(video, channelMedianViewsPerDay, now) }));
    const topTitles = [...assessed].sort((a, b) => b.assessment.viewsPerDay - a.assessment.viewsPerDay).slice(0, 8).map((item) => item.video.title);
    const underperforming = assessed.filter((item) => item.assessment.status === "UNDERPERFORMING").sort((a, b) => a.assessment.viewsPerDay - b.assessment.viewsPerDay);
    const underperformingIds = new Set(underperforming.map((item) => item.video.videoId));
    const suppressed: Array<Record<string, unknown>> = [];

    if (metadataLearning.mode === "SUPPRESS") {
      const affected = underperforming.filter((item) => item.assessment.actions.includes("REFRESH_DESCRIPTION") || item.assessment.actions.includes("REFRESH_TAGS")).length;
      if (affected) suppressed.push({ type: "update_metadata", affectedVideos: affected, reason: metadataLearning.rationale });
    }
    if (playlistLearning.mode === "SUPPRESS") {
      const affected = underperforming.filter((item) => item.assessment.actions.includes("ADD_TO_PLAYLIST")).length;
      if (affected) suppressed.push({ type: "add_to_playlist", affectedVideos: affected, reason: playlistLearning.rationale });
    }

    const taxonomyRows = (taxonomyResult.data || []).flatMap((row: any) => {
      const brand = String(row.brand || "").trim().toLowerCase();
      if (!["remasterfreddy", "neuralbeat", "neural-beat"].includes(brand)) return [];
      const videoId = youtubeVideoId(row.youtube_url);
      if (!videoId || !underperformingIds.has(videoId)) return [];
      const video = videoById.get(videoId);
      if (!video) return [];
      return [{ videoId, title: video.title || row.name || "Re-Master Freddy", genre: row.genre, mood: row.mood, style: row.style }];
    });

    const playlistGap = playlistLearning.mode !== "SUPPRESS" && !hasRecentPlaylistCreation(history)
      ? findRemasterPlaylistGap(taxonomyRows, playlistResult.playlists, { minimumTracks: 3, maximumSeedTracks: 5 })
      : null;

    const actions: Array<Record<string, unknown>> = [];
    let playlistCreated: Record<string, unknown> | null = null;

    if (playlistGap) {
      const created = await createRemasterPlaylist({ title: playlistGap.title, description: playlistGap.description });
      const seedVideoIds = playlistGap.videoIds.slice(0, MAX_VIDEOS_PER_RUN);
      await recordCompletedRemasterAction({
        type: "strategy",
        playlistId: created.playlistId,
        playlistTitle: playlistGap.title,
        details: `${PLAYLIST_CREATION_MARKER} ${playlistGap.dimension}:${playlistGap.label}`,
      }, {
        title: `Create listener-discovery playlist: ${playlistGap.title}`,
        impact: "Create a coherent listening session for a documented cluster of underperforming Re-Master tracks.",
        priority: "medium",
        approvedBy: "remaster-growth-autopilot",
      }, { ...created, clusterKey: playlistGap.key, evidenceTracks: playlistGap.videoIds.length, seedVideoIds });

      for (const videoId of seedVideoIds) {
        const video = videoById.get(videoId);
        if (!video) continue;
        const assessment = assessed.find((item) => item.video.videoId === videoId)?.assessment;
        const result = await addRemasterVideoToPlaylist(videoId, created.playlistId);
        await recordCompletedRemasterAction({
          type: "add_to_playlist",
          videoId,
          playlistId: created.playlistId,
          playlistTitle: playlistGap.title,
          currentTitle: video.title,
          details: `Seed new evidence-based playlist ${playlistGap.title}`,
        }, {
          title: `Seed ${playlistGap.title} with ${video.title}`,
          impact: "Increase session discovery for a coherent Re-Master catalog cluster; measure after cooldown.",
          priority: "medium",
          approvedBy: "remaster-growth-autopilot",
        }, { ...result, before: { viewCount: video.viewCount, viewsPerDay: assessment?.viewsPerDay ?? 0 }, clusterKey: playlistGap.key });
        actions.push({ videoId, type: "add_to_playlist", playlistId: created.playlistId, playlistTitle: playlistGap.title, newPlaylist: true });
      }
      playlistCreated = { playlistId: created.playlistId, title: playlistGap.title, clusterKey: playlistGap.key, evidenceTracks: playlistGap.videoIds.length, seededTracks: seedVideoIds.length, duplicate: created.duplicate };
    } else {
      const candidates = underperforming.filter(({ video, assessment }) => {
        const metadataEligible = (assessment.actions.includes("REFRESH_DESCRIPTION") || assessment.actions.includes("REFRESH_TAGS"))
          && metadataLearning.mode !== "SUPPRESS"
          && !hasRecentAction(history, video.videoId, "update_metadata", 14);
        const playlistEligible = assessment.actions.includes("ADD_TO_PLAYLIST")
          && playlistLearning.mode !== "SUPPRESS"
          && !hasRecentAction(history, video.videoId, "add_to_playlist", 30);
        return metadataEligible || playlistEligible;
      }).slice(0, MAX_VIDEOS_PER_RUN);

      for (const { video, assessment } of candidates) {
        const metadataEligible = (assessment.actions.includes("REFRESH_DESCRIPTION") || assessment.actions.includes("REFRESH_TAGS"))
          && metadataLearning.mode !== "SUPPRESS"
          && !hasRecentAction(history, video.videoId, "update_metadata", 14);
        if (metadataEligible) {
          const optimized = await generateRemasterMetadataRefresh({
            title: video.title,
            description: video.description || "",
            tags: video.tags || [],
            viewCount: video.viewCount,
            viewsPerDay: assessment.viewsPerDay,
            channelMedianViewsPerDay,
            topTitles,
            learnedPositiveTags,
            learningMode: metadataLearning.mode,
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
            priority: metadataLearning.mode === "FAVOR" ? "high" : "medium",
            approvedBy: "remaster-growth-autopilot",
          }, { ...result, before: { viewCount: video.viewCount, viewsPerDay: assessment.viewsPerDay, channelMedianViewsPerDay }, learning: metadataLearning, learnedPositiveTags });
          actions.push({ videoId: video.videoId, type: "update_metadata", title: video.title, learningMode: metadataLearning.mode });
        }

        const playlistEligible = assessment.actions.includes("ADD_TO_PLAYLIST")
          && playlistLearning.mode !== "SUPPRESS"
          && !hasRecentAction(history, video.videoId, "add_to_playlist", 30);
        if (playlistEligible) {
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
              priority: playlistLearning.mode === "FAVOR" ? "high" : "medium",
              approvedBy: "remaster-growth-autopilot",
            }, { ...result, before: { viewCount: video.viewCount, viewsPerDay: assessment.viewsPerDay }, learning: playlistLearning });
            actions.push({ videoId: video.videoId, type: "add_to_playlist", playlistId: playlist.playlistId, playlistTitle: playlist.title, duplicate: result.duplicate, learningMode: playlistLearning.mode });
          }
        }
      }
    }

    const payload = {
      success: true,
      channelId,
      channelTitle,
      measuredVideos: videos.length,
      requestedCatalogCoverage: FULL_CATALOG_LIMIT,
      channelMedianViewsPerDay,
      feedbackMeasured: feedback.length,
      feedback,
      learning: {
        metadata: metadataLearning,
        playlist: playlistLearning,
        learnedPositiveTags,
      },
      underperforming: underperforming.length,
      candidatesReviewed: playlistCreated ? Number(playlistCreated.seededTracks || 0) : new Set(actions.map((action) => action.videoId).filter(Boolean)).size,
      playlistCreated,
      actions,
      suppressed,
      guardrails: { maxVideosPerRun: MAX_VIDEOS_PER_RUN, metadataCooldownDays: 14, playlistCooldownDays: 30, playlistCreateCooldownDays: PLAYLIST_CREATE_COOLDOWN_DAYS, minimumTracksForNewPlaylist: 3, automaticPlaylistDeletion: false, automaticPlaylistRename: false, feedbackObservationDays: 7, minimumMeasuredOutcomesForBias: 2, automaticTitleChanges: false, automaticThumbnailChanges: false },
    };

    if (supabase) {
      await supabase.from("automation_logs").insert({
        action: "remaster_growth_loop",
        agent_name: "nexus_remaster_growth_loop",
        status: suppressed.length ? "partial" : "success",
        details: {
          measured_videos: videos.length,
          underperforming: underperforming.length,
          candidates_reviewed: payload.candidatesReviewed,
          actions: actions.length,
          playlist_created: playlistCreated,
          feedback_measured: feedback.length,
          suppressed,
        },
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Re-Master growth loop failed";
    if (supabase) {
      await supabase.from("automation_logs").insert({
        action: "remaster_growth_loop",
        agent_name: "nexus_remaster_growth_loop",
        status: "error",
        details: { error: message },
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
