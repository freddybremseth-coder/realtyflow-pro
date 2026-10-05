import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };

// Shared ordinary PUBLIC catalogue for buyer matching. The explicit projection
// prevents leaking import/feed credentials, commissions, pricing notes or
// internal descriptions. Source is a short catalogue label only.
const SAFE_CATALOGUE_COLUMNS = [
  "id", "ref", "title", "town", "location", "price", "bedrooms",
  "bathrooms", "area_m2", "plot_size", "property_type", "primary_image", "source",
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
    source: textOrNull(item.source),
    marketable_by_brands: Array.isArray(item.marketable_by_brands)
      ? item.marketable_by_brands.filter((value): value is string => typeof value === "string").slice(0, 20)
      : [],
    can_market_on_workspace_brand: item.can_market_on_workspace_brand === true,
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
  const safeSearch = term
    ? term.replace(/[^\p{L}\p{N}\s._\/-]/gu, " ").replace(/\s+/g, " ").trim()
    : "";

  if (access.value.verifiedUserId) {
    const { data, error } = await access.value.supabase.rpc("workspace_brand_property_catalogue", {
      p_brand_key: brandKey,
      p_user_id: access.value.verifiedUserId,
      p_email: access.value.verifiedEmail,
      p_offset: (page - 1) * perPage,
      p_search: safeSearch,
    });
    if (error) return NextResponse.json({ ok: false, error: { code: "CATALOGUE_UNAVAILABLE" } }, {
      status: 503, headers: noStore,
    });
    if (!data) return NextResponse.json({ ok: false, error: { code: "CATALOGUE_ACCESS_REVOKED" } }, {
      status: 403, headers: noStore,
    });
    if (!Array.isArray(data.properties) || typeof data.hasMore !== "boolean") {
      return NextResponse.json({ ok: false, error: { code: "CATALOGUE_UNAVAILABLE" } }, {
        status: 503, headers: noStore,
      });
    }
    const properties = data.properties.map(safeCatalogueRow).filter(Boolean).slice(0, perPage);
    return NextResponse.json({
      ok: true, brand: brandKey, page, pageSize: perPage,
      scope: "shared_public_catalogue", properties, hasMore: data.hasMore,
    }, { headers: noStore });
  }

  let query = access.value.supabase.from("properties")
    .select(SAFE_CATALOGUE_COLUMNS)
    .eq("show_on_website", true)
    .eq("website_visible", true)
    .eq("status", "TILGJENGELIG");
  if (safeSearch) {
    // Owner-only fallback path remains public-catalogue-only. Staff never
    // reaches this PostgREST query; their brand scope is enforced in one RPC.
    query = query.or(`title.ilike.%${safeSearch}%,town.ilike.%${safeSearch}%,location.ilike.%${safeSearch}%,ref.ilike.%${safeSearch}%`);
  }
  // Fetch one look-ahead row so hasMore reflects reality instead of assuming
  // that a full 24-row page guarantees another page.
  const { data, error } = await query.order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage);
  if (error) return NextResponse.json({ ok: false, error: { code: "CATALOGUE_UNAVAILABLE" } }, {
    status: 503, headers: noStore,
  });
  // Owner fallback uses the same safe public projection. Owners may create
  // content from this owner context; staff receives exact per-brand marketing
  // eligibility from the membership-checked RPC above.
  const safeRows = (data || []).map((row: unknown) => safeCatalogueRow({
    ...(row && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : {}),
    marketable_by_brands: [],
    can_market_on_workspace_brand: true,
  })).filter(Boolean);
  const hasMore = safeRows.length > perPage;
  const properties = safeRows.slice(0, perPage);
  return NextResponse.json({
    ok: true, brand: brandKey, page, pageSize: perPage,
    scope: "shared_public_catalogue_owner", properties,
    hasMore,
  }, { headers: noStore });
}
