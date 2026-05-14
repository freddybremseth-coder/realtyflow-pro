import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const REALTY_BRANDS = ["zeneco", "pinosoecolife"];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const { id } = await params;
  const { data, error } = await supabase
    .from("property_brand_visibility")
    .select("brand_id, visible, manual_override, reason, score")
    .eq("property_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const visibleBrandIds = (data || [])
    .filter((row) => row.visible === true)
    .map((row) => row.brand_id as string);

  return NextResponse.json({
    propertyId: id,
    visibleBrandIds,
    rows: data || [],
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const { id } = await params;
  const body = await request.json();
  const visibleBrandIds = new Set(
    (Array.isArray(body.visibleBrandIds) ? (body.visibleBrandIds as unknown[]) : [])
      .filter((value): value is string => typeof value === "string" && REALTY_BRANDS.includes(value)),
  );

  const rows = REALTY_BRANDS.map((brandId) => ({
    property_id: id,
    brand_id: brandId,
    visible: visibleBrandIds.has(brandId),
    reason: visibleBrandIds.has(brandId) ? "manual publish target" : "manual hidden from brand",
    score: visibleBrandIds.has(brandId) ? 100 : 0,
    manual_override: true,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("property_brand_visibility")
    .upsert(rows, { onConflict: "property_id,brand_id" })
    .select("brand_id, visible, manual_override, reason, score");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    propertyId: id,
    visibleBrandIds: (data || []).filter((row) => row.visible).map((row) => row.brand_id),
    rows: data || [],
  });
}
