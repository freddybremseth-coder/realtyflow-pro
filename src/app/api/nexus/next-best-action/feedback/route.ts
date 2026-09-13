import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { recordRevenueBrainExecution } from "@/lib/nexus/outcome-measurement";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const recommendationId = String(body.recommendationId || "").trim();
  if (!recommendationId || recommendationId.length > 200) {
    return NextResponse.json({ error: "Valid recommendationId is required" }, { status: 400 });
  }

  const { data: recommendation, error } = await supabase
    .from("revenue_events")
    .select("id,event_type,title,contact_id,brand_id,source_system,source_type,source_id,occurred_at,created_at,metadata")
    .eq("event_type", "automation_recommended")
    .eq("source_system", "nexus_revenue_brain")
    .eq("source_id", recommendationId)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!recommendation) return NextResponse.json({ error: "Recommendation snapshot not found" }, { status: 404 });

  const result = await recordRevenueBrainExecution(supabase, recommendation);
  if (!result.ok) {
    const status = result.error === "RECOMMENDATION_POLICY_BLOCKED" ? 409 : 422;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ success: true, duplicate: Boolean(result.duplicate), recommendationId });
}
