import { createClient } from "@supabase/supabase-js";

export const SEO_BRANDS = [
  "zeneco", "pinosoecolife", "freddyb", "freddypublishing", "freddyart",
  "remasterfreddy", "donaanna", "chatgenius",
] as const;

const AI_SOURCES = new Set(["chatgpt", "microsoft_copilot", "perplexity", "google_gemini"]);

type DiscoveryRow = {
  brand_id: string;
  source: string;
  path: string;
  occurred_at: string;
};

type ConversionRow = {
  brand_id: string;
  event_type: string;
  path: string;
  target: string;
  landing_path: string | null;
  discovery_source: string | null;
  occurred_at: string;
};

type BrandCounts = { brandId: string; current: number; previous: number; search: number; ai: number };
type PageCounts = { brandId: string; path: string; current: number; previous: number };

function roundPercent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round(1000 * numerator / denominator) / 10 : null;
}

export async function getSEOObservedSignals() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SEO metrics unavailable: Supabase service role not configured");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = Date.now();
  const currentStart = new Date(now - 30 * 86400000).toISOString();
  const previousStart = new Date(now - 60 * 86400000).toISOString();
  const { data, error, count } = await supabase.from("search_discovery_events")
    .select("brand_id,source,path,occurred_at", { count: "exact" })
    .gte("occurred_at", previousStart)
    .lt("occurred_at", new Date(now).toISOString())
    .order("occurred_at", { ascending: false })
    .limit(10000);

  if (error) throw new Error("SEO metrics query failed: " + error.message.slice(0, 300));

  const conversionResult = await supabase.from("website_conversion_events")
    .select("brand_id,event_type,path,target,landing_path,discovery_source,occurred_at", { count: "exact" })
    .gte("occurred_at", previousStart)
    .lt("occurred_at", new Date(now).toISOString())
    .order("occurred_at", { ascending: false })
    .limit(10000);
  if (conversionResult.error) throw new Error("SEO conversion metrics query failed: " + conversionResult.error.message.slice(0, 300));

  const rows = (data || []) as DiscoveryRow[];
  const conversionRows = (conversionResult.data || []) as ConversionRow[];
  const truncated = typeof count === "number" && count > rows.length;
  const brandCounts = new Map<string, BrandCounts>();
  const pageCounts = new Map<string, PageCounts>();
  const sourceCounts = new Map<string, number>();
  let current = 0;
  let previous = 0;
  let search = 0;
  let ai = 0;

  for (const brandId of SEO_BRANDS) {
    brandCounts.set(brandId, { brandId, current: 0, previous: 0, search: 0, ai: 0 });
  }

  for (const event of rows) {
    if (!brandCounts.has(event.brand_id)) continue;
    const isCurrent = event.occurred_at >= currentStart;
    const brand = brandCounts.get(event.brand_id)!;
    const pageKey = event.brand_id + ":" + event.path;
    const page = pageCounts.get(pageKey) || {
      brandId: event.brand_id, path: event.path, current: 0, previous: 0,
    };
    if (isCurrent) {
      current++;
      brand.current++;
      page.current++;
      const isAI = AI_SOURCES.has(event.source);
      if (isAI) { ai++; brand.ai++; }
      else { search++; brand.search++; }
      sourceCounts.set(event.source, (sourceCounts.get(event.source) || 0) + 1);
    } else {
      previous++;
      brand.previous++;
      page.previous++;
    }
    pageCounts.set(pageKey, page);
  }

  const conversionTypeCounts = new Map<string, number>();
  const conversionTargetCounts = new Map<string, number>();
  const conversionLandingCounts = new Map<string, number>();
  const conversionSourceCounts = new Map<string, number>();
  let conversionCurrent = 0;
  let conversionPrevious = 0;
  let conversionAttributed = 0;

  for (const event of conversionRows) {
    if (!SEO_BRANDS.includes(event.brand_id as (typeof SEO_BRANDS)[number])) continue;
    const isCurrent = event.occurred_at >= currentStart;
    if (isCurrent) {
      conversionCurrent++;
      conversionTypeCounts.set(event.event_type, (conversionTypeCounts.get(event.event_type) || 0) + 1);
      conversionTargetCounts.set(event.target, (conversionTargetCounts.get(event.target) || 0) + 1);
      if (event.landing_path) conversionLandingCounts.set(event.landing_path, (conversionLandingCounts.get(event.landing_path) || 0) + 1);
      if (event.discovery_source) {
        conversionAttributed++;
        conversionSourceCounts.set(event.discovery_source, (conversionSourceCounts.get(event.discovery_source) || 0) + 1);
      }
    } else {
      conversionPrevious++;
    }
  }

  const conversionTruncated = typeof conversionResult.count === "number" &&
    conversionResult.count > conversionRows.length;

  return {
    collectedAt: new Date(now).toISOString(),
    window: { currentStart, previousStart, daysPerPeriod: 30 },
    measurement: "First-party search/AI referrer arrivals only; not Google Search Console queries, impressions, clicks, position, or verified AI citations.",
    dataQuality: {
      available: true,
      capturedRows: rows.length,
      totalRows: count ?? rows.length,
      truncated,
      keywordsAvailable: false,
      searchConsoleConnected: false,
      aiCitationsAvailable: false,
      conversionEventsAvailable: true,
      note: current === 0
        ? "No measured search/AI arrival events in this window. Do not interpret this as zero actual traffic."
        : truncated ? "10,000-event cap reached. Window and page totals may be incomplete." : null,
    },
    totals: {
      current, previous, search, ai,
      changePercent: truncated ? null : roundPercent(current - previous, previous),
    },
    conversions: {
      measurement: "Privacy-minimal CTA events only; not completed sales, qualified leads or causal SEO attribution.",
      current: conversionCurrent,
      previous: conversionPrevious,
      attributed: conversionAttributed,
      attributedShare: conversionCurrent ? roundPercent(conversionAttributed, conversionCurrent) : null,
      changePercent: conversionTruncated ? null : roundPercent(conversionCurrent - conversionPrevious, conversionPrevious),
      truncated: conversionTruncated,
      byType: [...conversionTypeCounts].map(([eventType, count]) => ({ eventType, count })).sort((a, b) => b.count - a.count),
      byTarget: [...conversionTargetCounts].map(([target, count]) => ({ target, count })).sort((a, b) => b.count - a.count),
      bySource: [...conversionSourceCounts].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
      topLandingPages: [...conversionLandingCounts].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count).slice(0, 20),
    },
    byBrand: [...brandCounts.values()],
    bySource: [...sourceCounts].map(([source, visits]) => ({ source, visits }))
      .sort((a, b) => b.visits - a.visits),
    topPages: [...pageCounts.values()].filter(page => page.current > 0)
      .sort((a, b) => b.current - a.current).slice(0, 30),
    // Never include user identifiers, referrer URLs, CRM data, search query strings
    // or the potentially sensitive contents of arbitrary dynamic page URLs.
  };
}
