import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function n(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysAgo(date: Date, days: number) {
  return new Date(date.getTime() - days * 86_400_000);
}

function daysAfter(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

type MetricRow = {
  metric_date: string;
  royalties: number | null;
  units: number | null;
  pages_read: number | null;
  ad_spend: number | null;
  ad_sales: number | null;
  orders: number | null;
  impressions: number | null;
  clicks: number | null;
  currency: string | null;
  source: string | null;
};

function aggregate(rows: MetricRow[]) {
  const currencies = [...new Set(rows.map((r) => (r.currency || "UNKNOWN").toUpperCase()))];
  const byCurrency: Record<string, { royalties: number; adSpend: number; adSales: number }> = {};
  let units = 0, pagesRead = 0, orders = 0, impressions = 0, clicks = 0;
  for (const row of rows) {
    const currency = (row.currency || "UNKNOWN").toUpperCase();
    byCurrency[currency] ||= { royalties: 0, adSpend: 0, adSales: 0 };
    byCurrency[currency].royalties += n(row.royalties);
    byCurrency[currency].adSpend += n(row.ad_spend);
    byCurrency[currency].adSales += n(row.ad_sales);
    units += n(row.units);
    pagesRead += n(row.pages_read);
    orders += n(row.orders);
    impressions += n(row.impressions);
    clicks += n(row.clicks);
  }
  return { rows: rows.length, currencies, byCurrency, units, pagesRead, orders, impressions, clicks };
}

function primaryMetricFor(type: string) {
  if (type === "sample_asset") return "units";
  if (type === "asin_linkage") return "units";
  if (type === "series_readthrough") return "units";
  if (type === "ad_efficiency") return "roas";
  if (type === "conversion_gap") return "units";
  return "units";
}

function comparableValue(agg: ReturnType<typeof aggregate>, metric: string) {
  if (metric === "units") return { comparable: true, value: agg.units };
  if (metric === "orders") return { comparable: true, value: agg.orders };
  if (metric === "clicks") return { comparable: true, value: agg.clicks };
  if (metric === "pages_read") return { comparable: true, value: agg.pagesRead };
  if (metric === "roas") {
    if (agg.currencies.length !== 1) return { comparable: false, value: null };
    const c = agg.byCurrency[agg.currencies[0]];
    if (!c || c.adSpend <= 0) return { comparable: false, value: null };
    return { comparable: true, value: c.adSales / c.adSpend };
  }
  return { comparable: false, value: null };
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [experimentsRes, recsRes, booksRes] = await Promise.all([
    supabase.from("book_growth_experiments").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("book_growth_recommendations").select("id,book_id,series_id,recommendation_type,status,applied_at,measurement_due_at,channel,marketplace,current_value,proposed_value").in("status", ["applied", "measuring", "measured"]).order("applied_at", { ascending: false }).limit(300),
    supabase.from("book_titles").select("id,title,slug,language"),
  ]);
  const error = experimentsRes.error || recsRes.error || booksRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const books = new Map((booksRes.data ?? []).map((b: any) => [String(b.id), b]));
  const experiments = (experimentsRes.data ?? []).map((e: any) => ({ ...e, book: e.book_id ? books.get(String(e.book_id)) ?? null : null }));
  const expByRec = new Map(experiments.filter((e: any) => e.recommendation_id).map((e: any) => [String(e.recommendation_id), e]));
  const queue = (recsRes.data ?? []).map((r: any) => ({ ...r, book: r.book_id ? books.get(String(r.book_id)) ?? null : null, experiment: expByRec.get(String(r.id)) ?? null }));
  return NextResponse.json({
    summary: {
      appliedAwaitingExperiment: queue.filter((r: any) => r.status === "applied" && !r.experiment).length,
      running: experiments.filter((e: any) => e.status === "running").length,
      evaluated: experiments.filter((e: any) => e.status === "evaluated").length,
      measuredRecommendations: queue.filter((r: any) => r.status === "measured").length,
    },
    queue,
    experiments,
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");
  const recommendationId = String(body?.recommendationId || "").trim();
  if (!recommendationId || !["start", "evaluate"].includes(action)) return NextResponse.json({ error: "recommendationId og action=start|evaluate er påkrevd" }, { status: 400 });

  const { data: rec, error: recError } = await supabase.from("book_growth_recommendations").select("*").eq("id", recommendationId).maybeSingle();
  if (recError) return NextResponse.json({ error: recError.message }, { status: 500 });
  if (!rec) return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
  if (!rec.book_id) return NextResponse.json({ error: "Measurement v1 requires book_id" }, { status: 409 });

  if (action === "start") {
    if (rec.status !== "applied") return NextResponse.json({ error: `Recommendation must be applied, current=${rec.status}` }, { status: 409 });
    if (!rec.applied_at) return NextResponse.json({ error: "applied_at mangler" }, { status: 409 });
    const { data: existing } = await supabase.from("book_growth_experiments").select("id,status").eq("recommendation_id", recommendationId).maybeSingle();
    if (existing) return NextResponse.json({ error: "Experiment finnes allerede", experiment: existing }, { status: 409 });

    const appliedAt = new Date(rec.applied_at);
    const baselineStart = dateOnly(daysAgo(appliedAt, 14));
    const baselineEnd = dateOnly(daysAgo(appliedAt, 1));
    const { data: baselineRows, error: metricsError } = await supabase.from("book_growth_metrics")
      .select("metric_date,royalties,units,pages_read,ad_spend,ad_sales,orders,impressions,clicks,currency,source")
      .eq("book_id", rec.book_id).gte("metric_date", baselineStart).lte("metric_date", baselineEnd).limit(10000);
    if (metricsError) return NextResponse.json({ error: metricsError.message }, { status: 500 });

    const baseline = aggregate((baselineRows ?? []) as MetricRow[]);
    const primaryMetric = primaryMetricFor(rec.recommendation_type);
    const due = rec.measurement_due_at ? new Date(rec.measurement_due_at) : daysAfter(appliedAt, 14);
    const { data: experiment, error } = await supabase.from("book_growth_experiments").insert({
      book_id: rec.book_id,
      series_id: rec.series_id,
      channel: rec.channel,
      marketplace: rec.marketplace,
      dimension: rec.recommendation_type,
      hypothesis: `Applied ${rec.recommendation_type} should improve ${primaryMetric} versus the 14-day pre-apply baseline.`,
      baseline_value: rec.current_value,
      variant_value: rec.proposed_value,
      primary_metric: primaryMetric,
      baseline_metrics: { window: { start: baselineStart, end: baselineEnd }, ...baseline },
      result_metrics: {},
      status: "running",
      started_at: rec.applied_at,
      recommendation_id: rec.id,
    }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { error: recUpdateError } = await supabase.from("book_growth_recommendations").update({ status: "measuring", measurement_due_at: due.toISOString() }).eq("id", rec.id).eq("status", "applied");
    if (recUpdateError) return NextResponse.json({ error: recUpdateError.message }, { status: 500 });
    return NextResponse.json({ ok: true, experiment, baselineRows: baseline.rows, measurementDueAt: due.toISOString(), note: baseline.rows ? "Baseline captured" : "Experiment started, but baseline has no economic metric rows yet." });
  }

  const { data: experiment, error: expError } = await supabase.from("book_growth_experiments").select("*").eq("recommendation_id", recommendationId).maybeSingle();
  if (expError) return NextResponse.json({ error: expError.message }, { status: 500 });
  if (!experiment || experiment.status !== "running") return NextResponse.json({ error: "Running experiment not found" }, { status: 409 });
  if (rec.status !== "measuring") return NextResponse.json({ error: `Recommendation must be measuring, current=${rec.status}` }, { status: 409 });
  const due = rec.measurement_due_at ? new Date(rec.measurement_due_at) : null;
  if (due && Date.now() < due.getTime() && body?.force !== true) return NextResponse.json({ error: "Measurement window is not complete", measurementDueAt: due.toISOString() }, { status: 409 });

  const start = new Date(experiment.started_at || rec.applied_at);
  const resultStart = dateOnly(start);
  const resultEnd = dateOnly(due || new Date());
  const { data: resultRows, error: resultError } = await supabase.from("book_growth_metrics")
    .select("metric_date,royalties,units,pages_read,ad_spend,ad_sales,orders,impressions,clicks,currency,source")
    .eq("book_id", rec.book_id).gte("metric_date", resultStart).lte("metric_date", resultEnd).limit(10000);
  if (resultError) return NextResponse.json({ error: resultError.message }, { status: 500 });
  const resultAgg = aggregate((resultRows ?? []) as MetricRow[]);
  const baselineMetrics = experiment.baseline_metrics || {};
  const baselineAgg = {
    rows: n(baselineMetrics.rows), currencies: Array.isArray(baselineMetrics.currencies) ? baselineMetrics.currencies : [], byCurrency: baselineMetrics.byCurrency || {}, units: n(baselineMetrics.units), pagesRead: n(baselineMetrics.pagesRead), orders: n(baselineMetrics.orders), impressions: n(baselineMetrics.impressions), clicks: n(baselineMetrics.clicks),
  } as ReturnType<typeof aggregate>;
  const metric = experiment.primary_metric || "units";
  const before = comparableValue(baselineAgg, metric);
  const after = comparableValue(resultAgg, metric);
  const comparable = before.comparable && after.comparable && before.value !== null && after.value !== null;
  let lift: number | null = null;
  if (comparable && before.value! > 0) lift = (after.value! - before.value!) / before.value!;
  const evidenceLevel = baselineAgg.rows >= 7 && resultAgg.rows >= 7 ? "moderate" : baselineAgg.rows >= 3 && resultAgg.rows >= 3 ? "limited" : "insufficient";
  const result = !comparable || evidenceLevel === "insufficient" ? "inconclusive" : lift === null ? "inconclusive" : lift > 0.1 ? "positive" : lift < -0.1 ? "negative" : "neutral";
  const { error: updateExpError } = await supabase.from("book_growth_experiments").update({
    result_metrics: { window: { start: resultStart, end: resultEnd }, ...resultAgg },
    status: "evaluated",
    ended_at: new Date().toISOString(),
    result,
    lift,
    evidence_level: evidenceLevel,
    updated_at: new Date().toISOString(),
  }).eq("id", experiment.id).eq("status", "running");
  if (updateExpError) return NextResponse.json({ error: updateExpError.message }, { status: 500 });
  const { error: updateRecError } = await supabase.from("book_growth_recommendations").update({ status: "measured" }).eq("id", rec.id).eq("status", "measuring");
  if (updateRecError) return NextResponse.json({ error: updateRecError.message }, { status: 500 });
  return NextResponse.json({ ok: true, result, lift, evidenceLevel, baselineRows: baselineAgg.rows, resultRows: resultAgg.rows, comparable });
}
