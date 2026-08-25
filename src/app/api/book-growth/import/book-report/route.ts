import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

type RawRow = Record<string, unknown>;

type ChannelMetadataRow = {
  book_id: string | null;
  channel: string | null;
  marketplace: string | null;
  external_id: string | null;
  format: string | null;
  language: string | null;
  title: string | null;
  subtitle: string | null;
  product_url: string | null;
};

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

function normalizeFormat(value: unknown) {
  const f = s(value).toLowerCase();
  if (!f) return "";
  if (f.includes("kindle") || f.includes("ebook") || f.includes("e-book") || f === "digital") return "ebook";
  if (f.includes("paperback") || f.includes("softcover") || f.includes("soft cover")) return "paperback";
  if (f.includes("hardcover") || f.includes("hardback") || f.includes("hard cover")) return "hardcover";
  if (f.includes("audio")) return "audiobook";
  return f.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeLanguage(value: unknown) {
  const raw = s(value).toLowerCase();
  if (!raw) return "";
  if (["en", "eng", "english"].includes(raw)) return "en";
  if (["no", "nb", "nn", "nor", "norwegian", "norsk"].includes(raw)) return "no";
  if (["es", "spa", "spanish", "español", "espanol"].includes(raw)) return "es";
  if (["de", "deu", "ger", "german", "deutsch"].includes(raw)) return "de";
  return raw.slice(0, 12);
}

function differs(current: string | null | undefined, proposed: string) {
  if (!proposed) return false;
  return s(current).toLowerCase() !== proposed.toLowerCase();
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
        .select("book_id,channel,marketplace,external_id,format,language,title,subtitle,product_url")
        .in("external_id", providerIds)
    : { data: [], error: null };
  if (metadataError) return NextResponse.json({ error: metadataError.message }, { status: 500 });

  const metadataRows = (metadata ?? []) as ChannelMetadataRow[];
  const externalMap = new Map<string, string>();
  const metadataMap = new Map<string, ChannelMetadataRow>();
  for (const row of metadataRows) {
    if (row.external_id && row.book_id) {
      externalMap.set(String(row.external_id), String(row.book_id));
      metadataMap.set(String(row.external_id), row);
    }
  }

  const payload = rows.map((row) => {
    const providerId = s(row.book_id);
    const distributor = s(row.distributor) || "Book Report";
    const format = normalizeFormat(row.format) || "ebook";
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
      format,
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
        edition: s(row.edition) || null,
        product: s(row.product) || null,
        series: s(row.series) || null,
        language: s(row.language) || null,
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

  const metadataCandidates = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const providerId = s(row.book_id);
    const bookId = externalMap.get(providerId);
    const current = metadataMap.get(providerId);
    if (!providerId || !bookId || !current) continue;

    const distributor = s(row.distributor) || "Book Report";
    const channel = normalizeChannel(distributor);
    const marketplace = s(row.marketplace) || current.marketplace || "global";
    const proposedFormat = normalizeFormat(row.format);
    const proposedLanguage = normalizeLanguage(row.language);
    const proposedTitle = s(row.book);
    const proposedSubtitle = s(row.subtitle);
    const proposedProductUrl = s(row.product_url);

    const hasUsefulDifference =
      differs(current.format, proposedFormat) ||
      differs(current.language, proposedLanguage) ||
      differs(current.title, proposedTitle) ||
      differs(current.subtitle, proposedSubtitle) ||
      differs(current.product_url, proposedProductUrl);

    if (!hasUsefulDifference) continue;

    const key = [bookId, channel, marketplace, providerId, "book_report"].join("|");
    metadataCandidates.set(key, {
      book_id: bookId,
      channel,
      marketplace,
      external_id: providerId,
      proposed_format: proposedFormat || null,
      proposed_language: proposedLanguage || null,
      proposed_title: proposedTitle || null,
      proposed_subtitle: proposedSubtitle || null,
      proposed_product_url: proposedProductUrl || null,
      source: "book_report",
      evidence: {
        correlation_id: correlationId,
        distributor,
        edition: s(row.edition) || null,
        product: s(row.product) || null,
        raw_language: s(row.language) || null,
        raw_format: s(row.format) || null,
        source_book_id: providerId,
      },
      confidence: 0.98,
      status: "pending",
      updated_at: new Date().toISOString(),
    });
  }

  let metadataCandidateCount = 0;
  if (metadataCandidates.size) {
    const { data, error } = await supabase
      .from("book_growth_channel_metadata_candidates")
      .upsert([...metadataCandidates.values()], {
        onConflict: "book_id,channel,marketplace,external_id,source",
        ignoreDuplicates: false,
      })
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    metadataCandidateCount = data?.length ?? metadataCandidates.size;
  }

  return NextResponse.json({
    ok: true,
    imported: matched.length,
    unmatched: unmatched.length,
    metadataCandidates: metadataCandidateCount,
    unmatchedProviderIds: [...new Set(unmatched.map((r) => String(r.metrics.source_book_id ?? "")).filter(Boolean))],
    correlationId,
    note: "Kun rader med provider-ID som matcher kjent channel metadata blir skrevet til metrics. Book Report metadata blir separat lagret som pending channel-metadata-kandidater og påvirker ikke katalogen før eksplisitt approve/apply.",
  });
}
