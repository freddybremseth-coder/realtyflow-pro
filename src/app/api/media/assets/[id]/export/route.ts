import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { exportMediaAssetToContentHub } from "@/services/media/content-hub-export";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";
import { assertMediaRateLimit } from "@/services/media/api-guards";

export const dynamic = "force-dynamic";

const exportSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;
    assertMediaRateLimit(context.scope.actorEmail, "export");

    const body = exportSchema.parse(await request.json().catch(() => ({})));
    const publication = await exportMediaAssetToContentHub(context.supabase, {
      organizationId: context.scope.organizationId,
      actorEmail: context.scope.actorEmail,
      assetId: params.id,
      title: body.title,
      description: body.description,
    });

    // Ad Campaign Generator uses Media Library assets as the canonical output.
    // Keep the campaign card in sync when the same export endpoint is used.
    await context.supabase
      .from("ad_creatives")
      .update({ pushed_to_hub: true })
      .eq("output_asset_id", params.id)
      .catch(() => undefined);

    return NextResponse.json({ publication });
  } catch (error) {
    return jsonError(error, 400);
  }
}
