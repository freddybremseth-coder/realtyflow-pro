import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { OWNED_GROWTH_BRANDS, isPilotChannel } from "@/lib/marketing/brand-registry";
import { buildCanonicalLeadAttribution } from "@/lib/marketing/attribution";
import { decideGrowthScaling } from "@/lib/marketing/growth-scaling";
import { loadNexusRevenueCommandSnapshot } from "@/lib/nexus-command-readers";
import { buildMultiBrandIntelligence } from "@/lib/nexus/multi-brand-intelligence";
import { buildRevenueBrainV2 } from "@/lib/nexus/revenue-brain-v2";
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

  try {
    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const brandIds = OWNED_GROWTH_BRANDS.map((brand) => brand.id);
    const [plansR, channelsR, sourcesR, publicationsR, eventsR, rulesR, touchesR, revenueSnapshot] = await Promise.all([
      supabase.from("marketing_brand_growth_plans").select("brand_id,status").in("brand_id", brandIds),
      supabase.from("social_channels").select("brand_id,platform,is_active").in("brand_id", brandIds).eq("is_active", true),
      supabase.from("marketing_source_queue").select("brand_id,status").in("brand_id", brandIds).limit(10000),
      supabase.from("marketing_publications").select("brand_id,state,updated_at").in("brand_id", brandIds).gte("updated_at", since30).limit(10000),
      supabase.from("marketing_events").select("brand_id,content_id,metadata").in("brand_id", brandIds).eq("event_type", "metrics_snapshot").limit(10000),
      supabase.from("marketing_learning_rules").select("scope,verdict").limit(10000),
      supabase.from("marketing_touchpoints").select("*").in("brand_id", brandIds).order("occurred_at", { ascending: true }).limit(10000),
      loadNexusRevenueCommandSnapshot(supabase),
    ]);
    const error = plansR.error || channelsR.error || sourcesR.error || publicationsR.error || eventsR.error || rulesR.error || touchesR.error;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const plans = plansR.data || [];
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
      const published30d = publications.filter((row: any) => row.brand_id === brandId && row.state === "published").length;
      const brandEvents = events.filter((row: any) => row.brand_id === brandId);
      const eligibleObservations = new Set(brandEvents.filter((row: any) => row?.metadata?.learning_eligible !== false).map((row: any) => String(row.content_id || "")).filter(Boolean)).size;
      const quarantined = new Set(brandEvents.filter((row: any) => row?.metadata?.learning_eligible === false).map((row: any) => String(row.content_id || "")).filter(Boolean)).size;
      const brandRules = rules.filter((row: any) => String(row.scope) === brandId || String(row.scope).startsWith(`${brandId}:`));
      const attribution = buildCanonicalLeadAttribution({ touches, periodStart, scope: brandId, model: "last_touch" });
      const metrics = {
        active: plan?.status === "active",
        connectedChannels: brandChannels.length,
        pilotReadyChannels: brandChannels.filter((row: any) => isPilotChannel(brandId, String(row.platform))).length,
        readySources: brandSources.filter((row: any) => row.status === "ready").length,
        blockedSources: brandSources.filter((row: any) => row.status === "blocked").length,
        published30d,
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
        brandName: definition.name,
        kind: definition.kind,
        plannedChannels: [...definition.plannedChannels],
        contentPillars: [...(definition.contentPillars || [])],
        active: metrics.active,
        growthStage: decideGrowthScaling(metrics).stage,
        connectedChannels: metrics.connectedChannels,
        readySources: metrics.readySources,
        blockedSources: metrics.blockedSources,
        quarantined: metrics.quarantined,
        actionableRules: metrics.actionableRules,
        leads: metrics.leads,
        qualified: metrics.qualified,
        sales: metrics.sales,
        commissionEur: attribution.summary.commissionEur,
        attributionCoveragePercent: metrics.attributionCoveragePercent,
      };
    });

    const revenue = buildRevenueBrainV2({
      generatedAt: revenueSnapshot.generatedAt,
      growthMissions: revenueSnapshot.growthMissions,
      agenticPlans: revenueSnapshot.agenticPlans,
      health: revenueSnapshot.health,
      warnings: revenueSnapshot.warnings,
    }, 50);

    return NextResponse.json(buildMultiBrandIntelligence({
      generatedAt: new Date().toISOString(),
      brands,
      revenue: revenue.decisions.map((row) => ({
        brandId: row.brandId,
        focus: row.focus,
        readiness: row.readiness,
        opportunityScore: row.opportunityScore,
        expectedValue: row.expectedValue,
      })),
      warnings: revenueSnapshot.warnings,
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
