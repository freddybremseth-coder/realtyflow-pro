import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  existingEditorialHasSameSource,
  generatePropertyEditorialNo,
} from "@/lib/realty/property-editorial-no";

export const maxDuration = 60;

const MAX_BATCH = 12;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, MAX_BATCH);
}

function editorialDescription(editorial: {
  intro_no: string;
  bullets_no: string[];
}) {
  const bullets = editorial.bullets_no.map((item) => `• ${item}`).join("\n");
  return [editorial.intro_no, bullets].filter(Boolean).join("\n");
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdminApi(req);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const propertyIds = uniqueIds(body?.propertyIds);
  if (propertyIds.length === 0) {
    return NextResponse.json({ error: "propertyIds required" }, { status: 400 });
  }

  const forceTemplate = body?.mode === "template";
  const { data: properties, error } = await supabase
    .from("properties")
    .select(
      "id,ref,property_type,type,bedrooms,bathrooms,location,built_area,floor_label,amenities_no,energy_rating,price,source_description,description,description_no,usage_source,pool,garage,editorial_no,editorial_no_approved",
    )
    .in("id", propertyIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let generated = 0;
  let reused = 0;
  let fallbacks = 0;
  const failed: Array<{ id: string; error: string }> = [];

  await Promise.all(
    (properties || []).map(async (property) => {
      const id = String(property.id);
      if (existingEditorialHasSameSource(property, property.editorial_no)) {
        reused += 1;
        return;
      }

      try {
        const { editorial, usedFallback } = await generatePropertyEditorialNo(property, {
          forceTemplate,
        });
        const { error: updateError } = await supabase
          .from("properties")
          .update({
            editorial_no: editorial,
            editorial_no_approved: false,
            title_no: editorial.headline_no,
            description_no: editorialDescription(editorial),
          })
          .eq("id", id);

        if (updateError) throw updateError;
        generated += 1;
        if (usedFallback) fallbacks += 1;
      } catch (generationError) {
        failed.push({
          id,
          error: generationError instanceof Error ? generationError.message : "Unknown enrichment error",
        });
      }
    }),
  );

  return NextResponse.json({
    requested: propertyIds.length,
    found: properties?.length || 0,
    generated,
    reused,
    fallbacks,
    failed,
  });
}
