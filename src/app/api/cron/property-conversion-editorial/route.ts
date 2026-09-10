export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import {
  computePropertyConversionSourceHash,
  generatePropertyConversionNo,
} from "@/lib/realty/property-conversion-no";

export const maxDuration = 120;

const BATCH_LIMIT = 6;
const SCAN_LIMIT = 180;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function conversionIsCurrent(property: Record<string, unknown>) {
  const value = property.conversion_no;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (value as Record<string, unknown>).source_hash === computePropertyConversionSourceHash(property);
}

function isWebsiteVisible(property: Record<string, unknown>) {
  return property.show_on_website !== false && property.website_visible !== false;
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
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = (data || [])
    .filter((property) => isWebsiteVisible(property as Record<string, unknown>))
    .filter((property) => !conversionIsCurrent(property as Record<string, unknown>))
    .slice(0, BATCH_LIMIT);

  if (candidates.length === 0) {
    return NextResponse.json({ success: true, processed: 0, generated: 0, ai: 0, template: 0 });
  }

  const results = await Promise.all(
    candidates.map(async (property) => {
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
