import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { measureRevenueBrainOutcomes, NEXUS_OUTCOME_EVENT_TYPES } from "@/lib/nexus/outcome-measurement";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { measurement: null });
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", measurement: null }, { status: 500 });

  const daysRaw = Number(request.nextUrl.searchParams.get("days") || 90);
  const days = Math.max(7, Math.min(365, Number.isFinite(daysRaw) ? Math.round(daysRaw) : 90));
  const attributionRaw = Number(request.nextUrl.searchParams.get("attributionDays") || 30);
  const attributionDays = Math.max(1, Math.min(90, Number.isFinite(attributionRaw) ? Math.round(attributionRaw) : 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const eventTypes = ["automation_recommended", ...NEXUS_OUTCOME_EVENT_TYPES];

  const { data, error } = await supabase
    .from("revenue_events")
    .select("id,event_type,contact_id,brand_id,source_system,source_type,source_id,revenue_impact_eur,occurred_at,created_at,metadata")
    .in("event_type", eventTypes)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(10000);

  if (error) return NextResponse.json({ error: error.message, measurement: null }, { status: 500 });

  const measurement = measureRevenueBrainOutcomes(data || [], { attributionWindowDays: attributionDays });
  return NextResponse.json({
    measurement,
    query: { days, attributionDays, eventCount: (data || []).length },
  });
}
