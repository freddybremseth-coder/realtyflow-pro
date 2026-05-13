import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { classifyPropertyForBrands } from "@/lib/realty/brand-rules";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getAllProperties(supabase: NonNullable<ReturnType<typeof getSupabase>>) {
  const properties: Record<string, unknown>[] = [];
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

    properties.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return properties;
}

export async function POST() {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });

  try {
    const properties = await getAllProperties(supabase);
    const propertyIds = properties
      .map((property) => property.id)
      .filter((id): id is string => typeof id === "string" && Boolean(id));

    const { data: manualRows } = await supabase
      .from("property_brand_visibility")
      .select("property_id, brand_id")
      .in("property_id", propertyIds)
      .eq("manual_override", true);

    const manualOverrideKeys = new Set(
      (manualRows || []).map((row) => `${row.property_id}:${row.brand_id}`),
    );

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

    const batchSize = 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
      const { error } = await supabase
        .from("property_brand_visibility")
        .upsert(rows.slice(i, i + batchSize), { onConflict: "property_id,brand_id" });

      if (error) throw error;
    }

    return NextResponse.json({
      properties: properties.length,
      visibilityRows: rows.length,
      manualOverridesSkipped: manualOverrideKeys.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to rebuild brand visibility";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
