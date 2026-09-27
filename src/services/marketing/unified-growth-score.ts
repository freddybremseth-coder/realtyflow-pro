import type { MarketingSupabaseLike } from "@/services/marketing/adapters";
import {
  businessValueScore,
  evidenceLevel,
  qualifiedLeadRate,
  type ContentMetrics,
  type EvidenceLevel,
} from "@/lib/marketing/value-score";

const CANONICAL_OUTCOMES = new Set([
  "lead_created",
  "qualified",
  "viewing_completed",
  "offer_made",
  "deal_won",
  "commission_invoiced",
  "commission_paid",
]);

type MarketingMetricRow = {
  brand_id?: string | null;
  content_id?: string | null;
  channel?: string | null;
  metrics?: Record<string, unknown> | null;
  occurred_at?: string | null;
};

type RevenueRow = {
  event_type?: string | null;
  brand_id?: string | null;
  contact_id?: string | null;
  revenue_impact_eur?: number | string | null;
  occurred_at?: string | null;
};

type TouchpointRow = {
  brand_id?: string | null;
  content_id?: string | null;
  channel?: string | null;
  contact_id?: string | null;
  touch_type?: string | null;
  commission_eur?: number | string | null;
  occurred_at?: string | null;
};

export type UnifiedGrowthFunnel = {
  impressions: number;
  views: number;
  engagedViews: number;
  reactions: number;
  comments: number;
  saves: number;
  shares: number;
  clicks: number;
  leads: number;
  qualifiedLeads: number;
  viewings: number;
  offers: number;
  sales: number;
  commissionEur: number;
};

export type UnifiedGrowthRates = {
  engagementRatePct: number;
  clickThroughRatePct: number;
  leadRatePer1000: number;
  qualifiedLeadRatePer1000: number;
  qualificationRatePct: number;
  closeRatePct: number;
};

export type UnifiedGrowthScoreRow = {
  scope: "portfolio" | "brand" | "channel" | "content";
  brandId: string;
  channel: string;
  contentId: string | null;
  funnel: UnifiedGrowthFunnel;
  rates: UnifiedGrowthRates;
  businessValue: number;
  unifiedScore: number;
  attributionCoveragePct: number;
  evidence: EvidenceLevel;
  revenueMode: "canonical_brand" | "attributed_only";
};

export type UnifiedGrowthScoreReport = {
  version: 1;
  period: { days: number; since: string; until: string };
  sourceOfTruth: {
    visibility: "marketing_events";
    commercial: "revenue_events";
    attribution: "marketing_touchpoints";
  };
  portfolio: UnifiedGrowthScoreRow;
  brands: UnifiedGrowthScoreRow[];
  channels: UnifiedGrowthScoreRow[];
  content: UnifiedGrowthScoreRow[];
  diagnostics: {
    marketingMetricRows: number;
    canonicalRevenueRows: number;
    attributionTouchpoints: number;
    canonicalLeads: number;
    attributedLeadTouches: number;
    portfolioAttributionCoveragePct: number;
  };
};

const zero = (): UnifiedGrowthFunnel => ({
  impressions: 0,
  views: 0,
  engagedViews: 0,
  reactions: 0,
  comments: 0,
  saves: 0,
  shares: 0,
  clicks: 0,
  leads: 0,
  qualifiedLeads: 0,
  viewings: 0,
  offers: 0,
  sales: 0,
  commissionEur: 0,
});

const num = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const key = (...parts: Array<string | null | undefined>) => parts.map((v) => v || "unknown").join("|");

function mergeMetrics(target: UnifiedGrowthFunnel, metrics: Record<string, unknown> | null | undefined) {
  target.impressions += num(metrics?.impressions);
  target.views += num(metrics?.views);
  target.engagedViews += num(metrics?.engagedViews);
  target.reactions += num(metrics?.reactions);
  target.comments += num(metrics?.comments);
  target.saves += num(metrics?.saves);
  target.shares += num(metrics?.shares);
  target.clicks += num(metrics?.clicks);
}

function exposure(funnel: UnifiedGrowthFunnel) {
  return Math.max(funnel.impressions, funnel.views);
}

export function unifiedScoreIndex(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(100, Math.round(Math.log10(1 + value) * 20));
}

