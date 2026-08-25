import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

type RawRow = Record<string, unknown>;

function n(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function s(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeChannel(distributor: string) {
  const d = distributor.toLowerCase();
  if (d.includes("kindle") || d.includes("kdp") || d.includes("amazon")) return "amazon";
  if (d.includes("draft2digital")) return "draft2digital";
  if (d.includes("kobo")) return "kobo";
  if (d.includes("apple")) return "apple_books";
  if (d.includes("barnes") || d.includes("noble")) return "barnes_noble";
  return d.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "book_report";
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const rows: RawRow[] = Array.isArray(body?.rows) ? body.rows : [];
  const currency = s(body?.currency) || "USD";
  const correlationId = s(body?.correlationId) || `book-report-${Date.now()}`;

  if (!rows.length) return NextResponse.json({ error: "rows må inneholde minst én Book Report-rad" }, { status: 400 });
  if (rows.length > 5000) return NextResponse.json({ error: "Maks 5000 rader per import" }, { status: 400 });

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const providerIds = [...new Set(rows.map((r) => s(r.book_id)).filter(Boolean))];
  const { data: metadata, error: metadataError } = providerIds.length
    ? await supabase
        .from("book_growth_channel_metadata")
        .select("book_id,channel,marketplace,external_id,format")
        .in("external_id", providerIds)
    : { data: [], error: null };
  if (metadataError) return NextResponse.json({ error: metadataError.message }, { status: 500 });

  const externalMap = new Map<string, string>();
  for (const row of metadata ?? []) {
    if (row.external_id && row.book_id) externalMap.set(String(row.external_id), String(row.book_id));
  }

  const payload = rows.map((row) => {
    const providerId = s(row.book_id);
    const distributor = s(row.distributor) || "Book Report";
    const format = s(row.format) || "ebook";
    const marketplace = s(row.marketplace) || "global";
    const metricDate = s(row.date) || s(body?.metricDate) || new Date().toISOString().slice(0, 10);
    const earnings = n(row.earnings);
    const sales = n(row.sales);
    const paidUnits = n(row.paid_units);
    const pagesRead = n(row.pages_read);
    const adSpend = n(row.ad_spend);
    const netEarnings = n(row.net_earnings);
    const impressions = n(row.impressions);
    const clicks = n(row.clicks);

    return {
      book_id: externalMap.get(providerId) ?? null,
      channel: normalizeChannel(distributor),
      marketplace,
      format: format.toLowerCase(),
      metric_date: metricDate,
      impressions,
      clicks,
      orders: sales,
      units: paidUnits,
      pages_read: pagesRead,
      gross_sales: 0,
      royalties: earnings,
      ad_spend: adSpend,
      ad_sales: 0,
      ad_orders: 0,
      sessions: 0,
      conversions: sales,
      currency,
      metrics: {
        source_book_id: providerId || null,
        book: s(row.book) || null,
        series: s(row.series) || null,
        distributor,
        net_earnings: netEarnings,
        raw: row,
      },
      source: "book_report",
      correlation_id: correlationId,
      imported_at: new Date().toISOString(),
    };
  });

  const matched = payload.filter((r) => Boolean(r.book_id));
  const unmatched = payload.filter((r) => !r.book_id);

  if (matched.length) {
    const { error } = await supabase.from("book_growth_metrics").upsert(matched, {
      onConflict: "book_id,channel,marketplace,format,metric_date,source",
      ignoreDuplicates: false,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    imported: matched.length,
    unmatched: unmatched.length,
    unmatchedProviderIds: [...new Set(unmatched.map((r) => String(r.metrics.source_book_id ?? "")).filter(Boolean))],
    correlationId,
    note: "Kun rader med provider-ID som matcher kjent channel metadata blir skrevet til book_growth_metrics. Ukjente IDs må normaliseres før de kan påvirke prioritetsscore.",
  });
}
