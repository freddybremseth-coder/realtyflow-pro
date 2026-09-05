import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { listRemasterActionHistory } from "@/services/growth/remaster-action-history";
import { positiveMetadataTags, summarizeRemasterActionLearning } from "@/services/growth/remaster-growth-learning";
import { checkBrandYouTubeHealth } from "@/services/integrations/youtube-health";

export const dynamic = "force-dynamic";

function parseLearnings(raw: string | null | undefined) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function youtubeVideoId(url: unknown) {
  const value = String(url || "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.split("/").filter(Boolean)[0] || null;
    if (parsed.pathname.startsWith("/shorts/")) return parsed.pathname.split("/")[2] || null;
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [
    { data: songs, error: songError },
    { data: channels },
    { data: sources },
    { data: publications },
    youtubeHealth,
    growthHistory,
  ] = await Promise.all([
    supabase.from("songs").select("id,name,artist,genre,mood,status,youtube_url,image_url,thumbnail_url,brand,created_at,updated_at"),
    supabase.from("social_channels").select("id,brand_id,platform,display_name,is_active").eq("brand_id", "remasterfreddy").eq("is_active", true),
    supabase.from("marketing_source_queue").select("id,status,source_id,source_url,title,payload,last_planned_at").eq("brand_id", "remasterfreddy").eq("source_type", "song"),
    supabase.from("marketing_publications").select("id,state,channel,source_id,created_at,updated_at").eq("brand_id", "remasterfreddy").order("created_at", { ascending: false }).limit(500),
    checkBrandYouTubeHealth("remasterfreddy").catch((error) => ({ connected: false, configured: false, reason: "health_check_failed", message: error instanceof Error ? error.message : String(error) })),
    listRemasterActionHistory(250).catch(() => []),
  ]);
  if (songError) return NextResponse.json({ error: songError.message }, { status: 500 });

  const rows = (songs ?? []).filter((row: any) => ["remasterfreddy", "neuralbeat", "neural-beat"].includes(String(row.brand ?? "")));
  const sourceRows = sources ?? [];
  const publicationRows = publications ?? [];

  const latestGrowthByVideo = new Map<string, { actionType: string; executedAt: string | null; outcome: unknown; liftPct: unknown }>();
  for (const row of growthHistory) {
    const parsed = parseLearnings(row.learnings);
    const videoId = typeof parsed?.action?.videoId === "string" ? parsed.action.videoId : null;
    if (!videoId || latestGrowthByVideo.has(videoId)) continue;
    latestGrowthByVideo.set(videoId, {
      actionType: row.action_type,
      executedAt: row.executed_at,
      outcome: parsed?.feedback?.outcome ?? null,
      liftPct: parsed?.feedback?.liftPct ?? null,
    });
  }

  const catalog = rows
    .slice()
    .sort((a: any, b: any) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
    .map((row: any) => {
      const videoId = youtubeVideoId(row.youtube_url);
      return {
        id: row.id,
        title: row.name,
        artist: row.artist,
        genre: row.genre,
        mood: row.mood,
        status: row.status,
        youtubeUrl: row.youtube_url,
        youtubeVideoId: videoId,
        imageUrl: row.thumbnail_url || row.image_url || null,
        legacyBrand: row.brand,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        growthAction: videoId ? latestGrowthByVideo.get(videoId) ?? null : null,
      };
    });

  const metadataLearning = summarizeRemasterActionLearning(growthHistory, "update_metadata");
  const playlistLearning = summarizeRemasterActionLearning(growthHistory, "add_to_playlist");
  const suppressedActions = [metadataLearning, playlistLearning].filter((item) => item.mode === "SUPPRESS").map((item) => item.actionType);
  const recentGrowthActions = growthHistory.slice(0, 12).map((row) => {
    const parsed = parseLearnings(row.learnings);
    const feedback = parsed?.feedback && typeof parsed.feedback === "object" ? parsed.feedback : null;
    return {
      id: row.id,
      actionType: row.action_type,
      status: row.status,
      executedAt: row.executed_at,
      feedback: feedback ? {
        outcome: feedback.outcome ?? null,
        liftPct: feedback.liftPct ?? null,
        measuredAt: feedback.measuredAt ?? null,
      } : null,
    };
  });

  const autopilotEnabled = process.env.REMASTER_GROWTH_AUTOPILOT_ENABLED === "true";
  const growthStatus = !youtubeHealth.connected
    ? "BLOCKED"
    : !autopilotEnabled
      ? "READY_NOT_ENABLED"
      : suppressedActions.length > 0
        ? "LEARNING_GUARDED"
        : "ACTIVE";

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      songs: rows.length,
      publishedToYoutube: rows.filter((r: any) => Boolean(String(r.youtube_url || "").trim())).length,
      pendingYoutube: rows.filter((r: any) => !String(r.youtube_url || "").trim()).length,
      promotionReady: sourceRows.filter((r: any) => r.status === "ready").length,
      promotionDrafted: sourceRows.filter((r: any) => r.status === "drafted").length,
      connectedChannels: (channels ?? []).length,
      publications: publicationRows.length,
    },
    channels: channels ?? [],
    catalog,
    recent: catalog.slice(0, 12),
    growth: {
      status: growthStatus,
      autopilotEnabled,
      youtube: {
        connected: Boolean(youtubeHealth.connected),
        configured: Boolean(youtubeHealth.configured),
        reason: "reason" in youtubeHealth ? youtubeHealth.reason ?? null : null,
        message: "message" in youtubeHealth ? youtubeHealth.message ?? null : null,
        channel: "channel" in youtubeHealth ? youtubeHealth.channel ?? null : null,
      },
      learning: {
        metadata: metadataLearning,
        playlist: playlistLearning,
        suppressedActions,
        positiveMetadataTags: positiveMetadataTags(growthHistory, 12),
      },
      recentActions: recentGrowthActions,
      guardrails: {
        automaticTitleChanges: false,
        automaticThumbnailChanges: false,
        evidenceRequiredBeforeBias: 2,
        feedbackObservationDays: 7,
      },
    },
    safety: {
      canonicalBrand: "remasterfreddy",
      legacyBrandReads: ["neuralbeat", "neural-beat"],
      legacyPipelinePreserved: true,
      automaticPublishingChanged: false,
      sourceOfTruth: "remaster.freddybremseth.com/admin -> shared Supabase -> RealtyFlow/Nexus Growth OS",
      note: "New songs are created and published in Re-Master Admin. RealtyFlow is the read/monitor/growth layer and does not duplicate song publishing controls.",
    },
  });
}
