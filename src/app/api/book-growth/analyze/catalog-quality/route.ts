import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function likelyLanguage(title: string) {
  const t = title.toLowerCase();
  if (/\b(the|your|how|money|works|power|olive|oil|relationship|journey|father|digital|life|premium|growing|psychology|economy|artificial|intelligence|crypto|explained)\b/.test(t)) return "en";
  if (/\b(la|máquina|sospecha|del|de|el)\b/.test(t) || /[áéíóúñ]/i.test(t)) return "es";
  if (/[æøå]/i.test(t) || /\b(og|som|ikke|hvordan|økonomien|psykologien|maktens|lev|kunsten|fra|jord|bord|våpenmakten)\b/.test(t)) return "no";
  return null;
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [booksRes, seriesRes, channelsRes, existingRes] = await Promise.all([
    supabase.from("book_titles").select("id,slug,title,language,series_id,series_number,amazon_url,cover_image_url,sample_pdf_path,status").eq("status", "published"),
    supabase.from("book_series").select("id,slug,title"),
    supabase.from("book_growth_channel_metadata").select("book_id,channel,marketplace,external_id,format,is_active").eq("is_active", true),
    supabase.from("book_growth_recommendations").select("id,book_id,recommendation_type,status,evidence").in("status", ["pending","approved"]),
  ]);
  const error = booksRes.error || seriesRes.error || channelsRes.error || existingRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const books = booksRes.data ?? [];
  const series = seriesRes.data ?? [];
  const channels = channelsRes.data ?? [];
  const existing = existingRes.data ?? [];
  const seriesById = new Map(series.map((s: any) => [String(s.id), s]));
  const amazonByBook = new Map<string, any[]>();
  for (const row of channels.filter((r: any) => r.channel === "amazon")) {
    const key = String(row.book_id);
    const list = amazonByBook.get(key) ?? [];
    list.push(row);
    amazonByBook.set(key, list);
  }

  const collisionKeys = new Set<string>();
  const ordinals = new Map<string, number>();
  for (const b of books as any[]) {
    if (!b.series_id || b.series_number == null) continue;
    const k = `${b.series_id}:${b.series_number}`;
    ordinals.set(k, (ordinals.get(k) ?? 0) + 1);
  }
  for (const [k, n] of ordinals) if (n > 1) collisionKeys.add(k);

  const proposals: any[] = [];
  const push = (book: any, type: string, currentValue: unknown, proposedValue: unknown, evidence: any, confidence: number, impact: string) => {
    const duplicate = existing.some((r: any) => String(r.book_id ?? "") === String(book.id) && r.recommendation_type === type && JSON.stringify(r.evidence ?? {}) === JSON.stringify(evidence));
    if (duplicate) return;
    proposals.push({
      book_id: book.id,
      series_id: book.series_id,
      channel: type === "asin_linkage" ? "amazon" : "catalog",
      marketplace: type === "asin_linkage" ? "amazon.com" : "global",
      recommendation_type: type,
      current_value: currentValue,
      proposed_value: proposedValue,
      evidence,
      confidence,
      expected_impact: impact,
      status: "pending",
      created_by: "catalog_quality_analyzer_v1",
    });
  };

  for (const book of books as any[]) {
    const amazon = amazonByBook.get(String(book.id)) ?? [];
    const hasAsin = amazon.some((r: any) => hasText(r.external_id));
    if (!hasAsin) {
      push(book, "asin_linkage", { asin: null, amazon_url: book.amazon_url ?? null }, { action: "discover_and_verify_asin" }, { rule: "missing_asin", bookSlug: book.slug }, 1, "Amazon identity is required for reliable sales attribution and marketplace optimization.");
    }
    if (!hasText(book.cover_image_url)) {
      push(book, "cover_asset", { cover_image_url: null }, { action: "add_verified_cover" }, { rule: "missing_cover", bookSlug: book.slug }, 1, "Missing cover weakens storefront quality and conversion readiness.");
    }
    if (!hasText(book.sample_pdf_path)) {
      push(book, "sample_asset", { sample_pdf_path: null }, { action: "add_sample" }, { rule: "missing_sample", bookSlug: book.slug }, 1, "A sample creates a measurable step between interest and purchase.");
    }

    const guessed = likelyLanguage(String(book.title ?? ""));
    if (guessed && book.language && guessed !== book.language) {
      push(book, "data_quality", { language: book.language }, { review_language: guessed }, { rule: "language_mismatch_heuristic", title: book.title, observed: book.language, likely: guessed }, 0.82, "Incorrect language metadata can distort edition grouping, SEO and marketplace targeting. Review required before any change.");
    }

    if (book.series_id && book.series_number != null && collisionKeys.has(`${book.series_id}:${book.series_number}`)) {
      const s = seriesById.get(String(book.series_id));
      push(book, "series_number", { series_number: book.series_number }, { action: "review_series_ordinal" }, { rule: "duplicate_series_number", seriesSlug: s?.slug ?? null, seriesNumber: book.series_number }, 1, "Duplicate ordinals make series order ambiguous and can damage read-through analysis.");
    }
  }

  if (!proposals.length) return NextResponse.json({ ok: true, inserted: 0, message: "No new catalog-quality recommendations" });
  const { data, error: insertError } = await supabase.from("book_growth_recommendations").insert(proposals).select("id,recommendation_type,book_id");
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const counts: Record<string, number> = {};
  for (const r of data ?? []) counts[r.recommendation_type] = (counts[r.recommendation_type] ?? 0) + 1;
  return NextResponse.json({ ok: true, inserted: data?.length ?? 0, counts });
}
