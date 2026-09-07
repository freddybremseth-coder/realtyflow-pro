import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  classifyPropertyForBrands,
  normalizeBrandId,
  propertyMatchesBrand,
} from "@/lib/realty/brand-rules";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function isWebsiteVisible(property: Record<string, unknown>) {
  return property.show_on_website !== false && property.website_visible !== false;
}

async function getAllProperties(supabase: NonNullable<ReturnType<typeof getSupabase>>) {
  const allData: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allData;
}

async function filterPropertiesForBrand(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  properties: Record<string, unknown>[],
  rawBrandId: string,
) {
  const brandId = normalizeBrandId(rawBrandId);
  const visibleProperties = properties.filter(isWebsiteVisible);

  const { data: visibilityRows, error } = await supabase
    .from("property_brand_visibility")
    .select("property_id, visible")
    .eq("brand_id", brandId);

  if (!error && visibilityRows && visibilityRows.length > 0) {
    const visibilityById = new Map(
      visibilityRows.map((row) => [row.property_id, row.visible === true]),
    );

    return visibleProperties.filter((property) => {
      const propertyId = typeof property.id === "string" ? property.id : "";
      if (visibilityById.has(propertyId)) return visibilityById.get(propertyId);
      return propertyMatchesBrand(property, brandId);
    });
  }

  return visibleProperties.filter((property) => propertyMatchesBrand(property, brandId));
}

async function upsertBrandVisibility(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  properties: Record<string, unknown>[],
) {
  const propertyIds = properties
    .map((property) => property.id)
    .filter((id): id is string => typeof id === "string" && Boolean(id));

  let manualOverrideKeys = new Set<string>();
  if (propertyIds.length > 0) {
    const { data: manualRows } = await supabase
      .from("property_brand_visibility")
      .select("property_id, brand_id")
      .in("property_id", propertyIds)
      .eq("manual_override", true);

    manualOverrideKeys = new Set(
      (manualRows || []).map((row) => `${row.property_id}:${row.brand_id}`),
    );
  }

  const rows = properties.flatMap((property) => {
    const propertyId = property.id;
    if (typeof propertyId !== "string" || !propertyId) return [];

    return classifyPropertyForBrands(property)
      .filter((match) => !manualOverrideKeys.has(`${propertyId}:${match.brand_id}`))
      .map((match) => ({
        property_id: propertyId,
        brand_id: match.brand_id,
        visible: match.visible,
        reason: match.reason,
        score: match.score,
        manual_override: false,
        updated_at: new Date().toISOString(),
      }));
  });

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("property_brand_visibility")
    .upsert(rows, { onConflict: "property_id,brand_id" });

  if (error) {
    console.warn("[properties] brand visibility upsert skipped:", error.message);
  }
}

async function attachCachedFeedSourceFacts(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  items: Record<string, unknown>[],
) {
  const refs = Array.from(
    new Set(
      items
        .filter((item) => ["redsp", "xml"].includes(String(item.source || "").toLowerCase()))
        .map((item) => String(item.ref || "").trim())
        .filter(Boolean),
    ),
  );
  if (refs.length === 0) return items;

  const { data, error } = await supabase
    .from("property_feed_source_cache")
    .select("ref,source_description,amenities_no,floor_label,facing_source,usage_source,expires_at")
    .in("ref", refs)
    .gt("expires_at", new Date().toISOString());

  if (error) {
    console.warn("[properties] feed source cache unavailable:", error.message);
    return items;
  }

  const byRef = new Map((data || []).map((row) => [String(row.ref), row]));
  return items.map((item) => {
    const ref = String(item.ref || "").trim();
    const cached = byRef.get(ref);
    if (!cached) return item;

    return {
      ...item,
      ...(cached.source_description ? { source_description: cached.source_description } : {}),
      ...(Array.isArray(cached.amenities_no) && cached.amenities_no.length > 0
        ? { amenities_no: cached.amenities_no }
        : {}),
      ...(cached.floor_label ? { floor_label: cached.floor_label } : {}),
      ...(cached.facing_source ? { facing_source: cached.facing_source } : {}),
      ...(cached.usage_source ? { usage_source: cached.usage_source } : {}),
    };
  });
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const brandId = searchParams.get("brandId") || searchParams.get("brand_id");

  if (id) {
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  try {
    const allData = await getAllProperties(supabase);
    if (!brandId) return NextResponse.json(allData);

    const filteredData = await filterPropertiesForBrand(supabase, allData, brandId);
    return NextResponse.json(filteredData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch properties";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdminApi(req);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await req.json();
  const receivedItems: Record<string, unknown>[] = Array.isArray(body) ? body : [body];
  const items = await attachCachedFeedSourceFacts(supabase, receivedItems);

  const batchSize = 50;
  let deduplicated = 0;
  let inserted = 0;
  const errors: string[] = [];
  const propertyIds: string[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const withRef = batch.filter((item) => typeof item.ref === "string" && item.ref.trim());
    const withoutRef = batch.filter((item) => !(typeof item.ref === "string" && item.ref.trim()));
    const refs = withRef.map((item) => String(item.ref).trim());

    if (refs.length > 0) {
      const { data: existing, error: existingError } = await supabase
        .from("properties")
        .select("id,ref")
        .in("ref", refs);

      if (existingError) {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1} lookup: ${existingError.message}`);
      } else {
        deduplicated += existing?.length || 0;
      }

      const { data, error } = await supabase
        .from("properties")
        .upsert(withRef, { onConflict: "ref" })
        .select("*");

      if (error) {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1} upsert: ${error.message}`);
      } else {
        inserted += data?.length || 0;
        propertyIds.push(...(data || []).map((row) => String(row.id)).filter(Boolean));
        await upsertBrandVisibility(supabase, data || []);
      }
    }

    if (withoutRef.length > 0) {
      const { data, error } = await supabase
        .from("properties")
        .insert(withoutRef)
        .select("*");

      if (error) {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1} insert: ${error.message}`);
      } else {
        inserted += data?.length || 0;
        propertyIds.push(...(data || []).map((row) => String(row.id)).filter(Boolean));
        await upsertBrandVisibility(supabase, data || []);
      }
    }
  }

  if (errors.length > 0 && inserted === 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
  }

  return NextResponse.json({
    inserted,
    deduplicated,
    propertyIds: Array.from(new Set(propertyIds)),
    errors: errors.length > 0 ? errors : undefined,
  });
}

export async function PATCH(req: NextRequest) {
  const unauthorized = await requireAdminApi(req);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const body = await req.json();
  const { data, error } = await supabase
    .from("properties")
    .update(body)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const unauthorized = await requireAdminApi(req);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("properties").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
