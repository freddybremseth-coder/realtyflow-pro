import { createClient } from "@supabase/supabase-js";
import { SEO_BRANDS } from "./seo-data";

export type SEOLeadSummary = {
  collectedAt: string;
  measurement: string;
  dataQuality: {
    capturedRows: number; totalRows: number; truncated: boolean;
    leadsWithPage: number; leadsWithoutPage: number;
    note: string;
  };
  totals: { current: number; previous: number };
  byBrand: Array<{ brandId: string; current: number; previous: number; withPage: number; withoutPage: number }>;
  topLeadPages: Array<{ brandId: string; path: string; inquiries: number }>;
};

const ORIGINS: Record<string, readonly string[]> = {
  zeneco: ["zenecohomes.com"],
  pinosoecolife: ["pinosoecolife.com"],
  freddyb: ["freddybremseth.com"],
  freddypublishing: ["books.freddybremseth.com"],
  remasterfreddy: ["remaster.freddybremseth.com"],
  donaanna: ["donaanna.com"],
  chatgenius: ["chatgenius.pro"],
};

/** Sanitize public page URL down to its path, never feed raw URLs, emails,
 * query strings, visitor IDs, or CRM information into the AI context. */
export function publicLeadPage(raw: unknown, brandId: string): string | null {
  if (typeof raw !== "string" || raw.length > 1000) return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (!ORIGINS[brandId]?.some(allowed => host === allowed)) return null;
    if (!parsed.pathname.startsWith("/") || parsed.pathname.length > 220) return null;
    if (/[\x00-\x1f]/.test(parsed.pathname)) return null;
    return parsed.pathname || "/";
  } catch { return null; }
}

export function summarizeSEOLeads(
  rows: Array<{ brand_id?: string | null; created_at?: string | null; page_url?: unknown }>,
  now: number,
  totalRows: number = rows.length,
): SEOLeadSummary {
  const currentStart = now - 30 * 86400000;
  const previousStart = now - 60 * 86400000;
  const brands = new Map<string, { brandId: string; current: number; previous: number; withPage: number; withoutPage: number }>();
  const pages = new Map<string, { brandId: string; path: string; inquiries: number }>();
  for (const brandId of SEO_BRANDS) {
    brands.set(brandId, { brandId, current: 0, previous: 0, withPage: 0, withoutPage: 0 });
  }
  let current = 0;
  let previous = 0;
  let withPage = 0;
  let withoutPage = 0;
  for (const row of rows) {
    const brandId = String(row.brand_id || "");
    const brand = brands.get(brandId);
    if (!brand) continue;
    const date = Date.parse(row.created_at || "");
    if (!Number.isFinite(date) || date < previousStart || date > now) continue;
    if (date < currentStart) { previous++; brand.previous++; continue; }
    current++;
    brand.current++;
    const path = publicLeadPage(row.page_url, brandId);
    if (!path) { withoutPage++; brand.withoutPage++; continue; }
    withPage++;
    brand.withPage++;
    const pageKey = brandId + ":" + path;
    const existing = pages.get(pageKey) || { brandId, path, inquiries: 0 };
    existing.inquiries++;
    pages.set(pageKey, existing);
  }
  const truncated = totalRows > rows.length;
  return {
    collectedAt: new Date(now).toISOString(),
    measurement: "Count of website_lead work items (inquiries), not unique customers, not confirmed organic search leads, and not sales. Page URL represents form/source page, not verified search landing page.",
    dataQuality: {
      capturedRows: rows.length, totalRows, truncated,
      leadsWithPage: withPage, leadsWithoutPage: withoutPage,
      note: truncated
        ? "The 10,000 row reporting cap was reached; complete comparisons unavailable."
        : current === 0 ? "No measured website_lead work items in the current period; this does not prove the sites generated no inquiries."
        : withoutPage > 0 ? "Some website lead work items omit source page; page-level lead attribution is incomplete."
        : "Only the website_lead work-item channel is measured; other lead funnels may be absent.",
    },
    totals: { current, previous },
    byBrand: [...brands.values()],
    topLeadPages: [...pages.values()].sort((a,b) => b.inquiries - a.inquiries).slice(0, 20),
  };
}

export async function getSEOLeadSignals(): Promise<SEOLeadSummary> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SEO lead signals unavailable: Supabase not configured");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = Date.now();
  // Select ONLY aggregate-safe columns and the JSON path. Full metadata
  // contains personal identifiers (email, visitor_id) and must not be selected.
  const { data, error, count } = await supabase.from("work_items")
    .select("brand_id,created_at,page_url:metadata->>page_url", { count: "exact" })
    .eq("source_type", "website_lead")
    .gte("created_at", new Date(now - 60 * 86400000).toISOString())
    .lt("created_at", new Date(now).toISOString())
    .order("created_at", { ascending: false })
    .limit(10000);
  if (error) throw new Error("SEO lead signals query failed: " + error.message.slice(0, 200));
  return summarizeSEOLeads((data || []) as Array<{ brand_id: string; created_at: string; page_url: unknown }>, now, count ?? (data || []).length);
}
