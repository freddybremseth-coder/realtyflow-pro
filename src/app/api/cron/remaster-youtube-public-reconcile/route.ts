import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { ensureRemasterLongFormPublic } from "@/services/integrations/remaster-youtube-longform";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode("/api/cron/remaster-youtube-public-reconcile");
  if (safeMode.skip) {
    return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  }

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: jobs, error } = await supabase
    .from("remaster_mix_jobs")
    .select("id,title,youtube_video_id,youtube_url,status")
    .eq("status", "completed")
    .not("youtube_video_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<Record<string, unknown>> = [];
  for (const job of jobs ?? []) {
    const videoId = String(job.youtube_video_id || "").trim();
    if (!videoId) continue;
    try {
      const privacy = await ensureRemasterLongFormPublic(videoId);
      results.push({
        jobId: job.id,
        videoId,
        title: job.title,
        youtubeUrl: job.youtube_url,
        ...privacy,
      });
    } catch (cause) {
      results.push({
        jobId: job.id,
        videoId,
        title: job.title,
        youtubeUrl: job.youtube_url,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  const changed = results.filter((item) => item.changed === true).length;
  const alreadyPublic = results.filter((item) => item.changed === false && item.after === "public").length;
  const failed = results.filter((item) => typeof item.error === "string").length;
  const status = failed > 0 ? "partial" : "success";

  await supabase.from("automation_logs").insert({
    action: "remaster_youtube_public_reconcile",
    agent_name: "nexus_remaster_youtube_public_reconcile",
    status,
    details: {
      checked: results.length,
      changed,
      already_public: alreadyPublic,
      failed,
    },
  });

  return NextResponse.json({
    success: failed === 0,
    status,
    checked: results.length,
    changed,
    alreadyPublic,
    failed,
    results,
  }, { status: failed > 0 ? 207 : 200 });
}
