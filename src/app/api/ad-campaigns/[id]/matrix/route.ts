// ─── POST /api/ad-campaigns/:id/matrix  →  Step 2 ──────────────────────
// Builds the 25-scene matrix from the brand template. Persists the matrix
// AND seeds 50 ad_creatives rows with status='pending' so the UI can show
// progress immediately when generation kicks off.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { buildMatrix } from "@/services/ads/claude-orchestrator";
import { buildPrompt } from "@/services/ads/prompt-builder";
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
  const brandType = brand?.type ?? "ecommerce";
  const matrix = buildMatrix(brandType);

  // Pre-seed creative rows so progress UI can render immediately
  const rows = [];
  for (const scene of matrix.scenes) {
    for (const ratio of matrix.aspect_ratios) {
      const prompt = buildPrompt({
        product_name: campaign.product_name,
        label_description: campaign.label_description,
        scene_body: scene.prompt_body,
      });
      rows.push({
        campaign_id: campaign.id,
        scene_id: scene.id,
        angle: scene.angle,
        mood: scene.mood,
        scene_description: scene.prompt_body.slice(0, 200),
        aspect_ratio: ratio,
        prompt,
        status: "pending",
      });
    }
  }

  // Replace existing creatives if matrix is rebuilt
  await supabase.from("ad_creatives").delete().eq("campaign_id", campaign.id);
  const { error: insertErr } = await supabase.from("ad_creatives").insert(rows);
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await supabase
    .from("ad_campaigns")
    .update({
      matrix,
      total_creatives: rows.length,
      status: "matrix_pending",
      estimated_cost_usd: rows.length * 0.04,
    })
    .eq("id", params.id);

  return NextResponse.json({ matrix, seeded: rows.length });
}
