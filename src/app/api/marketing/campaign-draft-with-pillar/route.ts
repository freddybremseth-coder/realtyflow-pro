import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { growthBrandDefinition } from "@/lib/marketing/brand-registry";
import { createCampaignDraft, getServiceSupabase, type CreateCampaignDraftInput } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PillarDraftInput = CreateCampaignDraftInput & { contentPillar: string };

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as Partial<PillarDraftInput>;
  if (!body.brandId || !body.masterIdea || !body.goal?.kind || !body.contentPillar) {
    return NextResponse.json({ error: "brandId, masterIdea, goal.kind og contentPillar er påkrevd" }, { status: 400 });
  }

  const definition = growthBrandDefinition(body.brandId);
  const allowedPillars = definition?.contentPillars ?? [];
  if (!definition || !allowedPillars.includes(body.contentPillar)) {
    return NextResponse.json({
      error: "CONTENT_PILLAR_NOT_ALLOWED",
      brandId: body.brandId,
      contentPillar: body.contentPillar,
      allowedPillars,
    }, { status: 409 });
  }

  try {
    const result = await createCampaignDraft(supabase, {
      brandId: body.brandId,
      masterIdea: body.masterIdea,
      goal: { kind: body.goal.kind, target: body.goal.target ?? 10, horizonDays: body.goal.horizonDays ?? 30 },
      focus: body.focus,
      service: body.service,
      market: body.market,
      language: body.language,
      publishingAccountId: body.publishingAccountId,
      publishingCapacityPerWeek: body.publishingCapacityPerWeek,
      legacyPublicationId: body.legacyPublicationId,
      channel: body.channel,
      mediaUrl: body.mediaUrl,
      useInventoryProperty: body.useInventoryProperty,
      propertyId: body.propertyId,
    });

    const contentIds = result.results.map((row) => row.contentId).filter(Boolean);
    for (const contentId of contentIds) {
      const { data: asset } = await supabase
        .from("marketing_assets")
        .select("id, genome, updated_at")
        .eq("content_id", contentId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (asset?.id) {
        await supabase
          .from("marketing_assets")
          .update({ genome: { ...(asset.genome ?? {}), contentPillar: body.contentPillar } })
          .eq("id", asset.id);
      }

      const { data: content } = await supabase
        .from("marketing_content")
        .select("id, genome")
        .eq("content_id", contentId)
        .maybeSingle();
      if (content?.id) {
        await supabase
          .from("marketing_content")
          .update({ genome: { ...(content.genome ?? {}), contentPillar: body.contentPillar } })
          .eq("id", content.id);
      }
    }

    return NextResponse.json({ ...result, contentPillar: body.contentPillar });
  } catch (err) {
    const message = err instanceof Error ? err.message : "campaign-draft-with-pillar feilet";
    const failClosed = message.startsWith("MISSING_") || message.startsWith("INVENTORY_") || message.includes("APPROVAL_SERVICE_UNAVAILABLE");
    return NextResponse.json({ error: message }, { status: failClosed ? 409 : 500 });
  }
}
