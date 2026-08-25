import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function countBy<T>(rows: T[], key: (row: T) => string) {
  const out: Record<string, number> = {};
  for (const row of rows) out[key(row)] = (out[key(row)] ?? 0) + 1;
  return out;
}

function titleText(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return String(row.en ?? row.no ?? row.es ?? Object.values(row)[0] ?? "");
  }
  return "";
}

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const since90Date = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

  const [titlesRes, seriesRes, recsRes, eventsRes, channelRes, worksRes, membersRes, metricsRes] = await Promise.all([
    supabase.from("book_titles").select("id,slug,title,series_id,series_number,language,amazon_url,cover_image_url,sample_pdf_path,status").order("title"),
    supabase.from("book_series").select("id,slug,title").order("sort_order"),
    supabase.from("book_growth_recommendations").select("id,book_id,series_id,channel,marketplace,recommendation_type,current_value,proposed_value,evidence,confidence,expected_impact,status,created_at").order("created_at", { ascending: false }).limit(250),
    supabase.from("book_growth_events").select("book_id,book_slug,event_type,occurred_at").gte("occurred_at", since30).limit(5000),
    supabase.from("book_growth_channel_metadata").select("book_id,channel,marketplace,external_id,format,is_active,last_verified_at").eq("is_active", true),
    supabase.from("book_growth_works").select("id,series_id,work_key,canonical_title,canonical_series_number,status,metadata"),
    supabase.from("book_growth_work_members").select("work_id,book_id,relation_type,confidence,verified"),
    supabase.from("book_growth_metrics").select("book_id,channel,marketplace,format,metric_date,impressions,clicks,orders,units,pages_read,royalties,ad_spend,ad_sales,ad_orders,currency,metrics,source").gte("metric_date", since90Date).limit(20000),
  ]);

  const error = titlesRes.error || seriesRes.error || recsRes.error || eventsRes.error || channelRes.error || worksRes.error || membersRes.error || metricsRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const titles = titlesRes.data ?? [];
  const series = seriesRes.data ?? [];
  const recs = recsRes.data ?? [];
  const events = eventsRes.data ?? [];
  const channels = channelRes.data ?? [];
  const works = worksRes.data ?? [];
  const members = membersRes.data ?? [];
  const metrics = metricsRes.data ?? [];

  const titleById = new Map(titles.map((row: any) => [String(row.id), row]));
  const seriesById = new Map(series.map((row: any) => [String(row.id), row]));
  const workById = new Map(works.map((row: any) => [String(row.id), row]));
  const memberByBookId = new Map(members.map((row: any) => [String(row.book_id), row]));

  const amazonByBook = new Map<string, any[]>();
  for (const row of channels.filter((row: any) => row.channel === "amazon")) {
    const key = String(row.book_id);
    const list = amazonByBook.get(key) ?? [];
    list.push(row);
    amazonByBook.set(key, list);
  }

  const eventsByBook = new Map<string, Record<string, number>>();
  for (const row of events as any[]) {
    const key = row.book_id ? String(row.book_id) : row.book_slug ? `slug:${row.book_slug}` : "";
    if (!key) continue;
    const counts = eventsByBook.get(key) ?? {};
    counts[row.event_type] = (counts[row.event_type] ?? 0) + 1;
    eventsByBook.set(key, counts);
  }

  const metricsByBook = new Map<string, { royalties: number; units: number; pagesRead: number; adSpend: number; adSales: number; orders: number; impressions: number; clicks: number; netEarnings: number; rows: number }>();
  for (const row of metrics as any[]) {
    if (!row.book_id) continue;
    const key = String(row.book_id);
    const agg = metricsByBook.get(key) ?? { royalties: 0, units: 0, pagesRead: 0, adSpend: 0, adSales: 0, orders: 0, impressions: 0, clicks: 0, netEarnings: 0, rows: 0 };
    agg.royalties += num(row.royalties);
    agg.units += num(row.units);
    agg.pagesRead += num(row.pages_read);
    agg.adSpend += num(row.ad_spend);
    agg.adSales += num(row.ad_sales);
    agg.orders += num(row.orders);
    agg.impressions += num(row.impressions);
    agg.clicks += num(row.clicks);
    agg.netEarnings += num(row.metrics?.net_earnings);
    agg.rows += 1;
    metricsByBook.set(key, agg);
  }

  const pendingByBook = new Map<string, number>();
  for (const row of recs as any[]) {
    if (row.status !== "pending" || !row.book_id) continue;
    const key = String(row.book_id);
    pendingByBook.set(key, (pendingByBook.get(key) ?? 0) + 1);
  }

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

  const priority = titles.map((book: any) => {
    const byId = eventsByBook.get(String(book.id)) ?? {};
    const bySlug = eventsByBook.get(`slug:${book.slug}`) ?? {};
    const counts = { ...bySlug };
    for (const [k, v] of Object.entries(byId)) counts[k] = (counts[k] ?? 0) + v;

    const bookViews = counts.book_view ?? 0;
    const sampleClicks = counts.sample_click ?? 0;
    const amazonClicks = counts.amazon_click ?? 0;
    const directBuyClicks = counts.direct_buy_click ?? 0;
    const asinRows = amazonByBook.get(String(book.id)) ?? [];
    const hasAsin = asinRows.some((row: any) => Boolean(row.external_id));
    const pendingCount = pendingByBook.get(String(book.id)) ?? 0;
    const member = memberByBookId.get(String(book.id));
    const work = member ? workById.get(String(member.work_id)) : null;
    const economic = metricsByBook.get(String(book.id)) ?? { royalties: 0, units: 0, pagesRead: 0, adSpend: 0, adSales: 0, orders: 0, impressions: 0, clicks: 0, netEarnings: 0, rows: 0 };

    const intentScore = bookViews + sampleClicks * 4 + amazonClicks * 6 + directBuyClicks * 8;
    const readinessGap = (hasAsin ? 0 : 12) + (book.cover_image_url ? 0 : 5) + (book.sample_pdf_path ? 0 : 4) + (member ? 0 : 6);
    const recommendationSignal = Math.min(pendingCount * 2, 10);
    const revenueLeverage = Math.min(economic.royalties * 1.5, 40) + Math.min(economic.units * 1.5, 25) + Math.min(economic.pagesRead / 1000, 15);
    const adWasteOpportunity = economic.adSpend > economic.royalties ? Math.min((economic.adSpend - economic.royalties) * 2, 30) : 0;
    const demandNoSalesOpportunity = economic.royalties === 0 && amazonClicks > 0 ? Math.min(amazonClicks * 4, 20) : 0;
    const economicScore = Math.round((revenueLeverage + adWasteOpportunity + demandNoSalesOpportunity) * 10) / 10;
    const score = Math.round((intentScore + readinessGap + recommendationSignal + economicScore) * 10) / 10;

    return {
      bookId: book.id,
      slug: book.slug,
      title: book.title,
      language: book.language,
      seriesId: book.series_id,
      seriesTitle: book.series_id ? titleText(seriesById.get(String(book.series_id))?.title) : null,
      seriesNumber: book.series_number,
      workId: work?.id ?? null,
      workKey: work?.work_key ?? null,
      workStatus: work?.status ?? null,
      workVerified: Boolean(member?.verified),
      asin: asinRows[0]?.external_id ?? null,
      asinCount: asinRows.filter((row: any) => Boolean(row.external_id)).length,
      hasAsin,
      pendingRecommendations: pendingCount,
      events30d: { bookViews, sampleClicks, amazonClicks, directBuyClicks },
      economics90d: economic,
      score,
      scoreComponents: { intentScore, readinessGap, recommendationSignal, economicScore, revenueLeverage, adWasteOpportunity, demandNoSalesOpportunity },
    };
  }).sort((a: any, b: any) => b.score - a.score || String(a.title).localeCompare(String(b.title)));

  const pending = recommendations.filter((row: any) => row.status === "pending");
  const eventCounts = countBy(events, (row: any) => String(row.event_type));
  const pendingByType = countBy(pending, (row: any) => String(row.recommendation_type));
  const asinLinkedBooks = titles.filter((row: any) => (amazonByBook.get(String(row.id)) ?? []).some((m: any) => Boolean(m.external_id))).length;
  const bookReportRows = metrics.filter((row: any) => row.source === "book_report");
  const booksWithEconomicData = new Set(metrics.filter((row: any) => row.book_id).map((row: any) => String(row.book_id))).size;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      totalBooks: titles.length,
      amazonLinked: titles.filter((row: any) => Boolean(row.amazon_url)).length,
      asinLinkedBooks,
      amazonMetadataRows: channels.filter((row: any) => row.channel === "amazon").length,
      normalizedWorks: works.length,
      normalizedMembers: members.length,
      verifiedWorkMembers: members.filter((row: any) => Boolean(row.verified)).length,
      covers: titles.filter((row: any) => Boolean(row.cover_image_url)).length,
      samples: titles.filter((row: any) => Boolean(row.sample_pdf_path)).length,
      pendingRecommendations: pending.length,
      approvedRecommendations: recommendations.filter((row: any) => row.status === "approved").length,
      appliedRecommendations: recommendations.filter((row: any) => row.status === "applied").length,
      events30d: events.length,
      amazonClicks30d: eventCounts.amazon_click ?? 0,
      sampleClicks30d: eventCounts.sample_click ?? 0,
      directBuyClicks30d: eventCounts.direct_buy_click ?? 0,
      bookViews30d: eventCounts.book_view ?? 0,
      economicMetricRows90d: metrics.length,
      bookReportRows90d: bookReportRows.length,
      booksWithEconomicData,
      royalties90d: Math.round(metrics.reduce((sum: number, row: any) => sum + num(row.royalties), 0) * 100) / 100,
      adSpend90d: Math.round(metrics.reduce((sum: number, row: any) => sum + num(row.ad_spend), 0) * 100) / 100,
      units90d: Math.round(metrics.reduce((sum: number, row: any) => sum + num(row.units), 0) * 100) / 100,
      pagesRead90d: Math.round(metrics.reduce((sum: number, row: any) => sum + num(row.pages_read), 0)),
    },
    sourceStatus: {
      bookReport: {
        ready: true,
        rows90d: bookReportRows.length,
        state: bookReportRows.length ? "data_available" : "awaiting_data",
      },
    },
    pendingByType,
    priority: priority.slice(0, 50),
    recommendations,
  });
}
