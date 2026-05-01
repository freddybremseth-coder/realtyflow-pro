// ─── POST /api/ad-campaigns/:id/research  →  Step 1 ────────────────────
// Builds the creative brief via Claude. Sets status → matrix_pending.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { generateBrief } from "@/services/ads/claude-orchestrator";
import { BRANDS } from "@/lib/constants";

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

  const brand = BRANDS.find((b) => b.id === campaign.brand_id);
  const brandName = brand?.name ?? "Unknown brand";
  const brandType = brand?.type ?? "ecommerce";

  try {
    const brief = await generateBrief({
      product_name: campaign.product_name,
      brand_name: brandName,
      brand_type: brandType,
      brand_voice: campaign.brand_voice ?? brand?.tone ?? null,
      target_markets: campaign.target_markets ?? [],
      audience_segments: campaign.audience_segments ?? [],
      funnel_stage: campaign.funnel_stage,
      offer: campaign.offer,
    });

    await supabase
      .from("ad_campaigns")
      .update({ brief, status: "matrix_pending" })
      .eq("id", params.id);

    return NextResponse.json({ brief, status: "matrix_pending" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("ad_campaigns")
      .update({ status: "failed", error: `Brief generation failed: ${msg}` })
      .eq("id", params.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
