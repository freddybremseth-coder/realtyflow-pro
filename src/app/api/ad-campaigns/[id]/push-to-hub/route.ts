// ─── POST /api/ad-campaigns/:id/push-to-hub ────────────────────────────
// Pushes selected (or top-pick) creatives into Content Hub drafts
// so they can be reviewed, scheduled, and published.
//
// Body: { creative_ids?: string[]  (default: all top picks) }
import { NextRequest, NextResponse } from "next/server";
import { getMediaApiContext } from "@/services/media/api-context";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const context = await getMediaApiContext(req);
  if ("error" in context) return context.error;
  const body = await req.json().catch(() => ({}));
  const supabase = context.supabase;

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

  const drafts = creatives.map((c) => ({
    brand_id: campaign.brand_id || "zeneco",
    // These are still photographs; a 9:16 aspect ratio does not create a reel.
    content_type: "image_post",
    title: `${campaign.name} · ${c.angle} (${c.scene_id} ${c.aspect_ratio})`,
    description: [
      `Product: ${campaign.product_name}`,
      c.caption_primary ?? null,
      c.caption_secondary ? `Alt: ${c.caption_secondary}` : null,
      c.hashtags?.length ? c.hashtags.join(" ") : null,
      "",
      `Ad campaign: ${campaign.name}`,
      `Creative: ${c.scene_id} · ${c.angle} · ${c.aspect_ratio}`,
    ].filter(Boolean).join("\n"),
    tags: [
      "ad-campaign",
      campaign.product_name,
      c.angle,
      c.scene_id,
      c.aspect_ratio,
      ...(c.hashtags || []).map((tag: string) => tag.replace(/^#/, "")),
      ...(c.metadata_json?.creative_image_label_review_required === true ? ["needs-product-label-review"] : []),
    ].filter(Boolean),
    status: "draft",
    ai_generated: true,
    ai_title: `${campaign.name} · ${c.angle}`,
    ai_description: c.caption_primary ?? null,
    ai_tags: c.hashtags || [],
    ai_image_url: c.image_url,
    thumbnail_url: c.thumbnail_url || null,
    campaign_id: params.id,
    media_urls: c.image_url ? [c.image_url] : [],
    content_features: {
      requires_label_review: c.metadata_json?.creative_image_label_review_required === true,
      label_approval_pending: c.metadata_json?.creative_image_label_review_required === true,
      source_ad_creative_id: c.id,
      secondary_caption: c.caption_secondary || null,
      ...(c.metadata_json?.creative_image_label_review_required === true ? { product_volume: "3 L" } : {}),
    },
    scheduled_platforms: c.aspect_ratio === "9:16" ? ["instagram", "facebook"] : ["facebook", "instagram", "linkedin"],
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from("content_publications")
    .insert(drafts)
    .select("id");
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Mark creatives as pushed
  await Promise.all(creatives.map((c, index) =>
    supabase
      .from("ad_creatives")
      .update({ pushed_to_hub: true, hub_content_id: inserted?.[index]?.id ?? null })
      .eq("id", c.id)
  ));

  return NextResponse.json({ pushed: inserted?.length ?? 0, content_hub: true });
}
