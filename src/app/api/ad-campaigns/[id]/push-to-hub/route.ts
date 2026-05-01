// ─── POST /api/ad-campaigns/:id/push-to-hub ────────────────────────────
// Pushes selected (or top-pick) creatives into the Content Hub as work_items
// so they can be reviewed, scheduled, and published.
//
// Body: { creative_ids?: string[]  (default: all top picks) }
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  const supabase = createServerClient();

  const { data: campaign } = await supabase
    .from("ad_campaigns")
    .select("name, brand_id, product_name")
    .eq("id", params.id)
    .single();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  let q = supabase
    .from("ad_creatives")
    .select("*")
    .eq("campaign_id", params.id)
    .eq("status", "completed")
    .eq("pushed_to_hub", false);

  if (Array.isArray(body.creative_ids) && body.creative_ids.length > 0) {
    q = q.in("id", body.creative_ids);
  } else {
    q = q.eq("is_top_pick", true);
  }

  const { data: creatives, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!creatives || creatives.length === 0) {
    return NextResponse.json({ pushed: 0, message: "No eligible creatives" });
  }

  const items = creatives.map((c) => ({
    title: `${campaign.name} · ${c.angle} (${c.scene_id} ${c.aspect_ratio})`,
    description: [
      `Product: ${campaign.product_name}`,
      `Caption: ${c.caption_primary ?? "(none)"}`,
      c.caption_secondary ? `Caption (alt): ${c.caption_secondary}` : null,
      c.hashtags?.length ? `Hashtags: ${c.hashtags.join(" ")}` : null,
      `Image: ${c.image_url ?? "(missing)"}`,
    ].filter(Boolean).join("\n"),
    status: "TO_DO",
    priority: c.is_top_pick ? "HIGH" : "MEDIUM",
    brand_id: campaign.brand_id,
    source_type: "content",
    metadata: {
      ad_campaign_id: params.id,
      ad_creative_id: c.id,
      scene_id: c.scene_id,
      angle: c.angle,
      aspect_ratio: c.aspect_ratio,
      image_url: c.image_url,
      caption_primary: c.caption_primary,
      caption_secondary: c.caption_secondary,
      hashtags: c.hashtags,
      is_top_pick: c.is_top_pick,
    },
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from("work_items")
    .insert(items)
    .select("id");
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Mark creatives as pushed
  const ids = creatives.map((c) => c.id);
  await supabase
    .from("ad_creatives")
    .update({ pushed_to_hub: true })
    .in("id", ids);

  return NextResponse.json({ pushed: inserted?.length ?? 0 });
}
