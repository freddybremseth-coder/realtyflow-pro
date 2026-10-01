export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import {
  detectPropertyEditorialOpportunities,
  type EditorialPropertyFact,
} from "@/lib/content/property-editorial-opportunities";

export const maxDuration = 120;
const BRAND_ID = "zeneco";
const ACTION = "property_content_opportunity_scan";
const PAGE_SIZE = 700;
const AUTO_READY_SCORE = 86;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fact(row: any): EditorialPropertyFact | null {
  const p = Array.isArray(row?.properties) ? row.properties[0] : row?.properties;
  if (!p || typeof p !== "object") return null;
  const id = String(p.id || "");
  const ref = String(p.ref || "").trim();
  const price = Number(p.price);
  if (!id || !ref || !Number.isFinite(price) || price <= 0) return null;
  return {
    id,
    ref,
    town: String(p.town || "").trim(),
    location: String(p.location || "").trim(),
    price,
    bedrooms: numberOrNull(p.bedrooms),
    bathrooms: numberOrNull(p.bathrooms),
    areaM2: numberOrNull(p.built_area) || numberOrNull(p.area_m2),
    plotM2: numberOrNull(p.plot_size),
    propertyType: String(p.property_type || "Bolig").trim(),
    imageUrl: typeof p.primary_image === "string" && p.primary_image.startsWith("http") ? p.primary_image : null,
  };
}

async function loadVisibleProperties(supabase: NonNullable<ReturnType<typeof getSupabase>>) {
  const rows: any[] = [];
  for (let from = 0; from < 3500; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("property_brand_visibility")
      .select("property_id,properties!inner(id,ref,town,location,price,bedrooms,bathrooms,area_m2,built_area,plot_size,property_type,primary_image,show_on_website,website_visible)")
      .eq("brand_id", BRAND_ID)
      .eq("visible", true)
      .eq("properties.show_on_website", true)
      .eq("properties.website_visible", true)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows.map(fact).filter((item): item is EditorialPropertyFact => Boolean(item));
}

async function logRun(supabase: NonNullable<ReturnType<typeof getSupabase>>, status: "success"|"error", details: Record<string,unknown>) {
  const { error } = await supabase.from("automation_logs").insert({
    action: ACTION,
    agent_name: "nexus_editorial_signal_engine",
    status,
    details: { path: "/api/cron/property-content-opportunities", ...details },
  });
  if (error) console.error("[property-content-opportunities] log error", error.message);
}

export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode("/api/cron/property-content-opportunities");
  if (safeMode.skip) {
    return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const startedAt = new Date().toISOString();
  try {
    const properties = await loadVisibleProperties(supabase);
    const opportunities = detectPropertyEditorialOpportunities(properties, 24);
    const signatures = opportunities.map((item) => item.signature);

    const { data: existing, error: existingError } = await supabase
      .from("property_content_opportunities")
      .select("signature,status")
      .eq("brand_id", BRAND_ID)
      .in("signature", signatures.length ? signatures : ["__none__"]);
    if (existingError) throw existingError;
    const existingStatus = new Map((existing || []).map((row: any) => [String(row.signature), String(row.status)]));

    let created = 0;
    let refreshed = 0;
    for (const item of opportunities) {
      const status = existingStatus.get(item.signature);
      if (status === "drafted" || status === "dismissed") continue;
      const row = {
        brand_id: BRAND_ID,
        signature: item.signature,
        opportunity_type: item.opportunityType,
        score: item.score,
        title: item.title,
        summary: item.summary,
        editorial_angle: item.editorialAngle,
        primary_keyword: item.primaryKeyword,
        supporting_keywords: item.supportingKeywords,
        audience: item.audience,
        property_refs: item.propertyRefs,
        property_ids: item.propertyIds,
        image_url: item.imageUrl,
        evidence: item.evidence,
        draft_markdown: item.draftMarkdown,
        status: item.score >= AUTO_READY_SCORE ? "auto_ready" : "suggested",
        detected_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 21 * 86_400_000).toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("property_content_opportunities")
        .upsert(row, { onConflict: "brand_id,signature" });
      if (error) throw error;
      if (status) refreshed += 1;
      else created += 1;
    }

    await supabase
      .from("property_content_opportunities")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("brand_id", BRAND_ID)
      .in("status", ["suggested", "auto_ready"])
      .lt("expires_at", new Date().toISOString());

    await logRun(supabase, "success", {
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      visible_properties: properties.length,
      detected: opportunities.length,
      created,
      refreshed,
      auto_ready: opportunities.filter((item) => item.score >= AUTO_READY_SCORE).length,
      auto_ready_threshold: AUTO_READY_SCORE,
      top: opportunities.slice(0,5).map((item)=>({score:item.score,autoReady:item.score >= AUTO_READY_SCORE,title:item.title,refs:item.propertyRefs})),
    });

    return NextResponse.json({
      success: true,
      visibleProperties: properties.length,
      detected: opportunities.length,
      created,
      refreshed,
      autoReady: opportunities.filter((item) => item.score >= AUTO_READY_SCORE).length,
      autoReadyThreshold: AUTO_READY_SCORE,
      top: opportunities.slice(0,8).map((item)=>({score:item.score,autoReady:item.score >= AUTO_READY_SCORE,title:item.title,refs:item.propertyRefs})),
    });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    await logRun(supabase, "error", { started_at: startedAt, finished_at: new Date().toISOString(), error });
    return NextResponse.json({ error }, { status: 500 });
  }
}
