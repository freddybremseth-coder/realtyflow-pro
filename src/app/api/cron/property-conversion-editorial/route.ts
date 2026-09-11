export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { generatePropertyConversionNo } from "@/lib/realty/property-conversion-no";

export const maxDuration = 120;

const BATCH_LIMIT = 6;
const NULL_SCAN_LIMIT = 24;
const ACTION = "property_conversion_editorial";
const AGENT = "zeneco_property_conversion_cron";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function writeRunLog(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  status: "success" | "error",
  details: Record<string, unknown>,
) {
  const { error } = await supabase.from("automation_logs").insert({
    action: ACTION,
    agent_name: AGENT,
    status,
    details: {
      path: "/api/cron/property-conversion-editorial",
      ...details,
    },
  });

  if (error) {
    console.error("[property-conversion-editorial] failed to write automation log", error.message);
  }
}

export async function GET(request: NextRequest) {
  const startedAt = new Date().toISOString();
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const unauthorized = requireCronApi(request);
  if (unauthorized) {
    await writeRunLog(supabase, "error", {
      stage: "auth",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      has_authorization_header: Boolean(request.headers.get("authorization")),
      has_vercel_cron_header: Boolean(request.headers.get("x-vercel-cron")),
      schedule: request.headers.get("x-vercel-cron-schedule"),
    });
    return unauthorized;
  }

  // Keep the PostgREST query intentionally simple. Historical rows can have
  // nullable visibility flags, and chaining multiple `or(...)` groups made the
  // cron return zero rows even though SQL confirmed eligible NULL conversions.
  // Fetch NULL conversion candidates first, then apply the visibility contract
  // deterministically in code before taking the bounded production batch.
  const { data: nullCandidates, error } = await supabase
    .from("properties")
    .select(
      "id,ref,title,title_no,property_type,type,bedrooms,bathrooms,town,location,built_area,area_m2,plot_size,price,pool,garage,energy_rating,amenities_no,source_description,description,description_no,conversion_no,show_on_website,website_visible,status",
    )
    .is("conversion_no", null)
    .order("created_at", { ascending: false })
    .limit(NULL_SCAN_LIMIT);

  if (error) {
    await writeRunLog(supabase, "error", {
      stage: "select",
      error: error.message,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const data = (nullCandidates || [])
    .filter(
      (property) =>
        property.show_on_website !== false && property.website_visible !== false,
    )
    .slice(0, BATCH_LIMIT);

  if (data.length === 0) {
    await writeRunLog(supabase, "success", {
      stage: "complete",
      null_candidates: nullCandidates?.length || 0,
      visible_candidates: 0,
      processed: 0,
      generated: 0,
      ai: 0,
      template: 0,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });
    return NextResponse.json({
      success: true,
      nullCandidates: nullCandidates?.length || 0,
      visibleCandidates: 0,
      processed: 0,
      generated: 0,
      ai: 0,
      template: 0,
    });
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
  const response = {
    success: results.every((result) => result.ok),
    nullCandidates: nullCandidates?.length || 0,
    visibleCandidates: data.length,
    processed: results.length,
    generated: successful.length,
    ai: successful.filter((result) => result.mode === "ai").length,
    template: successful.filter((result) => result.mode === "template").length,
    failed: results.length - successful.length,
    refs: successful.map((result) => result.ref).filter(Boolean),
    failures: results.filter((result) => !result.ok),
  };

  await writeRunLog(supabase, response.success ? "success" : "error", {
    stage: "complete",
    ...response,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  });

  return NextResponse.json(response);
}
