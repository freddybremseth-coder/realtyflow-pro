import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  classifyPropertyForBrands,
  normalizeBrandId,
  propertyMatchesBrand,
} from "@/lib/realty/brand-rules";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function isWebsiteVisible(property: Record<string, unknown>) {
  return property.show_on_website !== false && property.website_visible !== false;
}

async function getAllProperties(supabase: ReturnType<typeof getSupabase>) {
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
  supabase: ReturnType<typeof getSupabase>,
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
  supabase: ReturnType<typeof getSupabase>,
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

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
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
  const supabase = getSupabase();
  const body = await req.json();
  const items: Record<string, unknown>[] = Array.isArray(body) ? body : [body];

  // For each item with a ref, delete the old one then insert new - atomically per small batch
  const batchSize = 50;
  let deduplicated = 0;
  let inserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    // Delete existing with matching refs in this batch
    const batchRefs = batch
      .map((item) => item.ref as string | undefined)
      .filter((r): r is string => Boolean(r && r.trim()));

    if (batchRefs.length > 0) {
      const { data: deleted } = await supabase
        .from("properties")
        .delete()
        .in("ref", batchRefs)
        .select("id");
      deduplicated += deleted?.length || 0;
    }

    // Insert this batch
    const { data, error } = await supabase.from("properties").insert(batch).select("*");
    if (error) {
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      continue;
    }
    inserted += data?.length || 0;
    await upsertBrandVisibility(supabase, data || []);
  }

  if (errors.length > 0 && inserted === 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
  }

  return NextResponse.json({
    inserted,
    deduplicated,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = getSupabase();
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
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("properties").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
