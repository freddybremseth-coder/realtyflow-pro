// ─── POST /api/ad-campaigns/:id/matrix  →  Step 2 ──────────────────────
// Builds a structured concept-family matrix and seeds ad_creatives rows.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  planAdCampaign,
  type AdCampaignStyle,
  type AdImageProvider,
  type AdOverlayMode,
} from "@/services/ads/campaign-planner";
import type { AspectRatio } from "@/types/ads";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await req.json().catch(() => ({}));
  const supabase = createServerClient();
  const { data: campaign, error } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const targetTotal = Math.min(
    Math.max(Number(body.target_total || campaign.total_creatives || 50), 5),
    50,
  );
  const ratios = (Array.isArray(body.aspect_ratios) && body.aspect_ratios.length
    ? body.aspect_ratios
    : campaign.aspect_ratios || ["1:1", "4:5", "9:16"]) as AspectRatio[];
  const providerMode = (campaign.image_provider === "replicate"
    ? "flux"
    : campaign.image_provider || "auto") as AdImageProvider;

  const planned = planAdCampaign({
    productName: campaign.product_name,
    productImageUrl: campaign.product_image_url,
    labelDescription: campaign.label_description,
    audienceSegments: campaign.audience_segments || [],
    targetMarkets: campaign.target_markets || [],
    brandVoice: campaign.brand_voice,
    offer: campaign.offer,
    providerMode,
    campaignStyle: (campaign.campaign_style || "mixed") as AdCampaignStyle,
    overlayMode: (campaign.overlay_mode || "suggestions") as AdOverlayMode,
    preserveProductIdentity: campaign.preserve_product_identity !== false,
    totalCreatives: targetTotal,
    aspectRatios: ratios,
    conceptCount: Number(campaign.concept_count || 10),
    variantsPerConcept: Number(campaign.variants_per_concept || 5),
  });

  const rows = planned.creatives.map((creative) => ({
    campaign_id: campaign.id,
    scene_id: creative.sceneId,
    concept_group: creative.conceptGroup,
    variant_index: creative.variantIndex,
    angle: creative.angle,
    mood: creative.mood,
    scene_description: creative.sceneDescription,
    aspect_ratio: creative.aspectRatio,
    prompt: creative.prompt,
    provider: creative.provider,
    model: creative.model,
    overlay_headline: creative.overlayHeadline,
    overlay_subheadline: creative.overlaySubheadline,
    overlay_cta: creative.overlayCta,
    overlay_badge: creative.overlayBadge,
    overlay_applied: false,
    status: "pending",
    metadata_json: {
      requestedProvider: creative.provider,
      overlayMode: campaign.overlay_mode || "suggestions",
      preserveProductIdentity: campaign.preserve_product_identity !== false,
    },
  }));

  await supabase.from("ad_creatives").delete().eq("campaign_id", campaign.id);
  const { error: insertError } = await supabase.from("ad_creatives").insert(rows);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("ad_campaigns")
    .update({
      matrix: planned.matrix,
      provider_strategy: planned.providerStrategy,
      total_creatives: rows.length,
      status: "matrix_pending",
      estimated_cost_usd: planned.estimatedCostUsd,
      concept_count: planned.concepts.length,
      variants_per_concept: Math.max(...planned.creatives.map((item) => item.variantIndex)),
      error: null,
    })
    .eq("id", params.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    matrix: planned.matrix,
    provider_strategy: planned.providerStrategy,
    estimated_cost_usd: planned.estimatedCostUsd,
    seeded: rows.length,
  });
}
