import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { buildPaidCreativeUtm } from "@/lib/ads/creative-dna";
import {
  addCreativeTouch,
  compareCreativeOutcomeSignal,
  creativeEvidence,
  creativeRates,
  emptyCreativeMetrics,
} from "@/lib/ads/creative-performance";

export const dynamic = "force-dynamic";

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
  const { data: touches, error: touchesError } = creativeIds.length
    ? await supabase
        .from("marketing_touchpoints")
        .select("creative_variant_id,touch_type,commission_eur,occurred_at,confidence")
        .eq("campaign_id", params.id)
        .in("creative_variant_id", creativeIds)
        .order("occurred_at", { ascending: true })
        .limit(20000)
    : { data: [] as any[], error: null };
  if (touchesError) return NextResponse.json({ error: touchesError.message }, { status: 500 });

  const metricsByCreative = new Map<string, ReturnType<typeof emptyCreativeMetrics>>();
  for (const id of creativeIds) metricsByCreative.set(id, emptyCreativeMetrics());
  for (const touch of touches ?? []) {
    const id = String((touch as any).creative_variant_id || "");
    const metrics = metricsByCreative.get(id);
    if (metrics) addCreativeTouch(metrics, touch as any);
  }

  const rows = (creatives ?? []).map((creative: any) => {
    const metrics = metricsByCreative.get(String(creative.id)) ?? emptyCreativeMetrics();
    const trackingCode = creative.tracking_code ? String(creative.tracking_code) : null;
    return {
      ...creative,
      metrics,
      rates: creativeRates(metrics),
      evidence: creativeEvidence(metrics),
      attribution: {
        touchpoints: Object.values(metrics).slice(0, 10).reduce((sum: number, value: any) => sum + Number(value || 0), 0),
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

  const { count: unattributedTouchpoints } = await supabase
    .from("marketing_touchpoints")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", params.id)
    .is("creative_variant_id", null);

  return NextResponse.json({
    campaign,
    generatedAt: new Date().toISOString(),
    metrics: campaignMetrics,
    creativeCount: rows.length,
    attributedCreativeTouchpoints: (touches ?? []).length,
    unattributedCampaignTouchpoints: unattributedTouchpoints ?? 0,
    note: "Rows are ordered by downstream outcome signal, not declared winners. Spend/CPL/ROAS must be joined before economic winner selection.",
    creatives: rows,
  });
}
