import { createClient } from "@supabase/supabase-js";

export const SEO_BRANDS = [
  "zeneco", "pinosoecolife", "freddyb", "freddypublishing",
  "remasterfreddy", "donaanna", "chatgenius",
] as const;

const AI_SOURCES = new Set(["chatgpt", "microsoft_copilot", "perplexity", "google_gemini"]);

type DiscoveryRow = {
  brand_id: string;
  source: string;
  path: string;
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

  const rows = (data || []) as DiscoveryRow[];
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
      note: current === 0
        ? "No measured search/AI arrival events in this window. Do not interpret this as zero actual traffic."
        : truncated ? "10,000-event cap reached. Window and page totals may be incomplete." : null,
    },
    totals: {
      current, previous, search, ai,
      changePercent: truncated ? null : roundPercent(current - previous, previous),
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