function rates(funnel: UnifiedGrowthFunnel): UnifiedGrowthRates {
  const exp = exposure(funnel);
  const engagement = funnel.engagedViews || (funnel.reactions + funnel.comments + funnel.saves + funnel.shares);
  return {
    engagementRatePct: exp ? round2((engagement / exp) * 100) : 0,
    clickThroughRatePct: exp ? round2((funnel.clicks / exp) * 100) : 0,
    leadRatePer1000: exp ? round2((funnel.leads / exp) * 1000) : 0,
    qualifiedLeadRatePer1000: qualifiedLeadRate({
      views: funnel.views,
      impressions: funnel.impressions,
      qualifiedLeads: funnel.qualifiedLeads,
    }),
    qualificationRatePct: funnel.leads ? round2((funnel.qualifiedLeads / funnel.leads) * 100) : 0,
    closeRatePct: funnel.leads ? round2((funnel.sales / funnel.leads) * 100) : 0,
  };
}

function scoreRow(input: {
  scope: UnifiedGrowthScoreRow["scope"];
  brandId: string;
  channel?: string;
  contentId?: string | null;
  funnel: UnifiedGrowthFunnel;
  attributedLeadTouches: number;
  canonicalLeads: number;
  observationCount: number;
  revenueMode: UnifiedGrowthScoreRow["revenueMode"];
}): UnifiedGrowthScoreRow {
  const metrics: ContentMetrics = {
    ...input.funnel,
    qualifiedLeads: input.funnel.qualifiedLeads,
  };
  const businessValue = businessValueScore(metrics);
  return {
    scope: input.scope,
    brandId: input.brandId,
    channel: input.channel || "all",
    contentId: input.contentId ?? null,
    funnel: {
      ...input.funnel,
      commissionEur: round2(input.funnel.commissionEur),
    },
    rates: rates(input.funnel),
    businessValue,
    unifiedScore: unifiedScoreIndex(businessValue),
    attributionCoveragePct: input.canonicalLeads
      ? round2(Math.min(100, (input.attributedLeadTouches / input.canonicalLeads) * 100))
      : 0,
    evidence: evidenceLevel(input.observationCount),
    revenueMode: input.revenueMode,
  };
}

function distinctByContact(rows: RevenueRow[], eventType: string) {
  const contacts = new Set<string>();
  let anonymous = 0;
  for (const row of rows) {
    if (row.event_type !== eventType) continue;
    const id = String(row.contact_id || "").trim();
    if (id) contacts.add(id);
    else anonymous += 1;
  }
  return contacts.size + anonymous;
}

function canonicalRevenueFunnel(rows: RevenueRow[]): UnifiedGrowthFunnel {
  const funnel = zero();
  funnel.leads = distinctByContact(rows, "lead_created");
  funnel.qualifiedLeads = distinctByContact(rows, "qualified");
  funnel.viewings = distinctByContact(rows, "viewing_completed");
  funnel.offers = distinctByContact(rows, "offer_made");
  funnel.sales = distinctByContact(rows, "deal_won");

  const paid = rows
    .filter((row) => row.event_type === "commission_paid")
    .reduce((sum, row) => sum + num(row.revenue_impact_eur), 0);
  const invoiced = rows
    .filter((row) => row.event_type === "commission_invoiced")
    .reduce((sum, row) => sum + num(row.revenue_impact_eur), 0);
  funnel.commissionEur = paid > 0 ? paid : invoiced;
  return funnel;
}

function attributedRevenueFunnel(rows: TouchpointRow[]): UnifiedGrowthFunnel {
  const funnel = zero();
  const distinct = (type: string) => {
    const ids = new Set<string>();
    let anonymous = 0;
    for (const row of rows) {
      if (row.touch_type !== type) continue;
      const id = String(row.contact_id || "").trim();
      if (id) ids.add(id);
      else anonymous += 1;
    }
    return ids.size + anonymous;
  };
  funnel.leads = distinct("lead_created");
  funnel.qualifiedLeads = distinct("qualified");
  funnel.viewings = distinct("viewing");
  funnel.offers = distinct("offer");
  funnel.sales = distinct("sale");
  funnel.commissionEur = rows
    .filter((row) => row.touch_type === "sale")
    .reduce((sum, row) => sum + num(row.commission_eur), 0);
  return funnel;
}

function add(target: UnifiedGrowthFunnel, source: UnifiedGrowthFunnel) {
  for (const k of Object.keys(target) as Array<keyof UnifiedGrowthFunnel>) {
    target[k] += source[k];
  }
}

