import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildNexusRevenueCommandCenter } from "@/lib/nexus-revenue-command-center";
import type { NexusOpportunityStoreRow } from "@/lib/nexus-opportunity-store";

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

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const snapshot = buildNexusRevenueCommandCenter((data || []) as NexusOpportunityStoreRow[]);
  return NextResponse.json(snapshot);
}
