import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildNexusRevenueCommandCenter } from "@/lib/nexus-revenue-command-center";
import type { NexusOpportunityStoreRow } from "@/lib/nexus-opportunity-store";
import { buildNexusSyncHealth, type NexusSyncRunLike } from "@/lib/nexus-sync-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  let query = supabase
    .from("nexus_business_opportunities")
    .select("contact_id,brand_id,offer_id,pipeline_id,stage_id,lifecycle_phase,opportunity_state,title,reason,next_action,priority,priority_score,value,currency,route_confidence,route_reason,source_system,source_id,source_updated_at,last_activity_at,metadata")
    .in("opportunity_state", ["active", "won"])
    .order("priority_score", { ascending: false })
    .limit(1000);

  const brand = request.nextUrl.searchParams.get("brand")?.trim();
  const pipeline = request.nextUrl.searchParams.get("pipeline")?.trim();
  if (brand) query = query.eq("brand_id", brand);
  if (pipeline) query = query.eq("pipeline_id", pipeline);

  const [opportunitiesResult, syncRunResult, storeCountResult] = await Promise.all([
    query,
    supabase
      .from("automation_runs")
      .select("status,input,output,error,started_at,finished_at")
      .eq("input->>path", "/api/cron/nexus-opportunity-sync")
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("nexus_business_opportunities")
      .select("source_id", { count: "exact", head: true })
      .in("opportunity_state", ["active", "won"]),
  ]);

  if (opportunitiesResult.error) return NextResponse.json({ error: opportunitiesResult.error.message }, { status: 500 });

  const snapshot = buildNexusRevenueCommandCenter((opportunitiesResult.data || []) as NexusOpportunityStoreRow[]);
  const syncHealth = buildNexusSyncHealth(
    syncRunResult.error ? null : (syncRunResult.data as NexusSyncRunLike | null),
    storeCountResult.error ? (opportunitiesResult.data || []).length : Number(storeCountResult.count || 0),
  );

  return NextResponse.json({
    ...snapshot,
    syncHealth,
    warnings: [
      ...(Array.isArray((snapshot as { warnings?: unknown[] }).warnings) ? ((snapshot as { warnings?: unknown[] }).warnings || []) : []),
      ...(syncRunResult.error ? [`Opportunity Sync audit kunne ikke leses: ${syncRunResult.error.message}`] : []),
      ...(storeCountResult.error ? [`Opportunity Store count kunne ikke leses: ${storeCountResult.error.message}`] : []),
    ],
  });
}
