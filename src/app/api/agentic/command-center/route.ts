import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildCommandCenter, type RevenueEventLite } from "@/lib/agentic/command-center";
import { makeApprovalGatewayStore } from "@/services/agentic/adapters";

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
  if (!supabase) return NextResponse.json({ summary: null, warning: "Supabase not configured" });

  try {
    const pendingApprovals = await makeApprovalGatewayStore(supabase).listPending();

    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("revenue_events")
      .select("event_type, actor_type, revenue_impact_eur, occurred_at, metadata")
      .gte("occurred_at", since)
      .in("actor_type", ["ai", "automation", "system"])
      .order("occurred_at", { ascending: false })
      .limit(500);

    const recentEvents: RevenueEventLite[] = (data ?? []).map((r: any) => ({
      eventType: r.event_type,
      actorType: r.actor_type,
      revenueImpactEur: r.revenue_impact_eur,
      outcome: (r.metadata && r.metadata.agentic_outcome) || null,
      occurredAt: r.occurred_at,
    }));

    const summary = buildCommandCenter({ pendingApprovals, recentEvents });
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json({ summary: null, error: err instanceof Error ? err.message : "error" }, { status: 500 });
  }
}
