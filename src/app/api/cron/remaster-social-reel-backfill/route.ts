import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { backfillSocialReels } from "@/services/pipelines/remaster-art-short-publish";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const REMASTER_BRANDS = ["remasterfreddy", "neuralbeat", "neural-beat"];

function hasUsableSocialReel(metadata: any) {
  if (typeof metadata?.socialReelUrl === "string" && metadata.socialReelUrl.startsWith("https://")) return true;
  return Array.isArray(metadata?.socialReelVariants)
    && metadata.socialReelVariants.some((item: any) => typeof item?.url === "string" && item.url.startsWith("https://"));
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode("/api/cron/remaster-social-reel-backfill");
  if (safeMode.skip) {
    return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  }

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const { data: songs, error } = await supabase
      .from("songs")
      .select("id,name,brand,file_url,youtube_url,ai_metadata,updated_at")
      .in("brand", REMASTER_BRANDS)
      .not("file_url", "is", null)
      .order("updated_at", { ascending: false })
      .limit(120);

    if (error) throw new Error(error.message);

    const candidates = (songs ?? []).filter((song: any) => {
      const metadata = song.ai_metadata && typeof song.ai_metadata === "object" ? song.ai_metadata : {};
      if (!metadata.shortsUrl) return false;
      if (hasUsableSocialReel(metadata)) return false;
      if (metadata.socialReelBackfillStatus === "processing") {
        const started = Date.parse(String(metadata.socialReelBackfillStartedAt || ""));
        if (Number.isFinite(started) && Date.now() - started < 30 * 60_000) return false;
      }
      return true;
    });

    if (!candidates.length) {
      return NextResponse.json({ success: true, completed: true, message: "No Re-Master songs need social Reel backfill" });
    }

    const candidate = candidates[0];
    const result = await backfillSocialReels(candidate.id);

    await supabase.from("automation_logs").insert({
      action: "remaster_social_reel_backfill",
      agent_name: "nexus_remaster_social_reel_backfill",
      status: "success",
      details: {
        song_id: candidate.id,
        title: candidate.name,
        result_status: result.status,
        variants: result.variants,
        remaining_candidates_seen: Math.max(0, candidates.length - 1),
      },
    });

    return NextResponse.json({
      success: true,
      songId: candidate.id,
      title: candidate.name,
      status: result.status,
      socialReelUrl: result.socialReelUrl,
      variants: result.variants,
      remainingCandidatesSeen: Math.max(0, candidates.length - 1),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("automation_logs").insert({
      action: "remaster_social_reel_backfill",
      agent_name: "nexus_remaster_social_reel_backfill",
      status: "error",
      details: { error: message },
    }).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
