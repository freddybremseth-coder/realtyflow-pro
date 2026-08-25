import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { creativeTrackingCode } from "@/lib/ads/creative-dna";
import { addCreativeTouch, creativeEvidence, emptyCreativeMetrics } from "@/lib/ads/creative-performance";
import { planCreativeMutations, variantCta, variantPrompt } from "@/lib/ads/creative-variants";

const requestSchema = z.object({
  count: z.number().int().min(1).max(20).default(5),
  mode: z.enum(["winner", "manual"]).default("winner"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; creativeId: string } },
) {
  const supabase = createServerClient();
  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid variant request", details: parsed.error.flatten() }, { status: 400 });

  const { data: campaign, error: campaignError } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("id", params.id)
    .single();
  if (campaignError || !campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const { data: parent, error: parentError } = await supabase
    .from("ad_creatives")
    .select("*")
    .eq("id", params.creativeId)
    .eq("campaign_id", params.id)
    .single();
  if (parentError || !parent) return NextResponse.json({ error: "Creative not found in campaign" }, { status: 404 });

  const { data: touches, error: touchError } = await supabase
    .from("marketing_touchpoints")
    .select("touch_type,commission_eur")
    .eq("creative_variant_id", params.creativeId)
    .limit(20000);
  if (touchError) return NextResponse.json({ error: touchError.message }, { status: 500 });

  const metrics = emptyCreativeMetrics();
  for (const touch of touches ?? []) addCreativeTouch(metrics, touch as any);
  const evidence = creativeEvidence(metrics);
  if (parsed.data.mode === "winner" && !["moderate", "strong"].includes(evidence)) {
    return NextResponse.json({
      error: "Insufficient evidence for winner cloning",
      evidence,
      metrics,
      hint: "Use mode=manual to create an explicitly manual hypothesis, or collect more downstream outcomes first.",
    }, { status: 409 });
  }

  const { data: siblings, error: siblingError } = await supabase
    .from("ad_creatives")
    .select("variant_index")
    .eq("campaign_id", params.id)
    .eq("concept_group", parent.concept_group)
    .order("variant_index", { ascending: false })
    .limit(1);
  if (siblingError) return NextResponse.json({ error: siblingError.message }, { status: 500 });

  const startIndex = Number(siblings?.[0]?.variant_index || parent.variant_index || 0) + 1;
  const mutations = planCreativeMutations(parsed.data.count);
  const generationType = parsed.data.mode === "winner" ? "winner_variant" : "manual_variant";
  const rows = mutations.map((mutation, offset) => {
    const variantIndex = startIndex + offset;
    const trackingCode = creativeTrackingCode({
      campaignId: String(campaign.id),
      conceptGroup: String(parent.concept_group || "variant"),
      variantIndex,
    });
    return {
      campaign_id: campaign.id,
      scene_id: `${parent.scene_id || parent.concept_group || "creative"}_v${variantIndex}`,
      concept_group: parent.concept_group,
      variant_index: variantIndex,
      angle: parent.angle,
      mood: parent.mood,
      scene_description: parent.scene_description,
      aspect_ratio: parent.aspect_ratio,
      prompt: variantPrompt(parent.prompt, mutation.instruction),
      provider: parent.provider || campaign.image_provider || "openart",
      model: parent.model,
      overlay_headline: parent.overlay_headline,
      overlay_subheadline: parent.overlay_subheadline,
      overlay_cta: variantCta(parent.overlay_cta, mutation.ordinal),
      overlay_badge: parent.overlay_badge,
      overlay_applied: false,
      tracking_code: trackingCode,
      growth_goal: parent.growth_goal || campaign.growth_goal || "unspecified",
      hook_family: parent.hook_family,
      language: parent.language || campaign.default_language || null,
      audience_segment: parent.audience_segment,
      creative_format: parent.creative_format,
      parent_creative_id: parent.id,
      generation_type: generationType,
      creative_dna: {
        ...(parent.creative_dna || {}),
        lineage: {
          parentCreativeId: parent.id,
          parentTrackingCode: parent.tracking_code || null,
          generationType,
          mutationAxis: mutation.axis,
          mutationOrdinal: mutation.ordinal,
          parentEvidenceAtCreation: evidence,
        },
      },
      metadata_json: {
        ...(parent.metadata_json || {}),
        trackingCode,
        lineage: {
          parentCreativeId: parent.id,
          generationType,
          mutationAxis: mutation.axis,
          evidence,
        },
      },
      status: "pending",
      is_top_pick: false,
      pick_rank: null,
      pushed_to_hub: false,
    };
  });

  const { data: inserted, error: insertError } = await supabase
    .from("ad_creatives")
    .insert(rows)
    .select("id,tracking_code,variant_index,generation_type,parent_creative_id,status");
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await supabase
    .from("ad_campaigns")
    .update({
      total_creatives: Number(campaign.total_creatives || 0) + (inserted?.length || 0),
      status: "matrix_pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaign.id);

  return NextResponse.json({
    created: inserted?.length || 0,
    mode: parsed.data.mode,
    evidence,
    parent: { id: parent.id, trackingCode: parent.tracking_code || null, metrics },
    variants: inserted || [],
    note: "Variants are seeded as pending drafts only. No ad is published or funded by this action.",
  }, { status: 201 });
}
