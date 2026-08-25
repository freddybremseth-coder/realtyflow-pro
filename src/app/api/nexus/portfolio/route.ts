import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [plansRes, sourceRes, pubsRes, rulesRes, channelsRes] = await Promise.all([
    supabase.from("marketing_brand_growth_plans").select("brand_id,website,status,autonomy_mode,source_types,planned_channels,conversion_goals,primary_ctas,posting_strategy,ads_strategy,learning_strategy,metadata,updated_at").order("brand_id"),
    supabase.from("marketing_source_queue").select("brand_id,source_type,status,priority,blocked_reason,last_planned_at").limit(5000),
    supabase.from("marketing_publications").select("brand_id,channel,state,created_at,updated_at").gte("created_at", since30).limit(5000),
    supabase.from("marketing_learning_rules").select("scope,dimension,verdict,sample,lift,updated_at").limit(5000),
    supabase.from("social_channels").select("brand_id,platform,is_active,display_name").eq("is_active", true),
  ]);
  const error = plansRes.error || sourceRes.error || pubsRes.error || rulesRes.error || channelsRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const plans = plansRes.data ?? [];
  const sources = sourceRes.data ?? [];
  const pubs = pubsRes.data ?? [];
  const rules = rulesRes.data ?? [];
  const channels = channelsRes.data ?? [];

  const brands = plans.map((plan: any) => {
    const bs = sources.filter((r: any) => r.brand_id === plan.brand_id);
    const bp = pubs.filter((r: any) => r.brand_id === plan.brand_id);
    const bc = channels.filter((r: any) => r.brand_id === plan.brand_id);
    const br = rules.filter((r: any) => String(r.scope) === plan.brand_id || String(r.scope).startsWith(`${plan.brand_id}:`));
    const bySourceType: Record<string, number> = {};
    const bySourceStatus: Record<string, number> = {};
    const byPublicationState: Record<string, number> = {};
    for (const r of bs as any[]) {
      bySourceType[r.source_type] = (bySourceType[r.source_type] ?? 0) + 1;
      bySourceStatus[r.status] = (bySourceStatus[r.status] ?? 0) + 1;
    }
    for (const r of bp as any[]) byPublicationState[r.state] = (byPublicationState[r.state] ?? 0) + 1;
    return {
      ...plan,
      channels: bc,
      sourceSummary: { total: bs.length, byType: bySourceType, byStatus: bySourceStatus, ready: bySourceStatus.ready ?? 0, blocked: bySourceStatus.blocked ?? 0, drafted: bySourceStatus.drafted ?? 0 },
      publications30d: { total: bp.length, byState: byPublicationState, published: byPublicationState.published ?? 0, scheduled: byPublicationState.scheduled ?? 0, draft: byPublicationState.draft ?? 0 },
      learning: { rules: br.length, actionable: br.filter((r: any) => ["favor", "avoid"].includes(String(r.verdict))).length },
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      brands: brands.length,
      activeBrands: brands.filter((b: any) => b.status === "active").length,
      setupBrands: brands.filter((b: any) => b.status === "setup").length,
      sources: sources.length,
      readySources: sources.filter((r: any) => r.status === "ready").length,
      blockedSources: sources.filter((r: any) => r.status === "blocked").length,
      publications30d: pubs.length,
      published30d: pubs.filter((r: any) => r.state === "published").length,
      learningRules: rules.length,
      connectedChannels: channels.length,
    },
    brands,
  });
}
