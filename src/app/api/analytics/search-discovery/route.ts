import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

const AI_SOURCES = new Set(["chatgpt", "microsoft_copilot", "perplexity", "google_gemini"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get("days") || 30), 1), 90);
  const brandId = request.nextUrl.searchParams.get("brand") || "all";
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("search_discovery_events")
    .select("brand_id, source, path, referrer_host, occurred_at")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(10000);

  if (brandId !== "all") query = query.eq("brand_id", brandId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  const sourceCounts = new Map<string, number>();
  const pageCounts = new Map<string, { brandId: string; path: string; visits: number }>();
  const brandCounts = new Map<string, { visits: number; search: number; ai: number }>();
  const dailyCounts = new Map<string, { search: number; ai: number }>();

  let aiVisits = 0;
  let searchVisits = 0;

  for (const row of rows) {
    const rowBrandId = String(row.brand_id || "unknown");
    const source = String(row.source || "unknown");
    const path = String(row.path || "/");
    const isAi = AI_SOURCES.has(source);

    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    const pageKey = `${rowBrandId}:${path}`;
    const currentPage = pageCounts.get(pageKey) || { brandId: rowBrandId, path, visits: 0 };
    currentPage.visits += 1;
    pageCounts.set(pageKey, currentPage);

    const currentBrand = brandCounts.get(rowBrandId) || { visits: 0, search: 0, ai: 0 };
    currentBrand.visits += 1;
    if (isAi) currentBrand.ai += 1;
    else currentBrand.search += 1;
    brandCounts.set(rowBrandId, currentBrand);

    if (isAi) aiVisits += 1;
    else searchVisits += 1;

    const day = String(row.occurred_at || "").slice(0, 10);
    if (day) {
      const current = dailyCounts.get(day) || { search: 0, ai: 0 };
      if (isAi) current.ai += 1;
      else current.search += 1;
      dailyCounts.set(day, current);
    }
  }

  const bySource = Array.from(sourceCounts.entries())
    .map(([source, visits]) => ({ source, visits }))
    .sort((a, b) => b.visits - a.visits);

  const topPages = Array.from(pageCounts.values())
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 30);

  const byBrand = Array.from(brandCounts.entries())
    .map(([brandId, counts]) => ({
      brandId,
      ...counts,
      aiShare: counts.visits ? Math.round((counts.ai / counts.visits) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.visits - a.visits);

  const daily = Array.from(dailyCounts.entries())
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    brandId,
    days,
    totalVisits: rows.length,
    searchVisits,
    aiVisits,
    aiShare: rows.length ? Math.round((aiVisits / rows.length) * 1000) / 10 : 0,
    bySource,
    byBrand,
    topPages,
    daily,
    latest: rows.slice(0, 20),
  });
}
