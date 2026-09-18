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
  const brandId = request.nextUrl.searchParams.get("brand") || "pinosoecolife";
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("search_discovery_events")
    .select("source, path, referrer_host, occurred_at")
    .eq("brand_id", brandId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  const sourceCounts = new Map<string, number>();
  const pageCounts = new Map<string, number>();
  const dailyCounts = new Map<string, { search: number; ai: number }>();

  let aiVisits = 0;
  let searchVisits = 0;

  for (const row of rows) {
    const source = String(row.source || "unknown");
    const path = String(row.path || "/");
    const isAi = AI_SOURCES.has(source);

    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    pageCounts.set(path, (pageCounts.get(path) || 0) + 1);

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

  const topPages = Array.from(pageCounts.entries())
    .map(([path, visits]) => ({ path, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 20);

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
    topPages,
    daily,
    latest: rows.slice(0, 20),
  });
}
