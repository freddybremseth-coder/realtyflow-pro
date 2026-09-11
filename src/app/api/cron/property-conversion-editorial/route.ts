export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { generatePropertyConversionNo } from "@/lib/realty/property-conversion-no";

export const maxDuration = 120;

const BATCH_LIMIT = 6;
const CLAIM_STALE_MINUTES = 20;
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

function claimedProperty(row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== "object") return null;
  const property = (row as { property?: unknown }).property;
  return property && typeof property === "object" ? (property as Record<string, unknown>) : null;
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

  const { data: claimedRows, error: claimError } = await supabase.rpc(
    "claim_property_conversion_candidates",
    { p_limit: BATCH_LIMIT, p_stale_minutes: CLAIM_STALE_MINUTES },
  );

  if (claimError) {
    await writeRunLog(supabase, "error", {
      stage: "claim",
      error: claimError.message,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  const mappedProperties: Array<Record<string, unknown> | null> = (
    Array.isArray(claimedRows) ? claimedRows : []
  ).map((row: unknown) => claimedProperty(row));
  const properties = mappedProperties.filter(
    (property): property is Record<string, unknown> => property !== null,
  );

  const claimedRefs = properties
    .map((property) => String(property.ref || "").trim())
    .filter(Boolean);
  const claimedIds = properties
    .map((property) => String(property.id || "").trim())
    .filter(Boolean);

  if (properties.length === 0) {
    await writeRunLog(supabase, "success", {
      stage: "complete",
      processed: 0,
      generated: 0,
      ai: 0,
      template: 0,
      claimed: 0,
      claimed_refs: [],
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });
    return NextResponse.json({
      success: true,
      processed: 0,
      generated: 0,
      ai: 0,
      template: 0,
      claimed: 0,
      claimed_refs: [],
    });
  }

  const results = await Promise.all(
    properties.map(async (property) => {
      const id = String(property.id || "");
      const ref = String(property.ref || "");
      try {
        const conversion = await generatePropertyConversionNo(property);
        const { error: updateError } = await supabase
          .from("properties")
          .update({ conversion_no: conversion })
          .eq("id", id);
        if (updateError) throw updateError;
        return { ok: true, mode: conversion.generation_mode, ref } as const;
      } catch (generationError) {
        const message = generationError instanceof Error ? generationError.message : String(generationError);
        const { error: failureUpdateError } = await supabase
          .from("properties")
          .update({
            conversion_no: {
              status: "failed",
              version: "conversion-v6",
              failed_at: new Date().toISOString(),
              error: message.slice(0, 1000),
            },
          })
          .eq("id", id);
        return {
          ok: false,
          mode: "failed",
          ref,
          error: failureUpdateError
            ? `${message}; failed to persist failure state: ${failureUpdateError.message}`
            : message,
        } as const;
      }
    }),
  );

  const successful = results.filter((result) => result.ok);
  const response = {
    success: results.every((result) => result.ok),
    processed: results.length,
    generated: successful.length,
    ai: successful.filter((result) => result.mode === "ai").length,
    template: successful.filter((result) => result.mode === "template").length,
    failed: results.length - successful.length,
    claimed: properties.length,
    claimed_refs: claimedRefs,
    claimed_ids: claimedIds,
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
