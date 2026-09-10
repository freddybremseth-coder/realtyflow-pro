import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, { rows: [], summary: null });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", rows: [], summary: null }, { status: 500 });

  const requestedDays = Number(request.nextUrl.searchParams.get("days") || 30);
  const days = Number.isFinite(requestedDays) ? Math.max(1, Math.min(90, Math.round(requestedDays))) : 30;
  const since = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("property_conversion_metrics_daily")
    .select("day,property_ref,views,cta_clicks,leads,cta_rate_percent,lead_rate_percent,realtyflow_copy_views,fallback_copy_views")
    .gte("day", since)
    .order("day", { ascending: false })
    .order("views", { ascending: false });

  if (error) return NextResponse.json({ error: error.message, rows: [], summary: null }, { status: 500 });

  const rows = data || [];
  const summary = rows.reduce(
    (acc, row) => {
      acc.views += Number(row.views || 0);
      acc.ctaClicks += Number(row.cta_clicks || 0);
      acc.leads += Number(row.leads || 0);
      acc.realtyflowCopyViews += Number(row.realtyflow_copy_views || 0);
      acc.fallbackCopyViews += Number(row.fallback_copy_views || 0);
      return acc;
    },
    { views: 0, ctaClicks: 0, leads: 0, realtyflowCopyViews: 0, fallbackCopyViews: 0 },
  );

  return NextResponse.json({
    days,
    generatedAt: new Date().toISOString(),
    summary: {
      ...summary,
      ctaRatePercent: summary.views ? Number(((summary.ctaClicks / summary.views) * 100).toFixed(2)) : null,
      leadRatePercent: summary.views ? Number(((summary.leads / summary.views) * 100).toFixed(2)) : null,
    },
    rows,
  }, { headers: { "cache-control": "no-store" } });
}
