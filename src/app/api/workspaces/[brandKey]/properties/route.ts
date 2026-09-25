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
].join(",");

const safeCatalogueRow = (row: unknown) => {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const item = row as Record<string, unknown>;
  if (typeof item.id !== "string" || !item.id) return null;
  const textOrNull = (value: unknown) => typeof value === "string" ? value : null;
  const numberOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
  return {
    id: item.id,
    ref: textOrNull(item.ref),
    title: textOrNull(item.title),
    town: textOrNull(item.town),
    location: textOrNull(item.location),
    price: numberOrNull(item.price),
    bedrooms: numberOrNull(item.bedrooms),
    bathrooms: numberOrNull(item.bathrooms),
    area_m2: numberOrNull(item.area_m2),
    plot_size: numberOrNull(item.plot_size),
    property_type: textOrNull(item.property_type),
    primary_image: textOrNull(item.primary_image),
  };
};

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
    .eq("website_visible", true);
  if (term) {
    // Escape PostgREST OR-expression metacharacters rather than interpolate SQL.
    const safe = term.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
    if (safe) query = query.or(`title.ilike.%${safe}%,town.ilike.%${safe}%,location.ilike.%${safe}%,ref.ilike.%${safe}%`);
  }
  const { data, error } = await query.order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);
  if (error) return NextResponse.json({ ok: false, error: { code: "CATALOGUE_UNAVAILABLE" } }, {
    status: 503, headers: noStore,
  });
  // Service-role reads are projected again at the response boundary. If a
  // future query/view/mock accidentally returns source, status, commissions,
  // owner metadata or another internal field, it is not serialized to staff.
  const properties = (data || []).map(safeCatalogueRow).filter(Boolean);
  return NextResponse.json({
    ok: true, brand: brandKey, page, pageSize: perPage,
    scope: "published_public_catalogue", properties,
  }, { headers: noStore });
}
