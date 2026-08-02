import { NextRequest, NextResponse } from "next/server";
import { refreshMediaJob } from "@/services/media/job-service";
import { exportMediaAssetToContentHub } from "@/services/media/content-hub-export";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

function bridgeInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    audioAssetId: typeof row.audioAssetId === "string" ? row.audioAssetId : "",
    visualAssetId: typeof row.visualAssetId === "string" ? row.visualAssetId : "",
    autoExportToContentHub: row.autoExportToContentHub === true,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const context = await getMediaApiContext(request, { job: null });
    if ("error" in context) return context.error;

    const refresh = request.nextUrl.searchParams.get("refresh") !== "false";
    if (refresh) {
      const { data: before, error: beforeError } = await context.supabase
        .from("media_generation_jobs")
        .select("operation, input_assets_json")
        .eq("organization_id", context.scope.organizationId)
        .eq("id", params.id)
        .maybeSingle();
      if (beforeError) throw new Error(beforeError.message);

      const job = await refreshMediaJob(context.supabase, {
        organizationId: context.scope.organizationId,
        actorEmail: context.scope.actorEmail,
        jobId: params.id,
      });

      const input = before?.operation === "openart_voice_bridge"
        ? bridgeInput(before.input_assets_json)
        : null;

      if (input && job.status === "completed") {
        const sourceAssetIds = [input.audioAssetId, input.visualAssetId].filter(Boolean);
        const { data: resultAssets, error: assetsError } = await context.supabase
          .from("media_assets")
          .select("id, source_asset_ids, exported_to_content_hub_at")
          .eq("organization_id", context.scope.organizationId)
          .eq("job_id", params.id);
        if (assetsError) throw new Error(assetsError.message);

        for (const asset of resultAssets || []) {
          const currentSources = Array.isArray(asset.source_asset_ids)
            ? asset.source_asset_ids.map(String)
            : [];
          const mergedSources = [...new Set([...currentSources, ...sourceAssetIds])];
          if (mergedSources.length !== currentSources.length) {
            await context.supabase
              .from("media_assets")
              .update({ source_asset_ids: mergedSources })
              .eq("organization_id", context.scope.organizationId)
              .eq("id", asset.id);
          }

          if (input.autoExportToContentHub && !asset.exported_to_content_hub_at) {
            await exportMediaAssetToContentHub(context.supabase, {
              organizationId: context.scope.organizationId,
              actorEmail: context.scope.actorEmail,
              assetId: String(asset.id),
            });
          }
        }
      }

      return NextResponse.json({ job });
    }

    const { data, error } = await context.supabase
      .from("media_generation_jobs")
      .select("*, media_assets(*)")
      .eq("organization_id", context.scope.organizationId)
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Fant ikke media-jobben", job: null }, { status: 404 });
    return NextResponse.json({ job: data });
  } catch (error) {
    return jsonError(error);
  }
}
