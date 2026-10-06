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
  "bathrooms", "area_m2", "plot_size", "property_type", "primary_image", "source", "pool",
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
    pool: typeof item.pool === "boolean" ? item.pool : null,
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
  const area = String(searchParams.get("area") || "").trim();
  const propertyType = String(searchParams.get("type") || "").trim();
  const sort = String(searchParams.get("sort") || "newest").trim();
  const page = Number(searchParams.get("page") || "1");
  const numeric = (name: string) => {
    const raw = String(searchParams.get(name) || "").trim();
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : Number.NaN;
  };
  const integer = (name: string) => {
    const value = numeric(name);
    return value === null ? null : Number.isInteger(value) ? value : Number.NaN;
  };
  const minPrice = numeric("priceMin");
  const maxPrice = numeric("priceMax");
  const minBedrooms = integer("bedroomsMin");
  const minBathrooms = integer("bathroomsMin");
  const minArea = numeric("areaMin");
  const minPlot = numeric("plotMin");
  const poolRaw = String(searchParams.get("pool") || "").trim().toLowerCase();
  const pool = poolRaw === "" || poolRaw === "any" ? null
    : poolRaw === "true" ? true
    : poolRaw === "false" ? false
    : "invalid";
  if (
    term.length > 80 || area.length > 80 || propertyType.length > 80 ||
    !Number.isSafeInteger(page) || page < 1 || page > 100 ||
    !["newest", "price_asc", "price_desc", "area_desc"].includes(sort) ||
    pool === "invalid" ||
    [minPrice, maxPrice, minBedrooms, minBathrooms, minArea, minPlot]
      .some(value => value !== null && !Number.isFinite(value)) ||
    (minPrice !== null && (minPrice < 0 || minPrice > 100000000)) ||
    (maxPrice !== null && (maxPrice < 0 || maxPrice > 100000000)) ||
    (minPrice !== null && maxPrice !== null && minPrice > maxPrice) ||
    (minBedrooms !== null && (minBedrooms < 0 || minBedrooms > 20)) ||
    (minBathrooms !== null && (minBathrooms < 0 || minBathrooms > 20)) ||
    (minArea !== null && (minArea < 0 || minArea > 1000000)) ||
    (minPlot !== null && (minPlot < 0 || minPlot > 10000000))
  ) {
    return NextResponse.json({ ok: false, error: { code: "INVALID_SEARCH" } }, { status: 400, headers: noStore });
  }
  const perPage = 24;
  const cleanText = (value: string) => value
    ? value.replace(/[^\p{L}\p{N}\s._-]/gu, " ").replace(/\s+/g, " ").trim()
    : "";
  const normalizedSearch = cleanText(term);
  const safeSearch = normalizedSearch.includes("@")
    ? normalizedSearch
    : normalizedSearch.replace(/[.,()]/g, " ").replace(/\s+/g, " ").trim();
  const safeArea = cleanText(area);
  const safePropertyType = cleanText(propertyType);

  if (access.value.verifiedUserId) {
    const { data, error } = await access.value.supabase.rpc("workspace_brand_property_catalogue", {
      p_brand_key: brandKey,
      p_user_id: access.value.verifiedUserId,
      p_email: access.value.verifiedEmail,
      p_offset: (page - 1) * perPage,
      p_search: safeSearch,
      p_area: safeArea,
      p_property_type: safePropertyType,
      p_price_min: minPrice,
      p_price_max: maxPrice,
      p_bedrooms_min: minBedrooms,
      p_bathrooms_min: minBathrooms,
      p_pool: pool,
      p_area_min: minArea,
      p_plot_min: minPlot,
      p_sort: sort,
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
      matchedCount: Number.isFinite(Number(data.matchedCount)) ? Number(data.matchedCount) : null,
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
  if (safeArea) query = query.or(`town.ilike.%${safeArea}%,location.ilike.%${safeArea}%`);
  if (safePropertyType) query = query.ilike("property_type", `%${safePropertyType}%`);
  if (minPrice !== null) query = query.gte("price", minPrice);
  if (maxPrice !== null) query = query.lte("price", maxPrice);
  if (minBedrooms !== null) query = query.gte("bedrooms", minBedrooms);
  if (minBathrooms !== null) query = query.gte("bathrooms", minBathrooms);
  if (pool !== null) query = query.eq("pool", pool);
  if (minArea !== null) query = query.gte("area_m2", minArea);
  if (minPlot !== null) query = query.gte("plot_size", minPlot);
  if (sort === "price_asc") query = query.order("price", { ascending: true, nullsFirst: false });
  else if (sort === "price_desc") query = query.order("price", { ascending: false, nullsFirst: false });
  else if (sort === "area_desc") query = query.order("area_m2", { ascending: false, nullsFirst: false });
  else query = query.order("created_at", { ascending: false });
  // Fetch one look-ahead row so hasMore reflects reality instead of assuming
  // that a full page guarantees another page.
  const { data, error } = await query.range((page - 1) * perPage, page * perPage);
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
    matchedCount: null,
  }, { headers: noStore });
}
