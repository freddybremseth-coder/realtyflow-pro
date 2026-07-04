import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ParsedRow = Record<string, string>;

type BookAggregate = {
  title: string;
  asin: string | null;
  marketplace: string;
  format: string;
  currency: string;
  orders: number;
  royalties: number;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[\s_\-()/.:]+/g, "").replace(/[^a-z0-9]/g, "");
}

function normalizeRow(row: Record<string, unknown>): ParsedRow {
  const normalized: ParsedRow = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeader(key)] = String(value ?? "").trim();
  }
  return normalized;
}

function pick(row: ParsedRow, keys: string[]) {
  for (const key of keys) {
    const value = row[normalizeHeader(key)];
    if (value) return value;
  }
  return "";
}

function parseNumber(value: string) {
  const cleaned = value
    .replace(/[^\d,.-]/g, "")
    .replace(/,(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeFormat(value: string) {
  const lower = value.toLowerCase();
  if (/paper|print/.test(lower)) return "paperback";
  if (/hard/.test(lower)) return "hardcover";
  if (/audio/.test(lower)) return "audio";
  if (/kindle|ebook|e-book|digital/.test(lower)) return "kindle";
  return "other";
}

function rowToAggregate(row: ParsedRow): BookAggregate | null {
  const title = pick(row, ["title", "book title", "booktitle", "product title", "producttitle"]);
  const asin = pick(row, ["asin", "parent asin", "parentasin", "child asin", "childasin"]) || null;
  if (!title && !asin) return null;

  const marketplace = pick(row, ["marketplace", "store", "amazon marketplace", "territory", "country"]) || "amazon.com";
  const rawFormat = pick(row, ["format", "product type", "producttype", "royalty type", "transaction type"]);
  const currency = pick(row, ["currency", "royalty currency", "royaltycurrency"]) || "USD";
  const orders = Math.round(
    parseNumber(pick(row, ["units sold", "unitssold", "ordered units", "orderedunits", "net units sold", "quantity", "units"])) || 0,
  );
  const royalties = parseNumber(
    pick(row, ["royalty", "royalties", "estimated royalty", "estimatedroyalty", "net royalty", "author royalty", "earnings"]),
  );

  return {
    title: title || asin || "Untitled KDP Book",
    asin,
    marketplace,
    format: normalizeFormat(rawFormat),
    currency,
    orders,
    royalties,
  };
}

function mergeAggregates(rows: ParsedRow[]) {
  const aggregates = new Map<string, BookAggregate>();
  let imported = 0;

  for (const row of rows) {
    const parsed = rowToAggregate(row);
    if (!parsed) continue;
    imported += 1;
    const key = parsed.asin ? `${parsed.asin}:${parsed.marketplace}` : `${parsed.title.toLowerCase()}:${parsed.marketplace}`;
    const existing = aggregates.get(key);
    if (existing) {
      existing.orders += parsed.orders;
      existing.royalties += parsed.royalties;
      if (!existing.asin && parsed.asin) existing.asin = parsed.asin;
    } else {
      aggregates.set(key, parsed);
    }
  }

  return { imported, books: Array.from(aggregates.values()) };
}

async function upsertBook(supabase: NonNullable<ReturnType<typeof getSupabase>>, book: BookAggregate) {
  let existing = null;

  if (book.asin) {
    const res = await supabase
      .from("publishing_books")
      .select("id,orders,royalties,title")
      .eq("asin", book.asin)
      .eq("marketplace", book.marketplace)
      .maybeSingle();
    if (res.error) throw res.error;
    existing = res.data;
  }

  if (!existing) {
    const res = await supabase
      .from("publishing_books")
      .select("id,orders,royalties,title")
      .ilike("title", book.title)
      .eq("marketplace", book.marketplace)
      .maybeSingle();
    if (res.error) throw res.error;
    existing = res.data;
  }

  if (existing) {
    const { error } = await supabase
      .from("publishing_books")
      .update({
        asin: book.asin,
        format: book.format,
        currency: book.currency,
        orders: Number(existing.orders || 0) + book.orders,
        royalties: Number(existing.royalties || 0) + book.royalties,
        status: "active",
        next_action: book.orders > 0 || book.royalties > 0
          ? "Analyser hvilke metadata/Ads/keywords som ga salg, og lag neste optimalisering."
          : "Sjekk metadata, cover og Ads-data etter import.",
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("publishing_books")
    .insert({
      brand_id: "freddypublishing",
      title: book.title,
      asin: book.asin,
      format: book.format,
      marketplace: book.marketplace,
      niche: "imported_kdp",
      role: "support",
      status: "active",
      currency: book.currency,
      orders: book.orders,
      royalties: book.royalties,
      priority: book.orders > 0 || book.royalties > 0 ? 75 : 50,
      next_action: "Importer metadata, coverstatus, keywords og Amazon-lenke.",
      last_checked_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });

  const text = await file.text();
  const fileHash = createHash("sha256").update(text).digest("hex");

  const existingImport = await supabase
    .from("kdp_report_imports")
    .select("id,file_name,created_at,summary")
    .eq("file_hash", fileHash)
    .maybeSingle();

  if (!existingImport.error && existingImport.data) {
    return NextResponse.json({
      duplicate: true,
      message: `Denne rapporten er allerede importert (${existingImport.data.file_name}).`,
      import: existingImport.data,
    });
  }

  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return NextResponse.json({ error: parsed.errors[0]?.message || "Could not parse report" }, { status: 400 });
  }

  const normalizedRows = parsed.data.map(normalizeRow);
  const aggregate = mergeAggregates(normalizedRows);
  if (aggregate.books.length === 0) {
    return NextResponse.json({
      error: "Fant ingen bokrader. Last opp en KDP CSV/TSV med tittel eller ASIN.",
      rows_total: parsed.data.length,
    }, { status: 400 });
  }

  const touchedIds = [];
  for (const book of aggregate.books) {
    touchedIds.push(await upsertBook(supabase, book));
  }

  const totalOrders = aggregate.books.reduce((sum, book) => sum + book.orders, 0);
  const totalRoyalties = aggregate.books.reduce((sum, book) => sum + book.royalties, 0);
  const currency = aggregate.books.find((book) => book.currency)?.currency || "USD";

  const summary = {
    books: aggregate.books,
    touched_ids: touchedIds,
  };

  const { data: importRow, error: importError } = await supabase
    .from("kdp_report_imports")
    .insert({
      file_name: file.name,
      file_hash: fileHash,
      rows_total: parsed.data.length,
      rows_imported: aggregate.imported,
      books_touched: new Set(touchedIds).size,
      total_orders: totalOrders,
      total_royalties: totalRoyalties,
      currency,
      summary,
    })
    .select()
    .single();

  if (importError) return NextResponse.json({ error: importError.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    import: importRow,
    rows_total: parsed.data.length,
    rows_imported: aggregate.imported,
    books_touched: new Set(touchedIds).size,
    total_orders: totalOrders,
    total_royalties: totalRoyalties,
    currency,
  });
}
