import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function countBy<T>(rows: T[], key: (row: T) => string) {
  const out: Record<string, number> = {};
  for (const row of rows) out[key(row)] = (out[key(row)] ?? 0) + 1;
  return out;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [titlesRes, seriesRes, recsRes, eventsRes] = await Promise.all([
    supabase.from("book_titles").select("id,slug,title,series_id,series_number,amazon_url,cover_image_url,sample_pdf_path,status").order("title"),
    supabase.from("book_series").select("id,slug,title").order("sort_order"),
    supabase.from("book_growth_recommendations").select("id,book_id,series_id,channel,marketplace,recommendation_type,current_value,proposed_value,evidence,confidence,expected_impact,status,created_at").order("created_at", { ascending: false }).limit(250),
    supabase.from("book_growth_events").select("book_id,book_slug,event_type,occurred_at").gte("occurred_at", since).limit(5000),
  ]);

  const error = titlesRes.error || seriesRes.error || recsRes.error || eventsRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const titles = titlesRes.data ?? [];
  const series = seriesRes.data ?? [];
  const recs = recsRes.data ?? [];
  const events = eventsRes.data ?? [];
  const titleById = new Map(titles.map((row: any) => [String(row.id), row]));
  const seriesById = new Map(series.map((row: any) => [String(row.id), row]));

  const recommendations = recs.map((row: any) => {
    const book = row.book_id ? titleById.get(String(row.book_id)) : null;
    const seriesRow = row.series_id ? seriesById.get(String(row.series_id)) : (book?.series_id ? seriesById.get(String(book.series_id)) : null);
    return {
      ...row,
      bookTitle: book?.title ?? null,
      bookSlug: book?.slug ?? null,
      seriesTitle: seriesRow?.title ?? null,
      seriesSlug: seriesRow?.slug ?? null,
    };
  });

  const pending = recommendations.filter((row: any) => row.status === "pending");
  const eventCounts = countBy(events, (row: any) => String(row.event_type));
  const pendingByType = countBy(pending, (row: any) => String(row.recommendation_type));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      totalBooks: titles.length,
      amazonLinked: titles.filter((row: any) => Boolean(row.amazon_url)).length,
      covers: titles.filter((row: any) => Boolean(row.cover_image_url)).length,
      samples: titles.filter((row: any) => Boolean(row.sample_pdf_path)).length,
      pendingRecommendations: pending.length,
      events30d: events.length,
      amazonClicks30d: eventCounts.amazon_click ?? 0,
      sampleClicks30d: eventCounts.sample_click ?? 0,
      directBuyClicks30d: eventCounts.direct_buy_click ?? 0,
      bookViews30d: eventCounts.book_view ?? 0,
    },
    pendingByType,
    recommendations,
  });
}
