import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

type CandidateInput = {
  bookId?: string;
  bookSlug?: string;
  marketplace?: string;
  asin?: string;
  url?: string;
  title?: string;
  author?: string;
  format?: string;
  source?: string;
  confidence?: number;
  evidence?: Record<string, unknown>;
};

function normalizeAsin(value: unknown) {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(v) ? v : null;
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const rows: CandidateInput[] = Array.isArray(body?.candidates) ? body.candidates : [];
  if (!rows.length) return NextResponse.json({ error: "candidates[] er påkrevd" }, { status: 400 });

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const slugs = [...new Set(rows.map(r => typeof r.bookSlug === "string" ? r.bookSlug.trim() : "").filter(Boolean))];
  const ids = [...new Set(rows.map(r => typeof r.bookId === "string" ? r.bookId.trim() : "").filter(Boolean))];
  const [bySlugRes, byIdRes] = await Promise.all([
    slugs.length ? supabase.from("book_titles").select("id,slug,title,status").in("slug", slugs) : Promise.resolve({ data: [], error: null } as any),
    ids.length ? supabase.from("book_titles").select("id,slug,title,status").in("id", ids) : Promise.resolve({ data: [], error: null } as any),
  ]);
  const error = bySlugRes.error || byIdRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bookBySlug = new Map((bySlugRes.data ?? []).map((b: any) => [String(b.slug), b]));
  const bookById = new Map((byIdRes.data ?? []).map((b: any) => [String(b.id), b]));
  const inserts: any[] = [];
  const rejected: any[] = [];

  for (const row of rows) {
    const asin = normalizeAsin(row.asin);
    const book = row.bookId ? bookById.get(String(row.bookId)) : row.bookSlug ? bookBySlug.get(String(row.bookSlug)) : null;
    if (!book || book.status !== "published" || !asin) {
      rejected.push({ bookId: row.bookId ?? null, bookSlug: row.bookSlug ?? null, asin: row.asin ?? null, reason: !book ? "book_not_found" : !asin ? "invalid_asin" : "book_not_published" });
      continue;
    }
    const marketplace = typeof row.marketplace === "string" && row.marketplace.trim() ? row.marketplace.trim().toLowerCase() : "amazon.com";
    const url = typeof row.url === "string" && row.url.trim() ? row.url.trim() : `https://www.${marketplace}/dp/${asin}`;
    const confidence = typeof row.confidence === "number" ? Math.max(0, Math.min(1, row.confidence)) : null;
    inserts.push({
      book_id: book.id,
      marketplace,
      candidate_asin: asin,
      candidate_url: url,
      candidate_title: typeof row.title === "string" ? row.title.trim() || null : null,
      candidate_author: typeof row.author === "string" ? row.author.trim() || null : null,
      candidate_format: typeof row.format === "string" ? row.format.trim() || null : null,
      source: typeof row.source === "string" && row.source.trim() ? row.source.trim() : "web_discovery",
      confidence,
      evidence: row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence) ? row.evidence : {},
      status: "pending",
      updated_at: new Date().toISOString(),
    });
  }

  if (!inserts.length) return NextResponse.json({ ok: true, imported: 0, rejected });
  const { data, error: upsertError } = await supabase.from("book_growth_asin_candidates")
    .upsert(inserts, { onConflict: "book_id,marketplace,candidate_asin" })
    .select("id,book_id,marketplace,candidate_asin,confidence,status");
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  return NextResponse.json({ ok: true, imported: data?.length ?? 0, candidates: data ?? [], rejected });
}
