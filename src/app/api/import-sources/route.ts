import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeBrandId } from "@/lib/realty/brand-rules";

const IMPORT_TYPES = new Set(["xml_url", "xml_upload", "csv", "api"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ sources: [] });

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId") || searchParams.get("brand_id");

  let query = supabase
    .from("import_sources")
    .select("*")
    .order("created_at", { ascending: false });

  if (brandId) {
    query = query.eq("brand_id", normalizeBrandId(brandId));
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ sources: [], error: error.message }, { status: 500 });

  return NextResponse.json({ sources: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const body = await request.json();
  const rawBrandId = body.brand_id || body.brandId;
  const brandId = normalizeBrandId(rawBrandId);
  const type = body.type || "xml_url";

  if (!rawBrandId || !brandId) {
    return NextResponse.json({ error: "brand_id is required" }, { status: 400 });
  }

  if (!IMPORT_TYPES.has(type)) {
    return NextResponse.json({ error: `Unsupported import type: ${type}` }, { status: 400 });
  }

  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const payload = {
    ...(body.id ? { id: body.id } : {}),
    brand_id: brandId,
    name: body.name,
    type,
    url: body.url || null,
    mapping_config: body.mapping_config || body.mappingConfig || {},
    active: body.active ?? true,
    last_imported_at: body.last_imported_at || body.lastImportedAt || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("import_sources")
    .upsert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
