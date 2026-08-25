import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { buildPaidCreativeUtm } from "@/lib/ads/creative-dna";
import { aggregateCreativeDimension } from "@/lib/ads/creative-insights";
import {
  addCreativeTouch,
  compareCreativeOutcomeSignal,
  creativeEvidence,
  creativeRates,
  emptyCreativeMetrics,
} from "@/lib/ads/creative-performance";

export const dynamic = "force-dynamic";

function r4(value: number) { return Math.round(value * 10000) / 10000; }
function safeDivide(numerator: number, denominator: number) { return denominator > 0 ? r4(numerator / denominator) : null; }

type PaidRow = {
  creative_variant_id: string | null;
  spend_amount: number | null;
  currency: string | null;
  spend_eur: number | null;
  impressions: number | null;
  clicks: number | null;
  landing_page_views: number | null;
};

function paidEconomics(rows: PaidRow[], metrics: ReturnType<typeof emptyCreativeMetrics>) {
  const spendRows = rows.filter((row) => row.spend_amount != null);
  const currencies = Array.from(new Set(spendRows.map((row) => String(row.currency || "").toUpperCase()).filter(Boolean)));
  const rawSpendByCurrency: Record<string, number> = {};
  for (const row of spendRows) {
    const currency = String(row.currency || "UNKNOWN").toUpperCase();
    rawSpendByCurrency[currency] = r4((rawSpendByCurrency[currency] || 0) + Number(row.spend_amount || 0));
  }
  const fullyNormalizedToEur = spendRows.length > 0 && spendRows.every((row) => row.spend_eur != null);
  const spendEur = fullyNormalizedToEur ? r4(spendRows.reduce((sum, row) => sum + Number(row.spend_eur || 0), 0)) : null;
  const singleCurrency = currencies.length === 1 ? currencies[0] : null;
  const comparableRawSpend = singleCurrency ? rawSpendByCurrency[singleCurrency] ?? null : null;
  const paidImpressions = rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0);
  const paidClicks = rows.reduce((sum, row) => sum + Number(row.clicks || 0), 0);
  const paidLandings = rows.reduce((sum, row) => sum + Number(row.landing_page_views || 0), 0);

  return {
    available: rows.length > 0,
    spendAvailable: spendRows.length > 0,
    currencies,
    rawSpendByCurrency,
    singleCurrency,
    comparableRawSpend,
    spendEur,
    fullyNormalizedToEur,
    paidImpressions,
    paidClicks,
    paidLandings,
    cpc: comparableRawSpend != null ? safeDivide(comparableRawSpend, paidClicks) : null,
    cpl: comparableRawSpend != null ? safeDivide(comparableRawSpend, metrics.leads) : null,
    cpql: comparableRawSpend != null ? safeDivide(comparableRawSpend, metrics.qualified) : null,
    cpsale: comparableRawSpend != null ? safeDivide(comparableRawSpend, metrics.sales) : null,
    roasOnCommission: spendEur != null ? safeDivide(metrics.commissionEur, spendEur) : null,
    state: rows.length === 0
      ? "not_imported"
      : spendRows.length === 0
        ? "delivery_only"
        : currencies.length > 1 && !fullyNormalizedToEur
          ? "mixed_currency_unresolved"
          : "comparable",
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient();
  const channel = new URL(req.url).searchParams.get("channel") || null;

  const { data: campaign, error: campaignError } = await supabase
    .from("ad_campaigns")
    .select("id,brand_id,name,product_name,growth_goal,optimization_event,default_language,status,created_at")
    .eq("id", params.id)
    .single();
  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { data: creatives, error: creativesError } = await supabase
    .from("ad_creatives")
    .select("id,tracking_code,concept_group,variant_index,angle,mood,aspect_ratio,creative_format,hook_family,language,growth_goal,creative_dna,parent_creative_id,generation_type,is_top_pick,pick_rank,image_url,thumbnail_url,status,provider,model")
    .eq("campaign_id", params.id)
    .order("concept_group", { ascending: true })
    .order("variant_index", { ascending: true });
  if (creativesError) return NextResponse.json({ error: creativesError.message }, { status: 500 });

  const creativeIds = (creatives ?? []).map((row: any) => String(row.id));
  const [touchesResult, paidResult] = creativeIds.length
    ? await Promise.all([
        supabase
          .from("marketing_touchpoints")
          .select("creative_variant_id,touch_type,commission_eur,occurred_at,confidence")
          .eq("campaign_id", params.id)
          .in("creative_variant_id", creativeIds)
          .order("occurred_at", { ascending: true })
          .limit(20000),
        supabase
          .from("marketing_paid_media_daily")
          .select("creative_variant_id,spend_amount,currency,spend_eur,impressions,clicks,landing_page_views,metric_date,platform,source")
          .in("creative_variant_id", creativeIds)
          .order("metric_date", { ascending: true })
          .limit(20000),
      ])
    : [{ data: [] as any[], error: null }, { data: [] as any[], error: null }];

  if (touchesResult.error) return NextResponse.json({ error: touchesResult.error.message }, { status: 500 });
  if (paidResult.error) return NextResponse.json({ error: paidResult.error.message }, { status: 500 });
  const touches = touchesResult.data ?? [];
  const paidRows = paidResult.data ?? [];

  const metricsByCreative = new Map<string, ReturnType<typeof emptyCreativeMetrics>>();
  const paidByCreative = new Map<string, PaidRow[]>();
  for (const id of creativeIds) { metricsByCreative.set(id, emptyCreativeMetrics()); paidByCreative.set(id, []); }
  for (const touch of touches) {
    const id = String((touch as any).creative_variant_id || "");
    const metrics = metricsByCreative.get(id);
    if (metrics) addCreativeTouch(metrics, touch as any);
  }
  for (const paid of paidRows) {
    const id = String((paid as any).creative_variant_id || "");
    const list = paidByCreative.get(id);
    if (list) list.push(paid as PaidRow);
  }

  const rows = (creatives ?? []).map((creative: any) => {
    const metrics = metricsByCreative.get(String(creative.id)) ?? emptyCreativeMetrics();
    const trackingCode = creative.tracking_code ? String(creative.tracking_code) : null;
    return {
      ...creative,
      metrics,
      rates: creativeRates(metrics),
      evidence: creativeEvidence(metrics),
      economics: paidEconomics(paidByCreative.get(String(creative.id)) ?? [], metrics),
      attribution: {
        canonicalCreativeId: String(creative.id),
        trackingCode,
        utm: channel && trackingCode
          ? buildPaidCreativeUtm({ channel, campaignId: String(campaign.id), trackingCode })
          : null,
      },
    };
  });

  rows.sort((a: any, b: any) => compareCreativeOutcomeSignal(a.metrics, b.metrics));

  const campaignMetrics = emptyCreativeMetrics();
  for (const row of rows) {
    for (const key of Object.keys(campaignMetrics) as Array<keyof typeof campaignMetrics>) {
      campaignMetrics[key] += Number(row.metrics[key] || 0);
    }
  }

  const campaignEconomics = paidEconomics(paidRows as PaidRow[], campaignMetrics);
  const dimension = (field: "hook_family" | "concept_group" | "creative_format" | "provider" | "language") =>
    aggregateCreativeDimension(rows.map((row: any) => ({ dimensionValue: row[field], metrics: row.metrics, economics: row.economics })));

  const { count: unattributedTouchpoints } = await supabase
    .from("marketing_touchpoints")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", params.id)
    .is("creative_variant_id", null);

  return NextResponse.json({
    campaign,
    generatedAt: new Date().toISOString(),
    metrics: campaignMetrics,
    economics: campaignEconomics,
    creativeCount: rows.length,
    attributedCreativeTouchpoints: touches.length,
    unattributedCampaignTouchpoints: unattributedTouchpoints ?? 0,
    paidMediaRows: paidRows.length,
    insights: {
      hookFamily: dimension("hook_family"),
      concept: dimension("concept_group"),
      format: dimension("creative_format"),
      provider: dimension("provider"),
      language: dimension("language"),
    },
    note: campaignEconomics.state === "not_imported"
      ? "Paid-media spend has not been imported for these creatives. Missing spend is unknown, not zero; no economic winner is declared."
      : "Rows are ordered by downstream outcome signal. Economic comparisons are valid only where spend/currency state is comparable.",
    creatives: rows,
  });
}
