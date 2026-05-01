// ─── POST /api/ad-campaigns/:id/delivery  →  Step 4 ────────────────────
// Generates captions per angle + top 5 A/B picks. Persists to ad_campaigns.delivery
// AND updates the chosen creatives (is_top_pick=true, pick_rank, captions, hashtags).
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { generateCaptions, pickTopFive } from "@/services/ads/claude-orchestrator";
import { BRANDS } from "@/lib/constants";
import type { AdCampaign, AdCreative, CampaignDelivery } from "@/types/ads";

export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();
  const { data: campaign, error } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { data: creatives } = await supabase
    .from("ad_creatives")
    .select("*")
    .eq("campaign_id", params.id)
    .eq("status", "completed");

  if (!creatives || creatives.length === 0) {
    return NextResponse.json({ error: "No completed creatives to package" }, { status: 400 });
  }

  const brand = BRANDS.find((b) => b.id === campaign.brand_id);
  const brandName = brand?.name ?? "Brand";
  const brandType = brand?.type ?? "ecommerce";

  // 1. Captions per angle (in target market languages)
  const angles = Array.from(new Set(creatives.map((c) => c.angle)));
  const captionPacks = await generateCaptions({
    product_name: campaign.product_name,
    brand_name: brandName,
    brand_type: brandType,
    brand_voice: campaign.brand_voice ?? brand?.tone ?? null,
    target_markets: campaign.target_markets ?? [],
    offer: campaign.offer,
    angles,
  });

  // 2. Apply caption packs to all creatives in each angle
  for (const angle of angles) {
    const pack = captionPacks[angle];
    if (!pack) continue;
    await supabase
      .from("ad_creatives")
      .update({
        caption_primary: pack.primary,
        caption_secondary: pack.secondary ?? null,
        hashtags: pack.hashtags,
      })
      .eq("campaign_id", params.id)
      .eq("angle", angle);
  }

  // 3. Top 5 picks
  const top5 = await pickTopFive({
    campaign: campaign as AdCampaign,
    creatives: creatives as AdCreative[],
  });

  // Reset prior picks then mark new ones
  await supabase
    .from("ad_creatives")
    .update({ is_top_pick: false, pick_rank: null })
    .eq("campaign_id", params.id);

  for (const pick of top5) {
    await supabase
      .from("ad_creatives")
      .update({ is_top_pick: true, pick_rank: pick.rank })
      .eq("id", pick.creative_id);
  }

  // 4. Build delivery payload
  const delivery: CampaignDelivery = {
    top_picks: top5,
    per_angle_captions: captionPacks,
    reels_scripts: [],          // can be expanded later
    launch_recommendations: {
      daily_budget_eur: 20,
      audience_segments: campaign.audience_segments ?? [],
      metric_targets: [
        { metric: "CTR", target: ">1.5%" },
        { metric: "CPC", target: "<€0.50" },
        { metric: "ThumbStop", target: ">25%" },
        { metric: "CPM", target: "<€8" },
      ],
      refresh_cadence_days: 14,
    },
  };

  await supabase
    .from("ad_campaigns")
    .update({ delivery, status: "completed" })
    .eq("id", params.id);

  return NextResponse.json({ delivery, status: "completed" });
}
