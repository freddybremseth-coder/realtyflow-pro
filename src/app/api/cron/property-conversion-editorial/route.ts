export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { generatePropertyConversionNo } from "@/lib/realty/property-conversion-no";

export const maxDuration = 120;

const BATCH_LIMIT = 6;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data, error } = await supabase
    .from("properties")
    .select(
      "id,ref,title,title_no,property_type,type,bedrooms,bathrooms,town,location,built_area,area_m2,plot_size,price,pool,garage,energy_rating,amenities_no,source_description,description,description_no,conversion_no,show_on_website,website_visible,status",
    )
    .is("conversion_no", null)
    .or("show_on_website.is.null,show_on_website.eq.true")
    .or("website_visible.is.null,website_visible.eq.true")
    .order("created_at", { ascending: false })
    .limit(BATCH_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data || data.length === 0) {
    return NextResponse.json({ success: true, processed: 0, generated: 0, ai: 0, template: 0 });
  }

  const results = await Promise.all(
    data.map(async (property) => {
      try {
        const conversion = await generatePropertyConversionNo(property as Record<string, unknown>);
        const { error: updateError } = await supabase
          .from("properties")
          .update({ conversion_no: conversion })
          .eq("id", property.id);
        if (updateError) throw updateError;
        return { ok: true, mode: conversion.generation_mode, ref: property.ref } as const;
      } catch (generationError) {
        return {
          ok: false,
          mode: "failed",
          ref: property.ref,
          error: generationError instanceof Error ? generationError.message : String(generationError),
        } as const;
      }
    }),
  );

  const successful = results.filter((result) => result.ok);
  return NextResponse.json({
    success: results.every((result) => result.ok),
    processed: results.length,
    generated: successful.length,
    ai: successful.filter((result) => result.mode === "ai").length,
    template: successful.filter((result) => result.mode === "template").length,
    failed: results.length - successful.length,
    refs: successful.map((result) => result.ref).filter(Boolean),
    failures: results.filter((result) => !result.ok),
  });
}
