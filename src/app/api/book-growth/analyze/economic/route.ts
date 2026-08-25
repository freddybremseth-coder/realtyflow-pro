import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function n(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

  const [booksRes, metaRes, eventsRes, metricsRes, pendingRes] = await Promise.all([
    supabase.from("book_titles").select("id,slug,title,series_id,series_number,cover_image_url,sample_pdf_path,status"),
    supabase.from("book_growth_channel_metadata").select("book_id,channel,marketplace,external_id,is_active").eq("is_active", true),
    supabase.from("book_growth_events").select("book_id,book_slug,event_type,occurred_at").gte("occurred_at", since30).limit(10000),
    supabase.from("book_growth_metrics").select("book_id,channel,marketplace,royalties,ad_spend,units,pages_read,orders,impressions,clicks,source,metric_date").gte("metric_date", since90).limit(20000),
    supabase.from("book_growth_recommendations").select("book_id,recommendation_type,status").in("status", ["pending", "approved"]),
  ]);

  const error = booksRes.error || metaRes.error || eventsRes.error || metricsRes.error || pendingRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const books = (booksRes.data ?? []).filter((b: any) => b.status !== "archived");
  const metadata = metaRes.data ?? [];
  const events = eventsRes.data ?? [];
  const metrics = metricsRes.data ?? [];
  const existing = new Set((pendingRes.data ?? []).map((r: any) => `${r.book_id}:${r.recommendation_type}`));

  const amazonByBook = new Map<string, any[]>();
  for (const row of metadata.filter((m: any) => m.channel === "amazon")) {
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

  const economics = new Map<string, { royalties: number; adSpend: number; units: number; pagesRead: number; orders: number; impressions: number; clicks: number }>();
  for (const row of metrics as any[]) {
    if (!row.book_id) continue;
    const key = String(row.book_id);
    const agg = economics.get(key) ?? { royalties: 0, adSpend: 0, units: 0, pagesRead: 0, orders: 0, impressions: 0, clicks: 0 };
    agg.royalties += n(row.royalties);
    agg.adSpend += n(row.ad_spend);
    agg.units += n(row.units);
    agg.pagesRead += n(row.pages_read);
    agg.orders += n(row.orders);
    agg.impressions += n(row.impressions);
    agg.clicks += n(row.clicks);
    economics.set(key, agg);
  }

  const suggestions: any[] = [];
  const add = (book: any, type: string, expectedImpact: string, currentValue: unknown, proposedValue: unknown, evidence: unknown, confidence: number) => {
    const key = `${book.id}:${type}`;
    if (existing.has(key)) return;
    existing.add(key);
    suggestions.push({
      book_id: book.id,
      series_id: book.series_id ?? null,
      channel: "amazon",
      marketplace: "amazon.com",
      recommendation_type: type,
      current_value: currentValue,
      proposed_value: proposedValue,
      evidence,
      confidence,
      expected_impact: expectedImpact,
      status: "pending",
      created_by: "book_growth_economic_analyzer_v1",
      correlation_id: `economic-v1:${book.id}:${type}`,
    });
  };

  for (const book of books as any[]) {
    const byId = eventsByBook.get(String(book.id)) ?? {};
    const bySlug = eventsByBook.get(`slug:${book.slug}`) ?? {};
    const views = (byId.book_view ?? 0) + (bySlug.book_view ?? 0);
    const sampleClicks = (byId.sample_click ?? 0) + (bySlug.sample_click ?? 0);
    const amazonClicks = (byId.amazon_click ?? 0) + (bySlug.amazon_click ?? 0);
    const econ = economics.get(String(book.id)) ?? { royalties: 0, adSpend: 0, units: 0, pagesRead: 0, orders: 0, impressions: 0, clicks: 0 };
    const amazonRows = amazonByBook.get(String(book.id)) ?? [];
    const asin = amazonRows.find((r: any) => r.external_id)?.external_id ?? null;

    if (!asin && (views >= 2 || amazonClicks >= 1 || sampleClicks >= 1)) {
      add(book, "asin_linkage", "Høy: trafikk kan ikke kobles sikkert mot Amazon-resultater før ASIN er normalisert.",
        { asin: null },
        { action: "identify_and_verify_asin", book: book.title },
        { views30d: views, sampleClicks30d: sampleClicks, amazonClicks30d: amazonClicks },
        0.98);
    }

    if (asin && amazonClicks >= 2 && econ.royalties === 0 && econ.units === 0) {
      add(book, "conversion_gap", "Høy: lesere går til Amazon, men økonomidata viser ingen konvertering i målevinduet.",
        { amazonClicks30d: amazonClicks, royalties90d: econ.royalties, units90d: econ.units },
        { action: "audit_amazon_conversion", dimensions: ["cover", "subtitle", "description", "price", "reviews", "sample"] },
        { asin, amazonClicks30d: amazonClicks, royalties90d: econ.royalties, units90d: econ.units },
        0.86);
    }

    if (econ.adSpend >= 5 && econ.adSpend > Math.max(econ.royalties * 1.25, econ.royalties + 2)) {
      add(book, "ad_efficiency", "Høy: annonsekostnaden overstiger bokas registrerte royalties betydelig.",
        { adSpend90d: econ.adSpend, royalties90d: econ.royalties, impressions90d: econ.impressions, clicks90d: econ.clicks },
        { action: "review_ad_efficiency", dimensions: ["search_terms", "targets", "bids", "negative_keywords", "campaign_structure"] },
        { adSpend90d: econ.adSpend, royalties90d: econ.royalties, ratio: econ.royalties > 0 ? econ.adSpend / econ.royalties : null },
        0.9);
    }

    if (econ.units >= 3 && !book.sample_pdf_path) {
      add(book, "sample_asset", "Medium: en bok med dokumentert etterspørsel mangler sample på egen nettside.",
        { units90d: econ.units, sample: null },
        { action: "add_sample_asset" },
        { units90d: econ.units, royalties90d: econ.royalties },
        0.82);
    }

    if (econ.units >= 5 && book.series_id && book.series_number === 1) {
      add(book, "series_readthrough", "Høy: bok 1 har dokumentert salg og bør brukes til å måle og forbedre read-through til resten av serien.",
        { units90d: econ.units, pagesRead90d: econ.pagesRead },
        { action: "measure_series_readthrough", dimensions: ["book_2_conversion", "back_matter", "series_page", "bundle_or_cross_sell"] },
        { units90d: econ.units, royalties90d: econ.royalties, seriesNumber: book.series_number },
        0.88);
    }
  }

  if (!dryRun && suggestions.length) {
    const { error: insertError } = await supabase.from("book_growth_recommendations").insert(suggestions);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    generated: suggestions.length,
    suggestions,
    note: "Analyzer oppretter kun pending anbefalinger. Ingen Amazon/KDP/Ads-endringer utføres.",
  });
}
