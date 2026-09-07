import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import {
  addRemasterLongFormToPlaylist,
  ensureRemasterLongFormPlaylist,
} from "@/services/integrations/remaster-youtube-longform";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PLAYLIST_DESCRIPTION =
  "Long-form Mediterranean deep-house mixes by Re-Master Freddy. Selected editions are presented with ZenEcoHomes Costa Blanca visuals.";

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service client is not configured." }, { status: 500 });
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: jobs, error } = await supabase
    .from("remaster_mix_jobs")
    .select("id,title,playlist_name,youtube_video_id,youtube_url,status,updated_at")
    .eq("status", "completed")
    .not("youtube_video_id", "is", null)
    .not("playlist_name", "is", null)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: `Could not load completed Re-Master mixes: ${error.message}` }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const job of jobs || []) {
    const videoId = String(job.youtube_video_id || "").trim();
    const playlistName = String(job.playlist_name || "").trim();
    if (!videoId || !playlistName) continue;

    try {
      const playlist = await ensureRemasterLongFormPlaylist(playlistName, PLAYLIST_DESCRIPTION);
      const added = await addRemasterLongFormToPlaylist(videoId, playlist.playlistId);
      results.push({
        jobId: job.id,
        videoId,
        playlistName,
        playlistId: playlist.playlistId,
        playlistCreated: playlist.created,
        duplicate: added.duplicate,
        ok: true,
      });
    } catch (err) {
      results.push({
        jobId: job.id,
        videoId,
        playlistName,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const failed = results.filter((result) => result.ok === false);
  return NextResponse.json({
    success: failed.length === 0,
    checked: results.length,
    repaired: results.filter((result) => result.ok === true && result.duplicate === false).length,
    alreadyCorrect: results.filter((result) => result.ok === true && result.duplicate === true).length,
    failed: failed.length,
    results,
  }, { status: failed.length ? 207 : 200 });
}
