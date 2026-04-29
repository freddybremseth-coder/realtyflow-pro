/**
 * Area profiles CRUD.
 *
 * GET    /api/area-profiles?brandId=zeneco           list all areas for a brand
 * POST   /api/area-profiles                          upsert (id optional). Body
 *                                                    contains all editable cols.
 *
 * Lookup-by-slug for PDF rendering happens server-side inside the property-pdf
 * routes — no public lookup endpoint here yet.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/utils";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId");
  const publicOnly = req.nextUrl.searchParams.get("public") === "1";
  if (!brandId) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const query = supabase
    .from("area_profiles")
    .select("*")
    .eq("brand_id", brandId)
    .order("name", { ascending: true });

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const profiles = publicOnly
    ? (data || []).filter((profile: { show_on_website?: boolean }) =>
        typeof profile.show_on_website === "boolean" ? profile.show_on_website : true,
      )
    : data || [];
  return NextResponse.json({ profiles });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string;
      brandId?: string;
      name?: string;
      slug?: string;
      country?: string | null;
      region?: string | null;
      heroBlurb?: string | null;
      description?: string | null;
      highlights?: string[] | null;
      climate?: string | null;
      lifestyle?: string | null;
      photoUrl?: string | null;
      showOnWebsite?: boolean | null;
    };

    const brandId = body.brandId;
    const name = body.name?.trim();
    if (!brandId || !name) {
      return NextResponse.json(
        { error: "brandId and name are required" },
        { status: 400 },
      );
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const slug = (body.slug && body.slug.trim()) || slugify(name);
    const row = {
      ...(body.id ? { id: body.id } : {}),
      brand_id: brandId,
      name,
      slug,
      country: body.country ?? null,
      region: body.region ?? null,
      hero_blurb: body.heroBlurb ?? null,
      description: body.description ?? null,
      highlights: Array.isArray(body.highlights) ? body.highlights : [],
      climate: body.climate ?? null,
      lifestyle: body.lifestyle ?? null,
      photo_url: body.photoUrl ?? null,
      show_on_website: body.showOnWebsite ?? false,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("area_profiles")
      .upsert(row, { onConflict: body.id ? "id" : "brand_id,slug" })
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
