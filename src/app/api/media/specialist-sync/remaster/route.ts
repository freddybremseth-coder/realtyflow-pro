import { NextRequest, NextResponse } from "next/server";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";
import { mirrorSpecialistRenderedAsset } from "@/services/media/specialist-asset-bridge";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MIRRORABLE_STATES = ["ready", "published", "needs_review"] as const;

function syncLimit(request: NextRequest) {
  const requested = Number(request.nextUrl.searchParams.get("limit") || 50);
  if (!Number.isFinite(requested)) return 50;
  return Math.max(1, Math.min(100, Math.floor(requested)));
}

export async function POST(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request, { synced: 0, failures: [] });
    if ("error" in context) return context.error;

    const limit = syncLimit(request);
    const { data: reels, error } = await context.supabase
      .from("remaster_reel_jobs")
      .select("id,brand,title,duration_seconds,state,video_path,caption,created_by,selection,created_at,updated_at")
      .in("state", [...MIRRORABLE_STATES])
      .not("video_path", "is", null)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Could not read Re-Master reels: ${error.message}`);

    const mirrored: Array<{ sourceJobId: string; mediaAssetId: string }> = [];
    const failures: Array<{ sourceJobId: string; error: string }> = [];

    for (const reel of reels || []) {
      const sourceJobId = String(reel.id || "");
      const storagePath = String(reel.video_path || "");
      if (!sourceJobId || !storagePath) continue;

      const publicUrl = context.supabase.storage.from("remaster-reels").getPublicUrl(storagePath).data.publicUrl;
      try {
        const result = await mirrorSpecialistRenderedAsset(context.supabase, {
          organizationId: context.scope.organizationId,
          sourceSystem: "remaster_reel_jobs",
          sourceJobId,
          provider: "remaster",
          brandId: reel.brand ? String(reel.brand) : null,
          title: String(reel.title || "Re-Master Reel"),
          description: reel.caption ? String(reel.caption) : null,
          publicUrl,
          storageBucket: "remaster-reels",
          storagePath,
          mimeType: "video/mp4",
          mediaType: "video",
          durationSeconds: Number(reel.duration_seconds || 0) || null,
          aspectRatio: "9:16",
          model: "ffmpeg",
          operation: "reel_render",
          actorEmail: reel.created_by ? String(reel.created_by) : context.scope.actorEmail,
          completedAt: reel.updated_at ? String(reel.updated_at) : reel.created_at ? String(reel.created_at) : null,
          sourceState: reel.state ? String(reel.state) : null,
          sourceMetadata: {
            selection: reel.selection && typeof reel.selection === "object" ? reel.selection : {},
            backfilled: true,
          },
          tags: ["reel", "remaster"],
        });
        mirrored.push({ sourceJobId, mediaAssetId: result.assetId });
      } catch (mirrorError) {
        failures.push({
          sourceJobId,
          error: mirrorError instanceof Error ? mirrorError.message : String(mirrorError),
        });
      }
    }

    return NextResponse.json({
      processed: (reels || []).length,
      synced: mirrored.length,
      failed: failures.length,
      mirrored,
      failures,
      referenceOnly: true,
      message: failures.length
        ? `Synced ${mirrored.length} Re-Master assets; ${failures.length} need review.`
        : `Synced ${mirrored.length} Re-Master assets into Shared Media.`,
    });
  } catch (error) {
    return jsonError(error);
  }
}
