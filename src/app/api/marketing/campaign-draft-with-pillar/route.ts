import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { growthBrandDefinition, isPilotChannel } from "@/lib/marketing/brand-registry";
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
  if (!body.brandId || !body.masterIdea || !body.goal?.kind || !body.contentPillar || !body.channel) {
    return NextResponse.json({ error: "brandId, channel, masterIdea, goal.kind og contentPillar er påkrevd" }, { status: 400 });
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
  if (!isPilotChannel(body.brandId, body.channel)) {
    return NextResponse.json({
      error: "CHANNEL_NOT_PILOT_READY",
      brandId: body.brandId,
      channel: body.channel,
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
        .select("content_id, genome")
        .eq("content_id", contentId)
        .maybeSingle();
      if (content?.content_id) {
        await supabase
          .from("marketing_content")
          .update({ genome: { ...(content.genome ?? {}), contentPillar: body.contentPillar } })
          .eq("content_id", contentId);
      }

      await supabase.from("marketing_events").insert({
        event_type: "content_pillar_assignment",
        brand_id: body.brandId,
        content_id: contentId,
        channel: body.channel,
        genome: { contentPillar: body.contentPillar },
        correlation_id: result.correlationId,
        occurred_at: new Date().toISOString(),
        metadata: {
          source: "manual_canary_selection",
          content_pillar: body.contentPillar,
          approval_mode: "manual-review",
          marketing_run_id: result.marketingRunId,
        },
      });
    }

    return NextResponse.json({ ...result, contentPillar: body.contentPillar });
  } catch (err) {
    const message = err instanceof Error ? err.message : "campaign-draft-with-pillar feilet";
    const failClosed = message.startsWith("MISSING_") || message.startsWith("INVENTORY_") || message.includes("APPROVAL_SERVICE_UNAVAILABLE");
    return NextResponse.json({ error: message }, { status: failClosed ? 409 : 500 });
  }
}
