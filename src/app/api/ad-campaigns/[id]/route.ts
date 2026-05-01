// ─── GET /api/ad-campaigns/:id  →  campaign + creatives ────────────────
// ─── PATCH /api/ad-campaigns/:id  →  update intake/status ───────────────
// ─── DELETE /api/ad-campaigns/:id ───────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();
  const { data: campaign, error } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const { data: creatives } = await supabase
    .from("ad_creatives")
    .select("*")
    .eq("campaign_id", params.id)
    .order("scene_id", { ascending: true })
    .order("aspect_ratio", { ascending: true });

  return NextResponse.json({ campaign, creatives: creatives ?? [] });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const allowed = [
    "name", "product_name", "product_image_url", "label_description",
    "target_markets", "audience_segments", "brand_voice", "funnel_stage",
    "offer", "off_limits", "status", "matrix",
  ];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

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
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();
  const { error } = await supabase.from("ad_campaigns").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
