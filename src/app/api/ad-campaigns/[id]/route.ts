// ─── GET /api/ad-campaigns/:id  →  campaign + creatives ────────────────
// ─── PATCH /api/ad-campaigns/:id  →  update campaign settings ──────────
// ─── DELETE /api/ad-campaigns/:id ───────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient();
  const { data: campaign, error } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const { data: creatives, error: creativeError } = await supabase
    .from("ad_creatives")
    .select("*")
    .eq("campaign_id", params.id)
    .order("concept_group", { ascending: true, nullsFirst: false })
    .order("variant_index", { ascending: true })
    .order("aspect_ratio", { ascending: true });
  if (creativeError) return NextResponse.json({ error: creativeError.message }, { status: 500 });

  return NextResponse.json({ campaign, creatives: creatives ?? [] });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await request.json();
  const allowed = [
    "name",
    "product_name",
    "product_image_url",
    "label_description",
    "target_markets",
    "audience_segments",
    "brand_voice",
    "funnel_stage",
    "offer",
    "off_limits",
    "status",
    "matrix",
    "aspect_ratios",
    "total_creatives",
    "image_provider",
    "campaign_style",
    "overlay_mode",
    "preserve_product_identity",
    "concept_count",
    "variants_per_concept",
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) update[key] = body[key];
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Ingen gyldige kampanjeendringer ble sendt." }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("ad_campaigns")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient();
  const { data: campaign } = await supabase
    .from("ad_campaigns")
    .select("media_project_id")
    .eq("id", params.id)
    .maybeSingle();

  const { error } = await supabase.from("ad_campaigns").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (campaign?.media_project_id) {
    const { error: archiveError } = await supabase
      .from("media_projects")
      .update({ status: "archived" })
      .eq("id", campaign.media_project_id);

    if (archiveError) {
      console.warn("[Ad Campaigns] Could not archive linked Media Studio project", {
        campaignId: params.id,
        projectId: campaign.media_project_id,
        code: archiveError.code,
        message: archiveError.message,
      });
    }
  }

  return NextResponse.json({ ok: true, mediaPreserved: true });
}
