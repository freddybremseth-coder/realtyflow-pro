import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };

// Ordinary public catalogue only: explicit projection prevents leaking
// private source/feed fields, internal commissions and unapproved descriptions.
// All searchable records must be *explicitly* website-visible.
const SAFE_CATALOGUE_COLUMNS = [
  "id", "ref", "title", "town", "location", "price", "bedrooms",
  "bathrooms", "area_m2", "plot_size", "property_type", "primary_image",
  "source", "status", "brand_id",
].join(",");

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const { brandKey } = params;
  const access = await requireBrandWorkspace(request, brandKey, "properties.catalog.read");
  if (!access.value) return access.response;
  const { searchParams } = new URL(request.url);
  const term = String(searchParams.get("q") || "").trim();
  const page = Number(searchParams.get("page") || "1");
  if (term.length > 80 || !Number.isSafeInteger(page) || page < 1 || page > 100) {
    return NextResponse.json({ ok: false, error: { code: "INVALID_SEARCH" } }, { status: 400, headers: noStore });
  }
  const perPage = 24;
  let query = access.value.supabase.from("properties")
    .select(SAFE_CATALOGUE_COLUMNS)
    .eq("show_on_website", true)
    .eq("website_visible", true)
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);
  if (term) {
    // Escape PostgREST OR-expression metacharacters rather than interpolate SQL.
    const safe = term.replace(/[%_\\]/g, "").replace(/[(),.]/g, " ").trim();
    if (safe) query = query.or(`title.ilike.%${safe}%,town.ilike.%${safe}%,location.ilike.%${safe}%,ref.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: { code: "CATALOGUE_UNAVAILABLE" } }, {
    status: 503, headers: noStore,
  });
  return NextResponse.json({
    ok: true, brand: brandKey, page, pageSize: perPage,
    scope: "published_public_catalogue", properties: data || [],
  }, { headers: noStore });
}
