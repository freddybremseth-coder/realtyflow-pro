import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { OWNED_GROWTH_BRANDS, isPilotChannel } from "@/lib/marketing/brand-registry";
import { buildCanonicalLeadAttribution } from "@/lib/marketing/attribution";
import { decideGrowthScaling } from "@/lib/marketing/growth-scaling";
import { marketingTouchpointFromRow } from "@/services/marketing/attribution-adapter";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function currentMonthStart() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const brandIds = OWNED_GROWTH_BRANDS.map((brand) => brand.id);
  const [plansR, contextsR, channelsR, sourcesR, publicationsR, eventsR, rulesR, touchesR] = await Promise.all([
    supabase.from("marketing_brand_growth_plans").select("brand_id,status,autonomy_mode,planned_channels,updated_at").in("brand_id", brandIds),
    supabase.from("brand_context").select("brand_id,brand_name").in("brand_id", brandIds),
    supabase.from("social_channels").select("brand_id,platform,is_active,display_name").in("brand_id", brandIds).eq("is_active", true),
    supabase.from("marketing_source_queue").select("brand_id,status,blocked_reason").in("brand_id", brandIds).limit(10000),
    supabase.from("marketing_publications").select("brand_id,channel,state,content_id,updated_at").in("brand_id", brandIds).gte("updated_at", since30).limit(10000),
    supabase.from("marketing_events").select("brand_id,channel,content_id,metadata").in("brand_id", brandIds).eq("event_type", "metrics_snapshot").limit(10000),
    supabase.from("marketing_learning_rules").select("scope,verdict,updated_at").limit(10000),
    supabase.from("marketing_touchpoints").select("*").in("brand_id", brandIds).order("occurred_at", { ascending: true }).limit(10000),
  ]);
  const error = plansR.error || contextsR.error || channelsR.error || sourcesR.error || publicationsR.error || eventsR.error || rulesR.error || touchesR.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const plans = plansR.data || [];
  const contexts = contextsR.data || [];
  const channels = channelsR.data || [];
  const sources = sourcesR.data || [];
  const publications = publicationsR.data || [];
  const events = eventsR.data || [];
  const rules = rulesR.data || [];
  const touches = (touchesR.data || []).map(marketingTouchpointFromRow);
  const periodStart = currentMonthStart();

  const brands = OWNED_GROWTH_BRANDS.map((definition) => {
    const brandId = definition.id;
    const plan = plans.find((row: any) => row.brand_id === brandId);
    const brandChannels = channels.filter((row: any) => row.brand_id === brandId);
    const brandSources = sources.filter((row: any) => row.brand_id === brandId);
    const brandPublications = publications.filter((row: any) => row.brand_id === brandId && row.state === "published");
    const brandEvents = events.filter((row: any) => row.brand_id === brandId);
    const eligibleObservations = new Set(brandEvents.filter((row: any) => row?.metadata?.learning_eligible !== false).map((row: any) => String(row.content_id || "")).filter(Boolean)).size;
    const quarantined = new Set(brandEvents.filter((row: any) => row?.metadata?.learning_eligible === false).map((row: any) => String(row.content_id || "")).filter(Boolean)).size;
    const brandRules = rules.filter((row: any) => String(row.scope) === brandId || String(row.scope).startsWith(`${brandId}:`));
    const attribution = buildCanonicalLeadAttribution({ touches, periodStart, scope: brandId, model: "last_touch" });
    const input = {
      active: plan?.status === "active",
      connectedChannels: brandChannels.length,
      pilotReadyChannels: brandChannels.filter((row: any) => isPilotChannel(brandId, String(row.platform))).length,
      readySources: brandSources.filter((row: any) => row.status === "ready").length,
      blockedSources: brandSources.filter((row: any) => row.status === "blocked").length,
      published30d: brandPublications.length,
      eligibleObservations,
      evaluatedRules: brandRules.length,
      actionableRules: brandRules.filter((row: any) => ["favor", "avoid"].includes(String(row.verdict))).length,
      quarantined,
      leads: attribution.summary.leads,
      qualified: attribution.summary.qualified,
      sales: attribution.summary.sales,
      attributionCoveragePercent: attribution.summary.coveragePercent,
    };
    return {
      brandId,
      brandName: (contexts.find((row: any) => row.brand_id === brandId) as any)?.brand_name || definition.name,
      website: definition.website,
      plannedChannels: definition.plannedChannels,
      connectedChannels: brandChannels.map((row: any) => ({ platform: row.platform, name: row.display_name || null, pilotReady: isPilotChannel(brandId, String(row.platform)) })),
      metrics: input,
      decision: decideGrowthScaling(input),
      attribution: { sourceOfTruth: attribution.sourceOfTruth, periodStart, ...attribution.summary },
      actions: {
        readinessHref: "/marketing-readiness",
        publishingHref: "/posts",
        attributionHref: `/attribution?scope=${encodeURIComponent(brandId)}`,
      },
    };
  }).sort((a, b) => {
    const rank = { HOLD: 0, FOUNDATION: 1, PILOT: 2, PROVE: 3, SCALE: 4 } as const;
    return rank[a.decision.stage] - rank[b.decision.stage] || a.brandName.localeCompare(b.brandName);
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    periodStart,
    summary: {
      brands: brands.length,
      hold: brands.filter((row) => row.decision.stage === "HOLD").length,
      foundation: brands.filter((row) => row.decision.stage === "FOUNDATION").length,
      pilot: brands.filter((row) => row.decision.stage === "PILOT").length,
      prove: brands.filter((row) => row.decision.stage === "PROVE").length,
      scale: brands.filter((row) => row.decision.stage === "SCALE").length,
      canonicalLeads: brands.reduce((sum, row) => sum + row.attribution.leads, 0),
      canonicalQualified: brands.reduce((sum, row) => sum + row.attribution.qualified, 0),
      canonicalSales: brands.reduce((sum, row) => sum + row.attribution.sales, 0),
    },
    brands,
    safety: { adminOnly: true, readOnly: true, automaticScaleChange: false, automaticChannelEnable: false, automaticBudgetChange: false },
  });
}
