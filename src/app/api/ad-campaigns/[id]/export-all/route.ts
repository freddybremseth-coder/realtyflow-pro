import { NextRequest, NextResponse } from "next/server";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";
import { exportMediaAssetToContentHub } from "@/services/media/content-hub-export";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;

    const { data: creatives, error } = await context.supabase
      .from("ad_creatives")
      .select("id,output_asset_id,pushed_to_hub")
      .eq("campaign_id", params.id)
      .eq("status", "completed")
      .not("output_asset_id", "is", null);
    if (error) throw new Error(error.message);

    const pending = (creatives || []).filter((creative) => creative.output_asset_id && !creative.pushed_to_hub);
    const exported: string[] = [];
    const failed: Array<{ creativeId: string; error: string }> = [];

    for (let index = 0; index < pending.length; index += 5) {
      const batch = pending.slice(index, index + 5);
      const results = await Promise.allSettled(batch.map(async (creative) => {
        await exportMediaAssetToContentHub(context.supabase, {
          organizationId: context.scope.organizationId,
          actorEmail: context.scope.actorEmail,
          assetId: String(creative.output_asset_id),
        });
        await context.supabase
          .from("ad_creatives")
          .update({ pushed_to_hub: true })
          .eq("campaign_id", params.id)
          .eq("id", creative.id);
        return creative.id;
      }));

      results.forEach((result, resultIndex) => {
        const creative = batch[resultIndex];
        if (result.status === "fulfilled") exported.push(result.value);
        else failed.push({
          creativeId: creative.id,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      });
    }

    return NextResponse.json({
      exported: exported.length,
      alreadyExported: (creatives || []).filter((creative) => creative.pushed_to_hub).length,
      failed,
      totalAssets: creatives?.length || 0,
    });
  } catch (error) {
    return jsonError(error);
  }
}