export function buildUnifiedGrowthScoreReport(input: {
  days: number;
  since: string;
  until: string;
  metricRows: MarketingMetricRow[];
  revenueRows: RevenueRow[];
  touchpointRows: TouchpointRow[];
}): UnifiedGrowthScoreReport {
  const brandMetrics = new Map<string, UnifiedGrowthFunnel>();
  const channelMetrics = new Map<string, UnifiedGrowthFunnel>();
  const contentMetrics = new Map<string, UnifiedGrowthFunnel>();
  const metricObservations = new Map<string, number>();

  for (const row of input.metricRows) {
    const brandId = String(row.brand_id || "unknown");
    const channel = String(row.channel || "unknown");
    const contentId = row.content_id ? String(row.content_id) : null;
    const b = brandMetrics.get(brandId) ?? zero();
    mergeMetrics(b, row.metrics);
    brandMetrics.set(brandId, b);

    const ck = key(brandId, channel);
    const c = channelMetrics.get(ck) ?? zero();
    mergeMetrics(c, row.metrics);
    channelMetrics.set(ck, c);
    metricObservations.set(ck, (metricObservations.get(ck) ?? 0) + 1);

    if (contentId) {
      const ik = key(brandId, channel, contentId);
      const m = contentMetrics.get(ik) ?? zero();
      mergeMetrics(m, row.metrics);
      contentMetrics.set(ik, m);
      metricObservations.set(ik, (metricObservations.get(ik) ?? 0) + 1);
    }
    metricObservations.set(brandId, (metricObservations.get(brandId) ?? 0) + 1);
  }

  const revenueByBrand = new Map<string, RevenueRow[]>();
  for (const row of input.revenueRows.filter((row) => CANONICAL_OUTCOMES.has(String(row.event_type)))) {
    const brandId = String(row.brand_id || "unknown");
    const rows = revenueByBrand.get(brandId) ?? [];
    rows.push(row);
    revenueByBrand.set(brandId, rows);
  }

  const touchesByBrand = new Map<string, TouchpointRow[]>();
  const touchesByChannel = new Map<string, TouchpointRow[]>();
  const touchesByContent = new Map<string, TouchpointRow[]>();
  for (const row of input.touchpointRows) {
    const brandId = String(row.brand_id || "unknown");
    const channel = String(row.channel || "unknown");
    const contentId = row.content_id ? String(row.content_id) : null;
    (touchesByBrand.get(brandId) ?? touchesByBrand.set(brandId, []).get(brandId)!).push(row);
    (touchesByChannel.get(key(brandId, channel)) ?? touchesByChannel.set(key(brandId, channel), []).get(key(brandId, channel))!).push(row);
    if (contentId) {
      const ik = key(brandId, channel, contentId);
      (touchesByContent.get(ik) ?? touchesByContent.set(ik, []).get(ik)!).push(row);
    }
  }

  const brandIds = new Set<string>([
    ...brandMetrics.keys(),
    ...revenueByBrand.keys(),
    ...touchesByBrand.keys(),
  ]);

  const brands: UnifiedGrowthScoreRow[] = [];
  for (const brandId of brandIds) {
    const funnel = brandMetrics.get(brandId) ?? zero();
    const revenueFunnel = canonicalRevenueFunnel(revenueByBrand.get(brandId) ?? []);
    add(funnel, revenueFunnel);
    const touchRows = touchesByBrand.get(brandId) ?? [];
    const attributedLeads = attributedRevenueFunnel(touchRows).leads;
    brands.push(scoreRow({
      scope: "brand",
      brandId,
      funnel,
      attributedLeadTouches: attributedLeads,
      canonicalLeads: revenueFunnel.leads,
      observationCount: metricObservations.get(brandId) ?? 0,
      revenueMode: "canonical_brand",
    }));
  }

  const channels: UnifiedGrowthScoreRow[] = [];
  for (const [ck, metricFunnel] of channelMetrics) {
    const [brandId, channel] = ck.split("|");
    const funnel = { ...metricFunnel };
    const touchRows = touchesByChannel.get(ck) ?? [];
    const attributed = attributedRevenueFunnel(touchRows);
    add(funnel, attributed);
    const canonicalLeads = canonicalRevenueFunnel(revenueByBrand.get(brandId) ?? []).leads;
    channels.push(scoreRow({
      scope: "channel",
      brandId,
      channel,
      funnel,
      attributedLeadTouches: attributed.leads,
      canonicalLeads,
      observationCount: metricObservations.get(ck) ?? 0,
      revenueMode: "attributed_only",
    }));
  }

  const content: UnifiedGrowthScoreRow[] = [];
  for (const [ik, metricFunnel] of contentMetrics) {
    const [brandId, channel, contentId] = ik.split("|");
    const funnel = { ...metricFunnel };
    const touchRows = touchesByContent.get(ik) ?? [];
    const attributed = attributedRevenueFunnel(touchRows);
    add(funnel, attributed);
    const canonicalLeads = canonicalRevenueFunnel(revenueByBrand.get(brandId) ?? []).leads;
    content.push(scoreRow({
      scope: "content",
      brandId,
      channel,
      contentId,
      funnel,
      attributedLeadTouches: attributed.leads,
      canonicalLeads,
      observationCount: metricObservations.get(ik) ?? 0,
      revenueMode: "attributed_only",
    }));
  }

  brands.sort((a, b) => b.businessValue - a.businessValue);
  channels.sort((a, b) => b.businessValue - a.businessValue);
  content.sort((a, b) => b.businessValue - a.businessValue);

  const portfolioFunnel = zero();
  for (const row of brands) add(portfolioFunnel, row.funnel);
  const canonicalLeads = brands.reduce((sum, row) => sum + row.funnel.leads, 0);
  const attributedLeadTouches = input.touchpointRows.filter((row) => row.touch_type === "lead_created").length;
  const portfolio = scoreRow({
    scope: "portfolio",
    brandId: "all",
    funnel: portfolioFunnel,
    attributedLeadTouches,
    canonicalLeads,
    observationCount: input.metricRows.length,
    revenueMode: "canonical_brand",
  });

  return {
    version: 1,
    period: { days: input.days, since: input.since, until: input.until },
    sourceOfTruth: {
      visibility: "marketing_events",
      commercial: "revenue_events",
      attribution: "marketing_touchpoints",
    },
    portfolio,
    brands,
    channels,
    content: content.slice(0, 100),
    diagnostics: {
      marketingMetricRows: input.metricRows.length,
      canonicalRevenueRows: input.revenueRows.filter((row) => CANONICAL_OUTCOMES.has(String(row.event_type))).length,
      attributionTouchpoints: input.touchpointRows.length,
      canonicalLeads,
      attributedLeadTouches,
      portfolioAttributionCoveragePct: canonicalLeads
        ? round2(Math.min(100, (attributedLeadTouches / canonicalLeads) * 100))
        : 0,
    },
  };
}

