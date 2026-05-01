// ─── GET /api/ad-campaigns  →  list campaigns ───────────────────────────
// ─── POST /api/ad-campaigns  →  create new campaign (intake) ────────────
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const url = new URL(req.url);
  const brandId = url.searchParams.get("brand_id");

  let q = supabase.from("ad_campaigns").select("*").order("created_at", { ascending: false });
  if (brandId) q = q.eq("brand_id", brandId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    brand_id,
    name,
    product_name,
    product_image_url,
    label_description,
    target_markets = [],
    audience_segments = [],
    brand_voice = null,
    funnel_stage = "cold",
    offer = null,
    off_limits = null,
  } = body || {};

  if (!name || !product_name || !product_image_url || !label_description) {
    return NextResponse.json(
      { error: "Missing required fields: name, product_name, product_image_url, label_description" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("ad_campaigns")
    .insert({
      brand_id,
      name,
      product_name,
      product_image_url,
      label_description,
      target_markets,
      audience_segments,
      brand_voice,
      funnel_stage,
      offer,
      off_limits,
      status: "draft",
      total_creatives: 50,
      estimated_cost_usd: 50 * 0.04,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data }, { status: 201 });
}
