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

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [titlesRes, seriesRes, recsRes, eventsRes, channelRes, worksRes, membersRes] = await Promise.all([
    supabase.from("book_titles").select("id,slug,title,series_id,series_number,language,amazon_url,cover_image_url,sample_pdf_path,status").order("title"),
    supabase.from("book_series").select("id,slug,title").order("sort_order"),
    supabase.from("book_growth_recommendations").select("id,book_id,series_id,channel,marketplace,recommendation_type,current_value,proposed_value,evidence,confidence,expected_impact,status,created_at").order("created_at", { ascending: false }).limit(250),
    supabase.from("book_growth_events").select("book_id,book_slug,event_type,occurred_at").gte("occurred_at", since).limit(5000),
    supabase.from("book_growth_channel_metadata").select("book_id,channel,marketplace,external_id,format,is_active,last_verified_at").eq("is_active", true),
    supabase.from("book_growth_works").select("id,series_id,work_key,canonical_title,canonical_series_number,status,metadata"),
    supabase.from("book_growth_work_members").select("work_id,book_id,relation_type,confidence,verified"),
  ]);

  const error = titlesRes.error || seriesRes.error || recsRes.error || eventsRes.error || channelRes.error || worksRes.error || membersRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const titles = titlesRes.data ?? [];
  const series = seriesRes.data ?? [];
  const recs = recsRes.data ?? [];
  const events = eventsRes.data ?? [];
  const channels = channelRes.data ?? [];
  const works = worksRes.data ?? [];
  const members = membersRes.data ?? [];

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

    const intentScore = bookViews + sampleClicks * 4 + amazonClicks * 6 + directBuyClicks * 8;
    const readinessGap = (hasAsin ? 0 : 12) + (book.cover_image_url ? 0 : 5) + (book.sample_pdf_path ? 0 : 4) + (member ? 0 : 6);
    const recommendationSignal = Math.min(pendingCount * 2, 10);
    const score = intentScore + readinessGap + recommendationSignal;

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
      score,
      scoreComponents: { intentScore, readinessGap, recommendationSignal },
    };
  }).sort((a: any, b: any) => b.score - a.score || String(a.title).localeCompare(String(b.title)));

  const pending = recommendations.filter((row: any) => row.status === "pending");
  const eventCounts = countBy(events, (row: any) => String(row.event_type));
  const pendingByType = countBy(pending, (row: any) => String(row.recommendation_type));
  const asinLinkedBooks = titles.filter((row: any) => (amazonByBook.get(String(row.id)) ?? []).some((m: any) => Boolean(m.external_id))).length;

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
    },
    pendingByType,
    priority: priority.slice(0, 50),
    recommendations,
  });
}