export async function loadUnifiedGrowthScore(
  supabase: MarketingSupabaseLike,
  options: { days?: number; brandId?: string } = {},
): Promise<UnifiedGrowthScoreReport> {
  const days = Math.max(1, Math.min(options.days ?? 30, 365));
  const until = new Date().toISOString();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  let metricQuery = supabase
    .from("marketing_events")
    .select("brand_id,content_id,channel,metrics,occurred_at")
    .eq("event_type", "metrics_snapshot")
    .gte("occurred_at", since)
    .lte("occurred_at", until);
  let revenueQuery = supabase
    .from("revenue_events")
    .select("event_type,brand_id,contact_id,revenue_impact_eur,occurred_at")
    .in("event_type", Array.from(CANONICAL_OUTCOMES))
    .gte("occurred_at", since)
    .lte("occurred_at", until);
  let touchQuery = supabase
    .from("marketing_touchpoints")
    .select("brand_id,content_id,channel,contact_id,touch_type,commission_eur,occurred_at")
    .gte("occurred_at", since)
    .lte("occurred_at", until);

  if (options.brandId) {
    metricQuery = metricQuery.eq("brand_id", options.brandId);
    revenueQuery = revenueQuery.eq("brand_id", options.brandId);
    touchQuery = touchQuery.eq("brand_id", options.brandId);
  }

  const [metricsResult, revenueResult, touchResult] = await Promise.all([
    metricQuery,
    revenueQuery,
    touchQuery,
  ]);
  if (metricsResult.error) throw new Error(`UNIFIED_GROWTH_METRICS_READ_FAILED: ${metricsResult.error.message}`);
  if (revenueResult.error) throw new Error(`UNIFIED_GROWTH_REVENUE_READ_FAILED: ${revenueResult.error.message}`);
  if (touchResult.error) throw new Error(`UNIFIED_GROWTH_ATTRIBUTION_READ_FAILED: ${touchResult.error.message}`);

  return buildUnifiedGrowthScoreReport({
    days,
    since,
    until,
    metricRows: (metricsResult.data ?? []) as MarketingMetricRow[],
    revenueRows: (revenueResult.data ?? []) as RevenueRow[],
    touchpointRows: (touchResult.data ?? []) as TouchpointRow[],
  });
}
